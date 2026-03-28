// ─── Core domain types (matching backend schemas) ────────────────────────────

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  status?: string;
  custom_status?: string | null;
  bio?: string | null;
}

export interface Guild {
  id: string;
  name: string;
  owner_id: string;
  icon_url: string | null;
  created_at: string;
}

export interface Channel {
  id: string;
  guild_id: string | null;
  category_id: string | null;
  name: string;
  type: 'text' | 'voice' | 'dm' | 'group_dm' | 'stage' | 'forum' | 'announcement';
  position: number;
  topic: string | null;
  slowmode_delay?: number;
}

export interface Category {
  id: string;
  guild_id: string;
  name: string;
  position: number;
}

export interface Message {
  id: string;
  channel_id: string;
  author: User;
  content: string;
  is_edited: boolean;
  attachments: Attachment[];
  reactions: Reaction[];
  created_at: string;
  updated_at: string;
  reply_to_id?: string | null;
  reply_to?: Message | null;
  is_pinned?: boolean;
}

export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface DMThread {
  id: string;
  channel_id: string;
  name: string | null;
  participants: User[];
}

export interface VoiceParticipant {
  user: User;
  is_muted: boolean;
  is_deafened: boolean;
}

export interface Role {
  id: string;
  guild_id: string;
  name: string;
  color: number;
  icon_emoji?: string | null;
  hoist: boolean;
  mentionable?: boolean;
  position: number;
  permissions: number;
  is_default: boolean;
  created_at: string;
}

export interface GuildMember {
  guild_id: string;
  user_id: string;
  joined_at: string;
  nickname: string | null;
  user: User;
}

export interface MemberRole {
  guild_id: string;
  user_id: string;
  role_id: string;
}

export interface PermissionEntry {
  key: string;
  label: string;
  description: string;
  value: number;
  category: string;
  critical: boolean;
}

export interface RoleAuditLog {
  id: string;
  guild_id: string;
  role_id: string | null;
  actor_id: string;
  action: string;
  details: string | null;
  created_at: string;
}

export interface Invite {
  code: string;
  guild: Guild;
  channel: Channel;
  creator: User;
  uses: number;
  max_uses: number | null;
  expires_at: string | null;
}

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

export interface WSEvent {
  event: string;
  data: unknown;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedMessages {
  items: Message[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

// ─── Social ───────────────────────────────────────────────────────────────────

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  sender?: User;
  receiver?: User;
}

export interface Webhook {
  id: string;
  guild_id: string;
  channel_id: string;
  creator_id: string | null;
  name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface NotificationSetting {
  id: string;
  user_id: string;
  level: 'all_messages' | 'only_mentions' | 'nothing' | 'default';
  muted: boolean;
  created_at: string;
}

// ─── Voice state ──────────────────────────────────────────────────────────────

export interface VoiceState {
  channelId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  participants: VoiceParticipant[];
}

// ─── User Notes ───────────────────────────────────────────────────────────────

export interface UserNote {
  id: string;
  owner_id: string;
  target_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// ─── Read State ───────────────────────────────────────────────────────────────

export interface ReadState {
  user_id: string;
  channel_id: string;
  last_message_id: string;
  updated_at: string;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface GuildStats {
  member_count: number;
  online_count: number;
}

export interface ChannelStats {
  message_count: number;
}

// ─── Screen Sharing ───────────────────────────────────────────────────────────

export interface ScreenShareSession {
  id: string;
  channel_id: string;
  user_id: string;
  stream_key: string;
  is_active: boolean;
  started_at: string;
  ended_at: string | null;
}

// ─── Guild Events ─────────────────────────────────────────────────────────────

export interface GuildEvent {
  id: string;
  guild_id: string;
  creator_id: string | null;
  name: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string | null;
  status: string;
  created_at: string;
}

// ─── Polls ────────────────────────────────────────────────────────────────────

export interface Poll {
  id: string;
  channel_id: string;
  creator_id: string | null;
  question: string;
  options: string; // JSON string of string[]
  expires_at: string | null;
  created_at: string;
}

export interface PollResult {
  poll_id: string;
  results: Record<number, number>;
}

// ─── Threads ──────────────────────────────────────────────────────────────────

export interface ThreadMeta {
  id: string;
  channel_id: string;
  parent_message_id: string | null;
  is_locked: boolean;
  auto_archive_minutes: number;
  created_at: string;
}

// ─── User Activity ────────────────────────────────────────────────────────────

export interface UserActivityInfo {
  id: string;
  user_id: string;
  activity_type: string;
  activity_name: string;
  details: string | null;
  started_at: string;
}

// ─── Guild Emoji ──────────────────────────────────────────────────────────────

export interface GuildEmoji {
  id: string;
  guild_id: string;
  name: string;
  image_url: string;
  creator_id: string | null;
  created_at: string;
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export interface BookmarkEntry {
  id: string;
  user_id: string;
  message_id: string;
  note: string | null;
  created_at: string;
}

// ─── Guild Settings ───────────────────────────────────────────────────────────

export interface GuildSettingsInfo {
  id: string;
  guild_id: string;
  afk_channel_id: string | null;
  afk_timeout: number;
  default_notifications: string;
  system_channel_id: string | null;
}

// ─── Guild Template ───────────────────────────────────────────────────────────

export interface GuildTemplateInfo {
  id: string;
  guild_id: string;
  creator_id: string | null;
  name: string;
  description: string | null;
  template_data: string;
  created_at: string;
}

// ─── Sound Effects ────────────────────────────────────────────────────────────

export interface SoundEffect {
  id: string;
  guild_id: string;
  name: string;
  file_url: string;
  duration_ms: number;
  creator_id: string | null;
  created_at: string;
}

// ─── Reminders ────────────────────────────────────────────────────────────────

export interface ReminderInfo {
  id: string;
  user_id: string;
  channel_id: string | null;
  content: string;
  remind_at: string;
  is_delivered: boolean;
  created_at: string;
}

// ─── Auto-mod Rules ───────────────────────────────────────────────────────────

export interface AutoModRule {
  id: string;
  guild_id: string;
  name: string;
  trigger_type: string;
  trigger_metadata: string;
  action_type: string;
  action_metadata: string | null;
  enabled: boolean;
  creator_id: string | null;
  created_at: string;
}

// ─── User Slowmode ────────────────────────────────────────────────────────────

export interface UserSlowmodeInfo {
  id: string;
  channel_id: string;
  user_id: string;
  delay_seconds: number;
  expires_at: string | null;
  set_by: string | null;
  created_at: string;
}

// ─── Stickers ─────────────────────────────────────────────────────────────────

export interface GuildSticker {
  id: string;
  guild_id: string;
  name: string;
  description: string | null;
  image_url: string;
  tags: string | null;
  creator_id: string | null;
  created_at: string;
}

// ─── User Badges ──────────────────────────────────────────────────────────────

export interface UserBadge {
  id: string;
  user_id: string;
  badge_name: string;
  badge_icon: string | null;
  awarded_at: string;
  description: string | null;
}

// ─── Guild Tags ───────────────────────────────────────────────────────────────

export interface GuildTagInfo {
  id: string;
  guild_id: string;
  tag: string;
}

// ─── Vanity Invite ────────────────────────────────────────────────────────────

export interface VanityInviteInfo {
  id: string;
  guild_id: string;
  code: string;
  created_at: string;
}

// ─── Extended Audit Log ───────────────────────────────────────────────────────

export interface ExtendedAuditLogEntry {
  id: string;
  guild_id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  changes: string | null;
  reason: string | null;
  created_at: string;
}

// ─── User Connections ─────────────────────────────────────────────────────────

export interface UserConnectionInfo {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string;
  provider_name: string | null;
  is_visible: boolean;
  created_at: string;
}
