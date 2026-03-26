import type {
  Channel,
  Category,
  DMThread,
  Guild,
  Invite,
  LoginRequest,
  Message,
  RegisterRequest,
  Role,
  TokenResponse,
  User,
  VoiceParticipant,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const PREFIX = `${API_URL}/api/v1`;

// ─── Token storage ────────────────────────────────────────────────────────────

let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  _accessToken = access;
  _refreshToken = refresh;
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function loadTokensFromStorage(): { access: string | null; refresh: string | null } {
  _accessToken = localStorage.getItem('access_token');
  _refreshToken = localStorage.getItem('refresh_token');
  return { access: _accessToken, refresh: _refreshToken };
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// ─── HTTP client ──────────────────────────────────────────────────────────────

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (!options.skipAuth && _accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  let res = await fetch(`${PREFIX}${path}`, { ...options, headers });

  // Attempt token refresh on 401
  if (res.status === 401 && _refreshToken && !options.skipAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
      res = await fetch(`${PREFIX}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  if (!_refreshToken) return false;
  try {
    const data = await request<TokenResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: _refreshToken }),
      skipAuth: true,
    });
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

// Multipart form upload (for attachments)
async function upload<T>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`;
  const res = await fetch(`${PREFIX}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch {
      // ignore
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (body: LoginRequest) =>
    request<TokenResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body), skipAuth: true }),

  register: (body: RegisterRequest) =>
    request<TokenResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body), skipAuth: true }),

  logout: (refresh_token: string) =>
    request<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token }) }),

  me: () => request<User>('/auth/me'),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  getById: (id: string) => request<User>(`/users/${id}`),
  updateMe: (data: Partial<Pick<User, 'display_name' | 'avatar_url'>>) =>
    request<User>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
};

// ─── Guilds ───────────────────────────────────────────────────────────────────

export const guildsApi = {
  list: () => request<Guild[]>('/guilds/'),
  get: (id: string) => request<Guild>(`/guilds/${id}`),
  create: (name: string) => request<Guild>('/guilds/', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: string, data: Partial<Pick<Guild, 'name'>>) =>
    request<Guild>(`/guilds/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/guilds/${id}`, { method: 'DELETE' }),
  leave: (id: string) => request<void>(`/guilds/${id}/members/me`, { method: 'DELETE' }),
  members: (id: string) => request<User[]>(`/guilds/${id}/members`),
};

// ─── Channels & Categories ────────────────────────────────────────────────────

export const channelsApi = {
  list: (guildId: string) => request<Channel[]>(`/guilds/${guildId}/channels`),
  listCategories: (guildId: string) => request<Category[]>(`/guilds/${guildId}/categories`),
  get: (id: string) => request<Channel>(`/channels/${id}`),
  create: (
    guildId: string,
    data: Pick<Channel, 'name' | 'type'> & { category_id?: string; topic?: string; is_nsfw?: boolean; position?: number },
  ) => request<Channel>(`/guilds/${guildId}/channels`, { method: 'POST', body: JSON.stringify(data) }),
  createCategory: (guildId: string, data: { name: string; position?: number }) =>
    request<Category>(`/guilds/${guildId}/categories`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Pick<Channel, 'name' | 'topic' | 'position'>>) =>
    request<Channel>(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/channels/${id}`, { method: 'DELETE' }),
};

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messagesApi = {
  list: (channelId: string, params?: { before?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.before) qs.set('before', params.before);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString() ? `?${qs}` : '';
    return request<Message[]>(`/channels/${channelId}/messages${q}`);
  },
  send: (channelId: string, content: string) =>
    request<Message>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  edit: (channelId: string, messageId: string, content: string) =>
    request<Message>(`/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  delete: (channelId: string, messageId: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' }),
  react: (channelId: string, messageId: string, emoji: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'POST',
    }),
  unreact: (channelId: string, messageId: string, emoji: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    }),
};

// ─── Attachments ──────────────────────────────────────────────────────────────

export const attachmentsApi = {
  upload: (channelId: string, messageId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return upload<{ url: string; filename: string; id: string }>(`/channels/${channelId}/messages/${messageId}/attachments`, fd);
  },
};

// ─── DMs ──────────────────────────────────────────────────────────────────────

export const dmsApi = {
  list: () => request<DMThread[]>('/dms/'),
  get: (threadId: string) => request<DMThread>(`/dms/${threadId}`),
  create: (userId: string) => request<DMThread>('/dms', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  messages: (channelId: string, params?: { before?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.before) qs.set('before', params.before);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString() ? `?${qs}` : '';
    return request<Message[]>(`/dms/${channelId}/messages${q}`);
  },
  send: (channelId: string, content: string) =>
    request<Message>(`/dms/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
};

// ─── Invites ──────────────────────────────────────────────────────────────────

export const invitesApi = {
  // expires_in is in seconds (matches backend InviteCreate schema)
  create: (guildId: string, channelId: string, max_uses?: number, expires_in?: number) =>
    request<Invite>('/invites/', {
      method: 'POST',
      body: JSON.stringify({ guild_id: guildId, channel_id: channelId, max_uses, expires_in }),
    }),
  get: (code: string) => request<Invite>(`/invites/${code}`),
  join: (code: string) => request<{ guild_id: string }>(`/invites/${code}/accept`, { method: 'POST' }),
  delete: (code: string) => request<void>(`/invites/${code}`, { method: 'DELETE' }),
};

// ─── Roles ────────────────────────────────────────────────────────────────────

export const rolesApi = {
  list: (guildId: string) => request<Role[]>(`/guilds/${guildId}/roles`),
  create: (guildId: string, data: Pick<Role, 'name' | 'color' | 'permissions'>) =>
    request<Role>(`/guilds/${guildId}/roles`, { method: 'POST', body: JSON.stringify(data) }),
  update: (guildId: string, roleId: string, data: Partial<Pick<Role, 'name' | 'color' | 'permissions'>>) =>
    request<Role>(`/guilds/${guildId}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (guildId: string, roleId: string) =>
    request<void>(`/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' }),
};

// ─── Moderation ───────────────────────────────────────────────────────────────

export const moderationApi = {
  kick: (guildId: string, userId: string) =>
    request<void>(`/guilds/${guildId}/members/${userId}`, { method: 'DELETE' }),
  ban: (guildId: string, userId: string, reason?: string) =>
    request<void>(`/guilds/${guildId}/bans/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    }),
  unban: (guildId: string, userId: string) =>
    request<void>(`/guilds/${guildId}/bans/${userId}`, { method: 'DELETE' }),
};

// ─── Voice ────────────────────────────────────────────────────────────────────

export const voiceApi = {
  getParticipants: (channelId: string) =>
    request<VoiceParticipant[]>(`/voice/channels/${channelId}/participants`),
  join: (channelId: string) =>
    request<void>(`/voice/channels/${channelId}/join`, { method: 'POST' }),
  leave: (channelId: string) =>
    request<void>(`/voice/channels/${channelId}/leave`, { method: 'POST' }),
};
