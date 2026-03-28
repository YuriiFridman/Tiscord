import type {
  Channel,
  Category,
  ChannelStats,
  DMThread,
  FriendRequest,
  Guild,
  GuildStats,
  Invite,
  LoginRequest,
  Message,
  NotificationSetting,
  GuildMember,
  MemberRole,
  PermissionEntry,
  ReadState,
  RegisterRequest,
  Role,
  RoleAuditLog,
  TokenResponse,
  User,
  UserNote,
  VoiceParticipant,
  Webhook,
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

  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  getById: (id: string) => request<User>(`/users/${id}`),
  searchByUsername: (username: string) => {
    const qs = new URLSearchParams({ q: username });
    return request<User[]>(`/users/search?${qs}`);
  },
  updateMe: (data: Partial<Pick<User, 'display_name' | 'avatar_url' | 'status' | 'custom_status' | 'bio'>>) =>
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
  members: (id: string) => request<GuildMember[]>(`/guilds/${id}/members`),
  stats: (id: string) => request<GuildStats>(`/guilds/${id}/stats`),
  updateNickname: (guildId: string, nickname: string | null) =>
    request<GuildMember>(`/guilds/${guildId}/members/me/nickname`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
    }),
  transferOwnership: (guildId: string, newOwnerId: string) =>
    request<Guild>(`/guilds/${guildId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ new_owner_id: newOwnerId }),
    }),
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
  send: (channelId: string, content: string, reply_to_id?: string) =>
    request<Message>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, ...(reply_to_id ? { reply_to_id } : {}) }),
    }),
  edit: (channelId: string, messageId: string, content: string) =>
    request<Message>(`/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  delete: (channelId: string, messageId: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' }),
  bulkDelete: (channelId: string, messageIds: string[]) =>
    request<void>(`/channels/${channelId}/messages/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ message_ids: messageIds }),
    }),
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
  listMemberRoles: (guildId: string) => request<MemberRole[]>(`/guilds/${guildId}/member-roles`),
  listTemplates: () => request<string[]>('/role-templates'),
  listPermissions: () => request<PermissionEntry[]>('/permissions'),
  listAudit: (guildId: string) => request<RoleAuditLog[]>(`/guilds/${guildId}/roles/audit`),
  create: (guildId: string, data: Pick<Role, 'name' | 'color' | 'permissions' | 'hoist' | 'position' | 'mentionable' | 'icon_emoji'>) =>
    request<Role>(`/guilds/${guildId}/roles`, { method: 'POST', body: JSON.stringify(data) }),
  createFromTemplate: (guildId: string, data: { template: string; name?: string; position?: number }) =>
    request<Role>(`/guilds/${guildId}/roles/template`, { method: 'POST', body: JSON.stringify(data) }),
  update: (guildId: string, roleId: string, data: Partial<Pick<Role, 'name' | 'color' | 'permissions' | 'hoist' | 'position' | 'mentionable' | 'icon_emoji'>>) =>
    request<Role>(`/guilds/${guildId}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  duplicate: (guildId: string, roleId: string) =>
    request<Role>(`/guilds/${guildId}/roles/${roleId}/duplicate`, { method: 'POST' }),
  delete: (guildId: string, roleId: string) =>
    request<void>(`/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' }),
  reorder: (guildId: string, items: Array<{ role_id: string; position: number }>) =>
    request<void>(`/guilds/${guildId}/role-reorder`, { method: 'PATCH', body: JSON.stringify({ items }) }),
  assignToMember: (guildId: string, roleId: string, userId: string) =>
    request<MemberRole>(
      `/guilds/${guildId}/roles/${roleId}/members/${userId}`,
      { method: 'POST' },
    ),
  removeFromMember: (guildId: string, roleId: string, userId: string) =>
    request<void>(`/guilds/${guildId}/roles/${roleId}/members/${userId}`, { method: 'DELETE' }),
  bulkAssign: (guildId: string, roleId: string, user_ids: string[]) =>
    request<void>(`/guilds/${guildId}/roles/bulk-assign`, { method: 'POST', body: JSON.stringify({ role_id: roleId, user_ids }) }),
  bulkRemove: (guildId: string, roleId: string, user_ids: string[]) =>
    request<void>(`/guilds/${guildId}/roles/bulk-remove`, { method: 'DELETE', body: JSON.stringify({ role_id: roleId, user_ids }) }),
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
  setState: (channelId: string, data: { is_muted?: boolean; is_deafened?: boolean }) =>
    request<{ ok: boolean }>(`/voice/channels/${channelId}/state`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ─── Friends ──────────────────────────────────────────────────────────────────

export const friendsApi = {
  list: () => request<FriendRequest[]>('/friends'),
  requests: () => request<FriendRequest[]>('/friends/requests'),
  send: (receiverId: string) =>
    request<FriendRequest>('/friends/requests', { method: 'POST', body: JSON.stringify({ receiver_id: receiverId }) }),
  respond: (requestId: string, action: 'accept' | 'reject') =>
    request<FriendRequest>(`/friends/requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  remove: (userId: string) => request<void>(`/friends/${userId}`, { method: 'DELETE' }),
  blocked: () => request<FriendRequest[]>('/users/blocked'),
  block: (userId: string) => request<void>(`/users/${userId}/block`, { method: 'POST' }),
  unblock: (userId: string) => request<void>(`/users/${userId}/block`, { method: 'DELETE' }),
};

// ─── Pins ─────────────────────────────────────────────────────────────────────

export const pinsApi = {
  list: (channelId: string) => request<Message[]>(`/channels/${channelId}/pins`),
  pin: (channelId: string, messageId: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}/pin`, { method: 'POST' }),
  unpin: (channelId: string, messageId: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}/pin`, { method: 'DELETE' }),
};

// ─── Search ───────────────────────────────────────────────────────────────────

export const searchApi = {
  messages: (channelId: string, q: string, limit = 50) => {
    const qs = new URLSearchParams({ q, limit: String(limit) });
    return request<Message[]>(`/channels/${channelId}/messages/search?${qs}`);
  },
};

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export const webhooksApi = {
  list: (guildId: string) => request<Webhook[]>(`/guilds/${guildId}/webhooks`),
  create: (guildId: string, data: { channel_id: string; name: string }) =>
    request<Webhook>(`/guilds/${guildId}/webhooks`, { method: 'POST', body: JSON.stringify(data) }),
  delete: (webhookId: string) => request<void>(`/webhooks/${webhookId}`, { method: 'DELETE' }),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  getGuild: (guildId: string) => request<NotificationSetting>(`/guilds/${guildId}/notification-settings`),
  updateGuild: (guildId: string, data: { level?: string; muted?: boolean }) =>
    request<NotificationSetting>(`/guilds/${guildId}/notification-settings`, { method: 'PUT', body: JSON.stringify(data) }),
  getChannel: (channelId: string) => request<NotificationSetting>(`/channels/${channelId}/notification-settings`),
  updateChannel: (channelId: string, data: { level?: string; muted?: boolean }) =>
    request<NotificationSetting>(`/channels/${channelId}/notification-settings`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── User Notes ───────────────────────────────────────────────────────────────

export const userNotesApi = {
  get: (userId: string) => request<UserNote | null>(`/users/${userId}/notes`),
  set: (userId: string, content: string) =>
    request<UserNote>(`/users/${userId}/notes`, { method: 'PUT', body: JSON.stringify({ content }) }),
  remove: (userId: string) => request<void>(`/users/${userId}/notes`, { method: 'DELETE' }),
};

// ─── Channel Stats ────────────────────────────────────────────────────────────

export const channelStatsApi = {
  get: (channelId: string) => request<ChannelStats>(`/channels/${channelId}/stats`),
};

// ─── Read State (Unread Tracking) ─────────────────────────────────────────────

export const readStateApi = {
  get: (channelId: string) => request<ReadState | null>(`/channels/${channelId}/ack`),
  set: (channelId: string, lastMessageId: string) =>
    request<ReadState>(`/channels/${channelId}/ack`, {
      method: 'PUT',
      body: JSON.stringify({ last_message_id: lastMessageId }),
    }),
};
