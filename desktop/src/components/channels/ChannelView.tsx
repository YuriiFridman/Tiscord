import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Channel, Guild, GuildMember, MemberRole, Message, Role } from '@/types';
import { guildsApi, pinsApi, rolesApi } from '@/lib/api';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import MessageSearch from './MessageSearch';
import VoiceChannel from '@/components/voice/VoiceChannel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatTime, getInitials, roleColorToHex } from '@/lib/utils';
import { usePresenceStore } from '@/store/presence';
import UserProfileCard from '@/components/user/UserProfileCard';

interface Props {
  channel: Channel;
  guild: Guild;
}

export default function ChannelView({ channel, guild }: Props) {
  const { t } = useTranslation();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const getStatus = usePresenceStore((s) => s.getStatus);

  const { data: pins = [] } = useQuery<Message[]>({
    queryKey: ['pins', channel.id],
    queryFn: () => pinsApi.list(channel.id),
    enabled: showPins,
  });
  const { data: guildMembers = [] } = useQuery<GuildMember[]>({
    queryKey: ['guildMembers', guild.id],
    queryFn: () => guildsApi.members(guild.id),
  });
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles', guild.id],
    queryFn: () => rolesApi.list(guild.id),
  });
  const { data: memberRoles = [] } = useQuery<MemberRole[]>({
    queryKey: ['memberRoles', guild.id],
    queryFn: () => rolesApi.listMemberRoles(guild.id),
  });

  if (channel.type === 'voice') {
    return <VoiceChannel channelId={channel.id} channelName={channel.name} />;
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-chat)' }}>
      <div className="flex flex-1 flex-col min-w-0">
        {/* Channel header */}
        <div
          className="flex h-12 shrink-0 items-center gap-2 border-b px-4 shadow-sm"
          style={{ background: 'var(--bg-primary)', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
            <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
          </svg>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {channel.name}
          </span>
          {channel.topic && (
            <>
              <span className="mx-2 h-4 w-px" style={{ background: 'var(--text-muted)' }} />
              <span className="truncate text-sm" style={{ color: 'var(--text-muted)' }}>
                {channel.topic}
              </span>
            </>
          )}

          {/* Header action buttons */}
          <div className="ml-auto flex items-center gap-1">
            {/* Pinned messages button */}
            <button
              onClick={() => { setShowPins((v) => !v); setShowSearch(false); }}
              className="rounded p-1.5 transition-colors hover:bg-white/10"
              style={{ color: showPins ? 'var(--text-primary)' : 'var(--text-muted)' }}
              title={t('pins.title')}
            >
              📌
            </button>

            {/* Search button */}
            <button
              onClick={() => { setShowSearch((v) => !v); setShowPins(false); }}
              className="rounded p-1.5 transition-colors hover:bg-white/10"
              style={{ color: showSearch ? 'var(--text-primary)' : 'var(--text-muted)' }}
              title={t('search.placeholder')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <MessageList channelId={channel.id} guildId={guild.id} onReply={setReplyTo} />

        {/* Input */}
        <MessageInput
          channelId={channel.id}
          guildId={guild.id}
          placeholder={t('messages.type_message_to', { name: channel.name })}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      {/* Pins panel */}
      {showPins && (
        <div
          className="flex h-full w-80 shrink-0 flex-col border-l"
          style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="flex h-12 shrink-0 items-center justify-between border-b px-4"
            style={{ background: 'var(--bg-primary)', borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              📌 {t('pins.title')}
            </span>
            <button
              onClick={() => setShowPins(false)}
              className="rounded p-1 hover:bg-white/10 transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          </div>
          <ScrollArea className="flex-1 p-3">
            {pins.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2">
                <span className="text-3xl">📌</span>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('pins.no_pins')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pins.map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-lg p-3 text-sm"
                    style={{ background: 'var(--bg-tertiary)' }}
                  >
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
                        {msg.author.display_name || msg.author.username}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                    <p className="break-words text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {msg.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      {/* Search panel */}
      {showSearch && <MessageSearch channelId={channel.id} onClose={() => setShowSearch(false)} />}

      {/* Members panel */}
      <div
        className="flex h-full w-60 shrink-0 flex-col border-l"
        style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <ScrollArea className="flex-1 pt-4 px-2">
          <MemberGroups
            guildMembers={guildMembers}
            roles={roles}
            memberRoles={memberRoles}
            getStatus={getStatus}
            onlineLabel={t('status.online')}
            offlineLabel={t('status.offline')}
          />
        </ScrollArea>
      </div>
    </div>
  );
}

function MemberGroups({
  guildMembers,
  roles,
  memberRoles,
  getStatus,
  onlineLabel,
  offlineLabel,
}: {
  guildMembers: GuildMember[];
  roles: Role[];
  memberRoles: MemberRole[];
  getStatus: (userId: string) => string;
  onlineLabel: string;
  offlineLabel: string;
}) {
  const hoistedRoles = roles.filter((r) => r.hoist && !r.is_default).sort((a, b) => b.position - a.position);
  const rolesByUser = new Map<string, Role[]>();
  for (const member of guildMembers) rolesByUser.set(member.user_id, []);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  for (const mr of memberRoles) {
    const role = roleById.get(mr.role_id);
    if (!role) continue;
    const existing = rolesByUser.get(mr.user_id);
    if (!existing) continue;
    existing.push(role);
  }

  const statusOf = (member: GuildMember) => getEffectiveStatus(member, getStatus);

  const isOnlineLike = (member: GuildMember) => {
    const status = statusOf(member);
    return status === 'online' || status === 'idle' || status === 'dnd';
  };

  // Get the top (highest position) role for coloring the member name
  const getTopRole = (member: GuildMember): Role | undefined => {
    const userRoles = (rolesByUser.get(member.user_id) ?? []).filter((r) => !r.is_default);
    return userRoles.sort((a, b) => b.position - a.position)[0];
  };

  const groupedOnlineByRole = groupMembersByHoistedRole(hoistedRoles, guildMembers, rolesByUser, (m) => isOnlineLike(m));
  const groupedOfflineByRole = groupMembersByHoistedRole(hoistedRoles, guildMembers, rolesByUser, (m) => !isOnlineLike(m));

  const onlineUngrouped = guildMembers.filter((m) => {
    if (!isOnlineLike(m)) return false;
    return !(rolesByUser.get(m.user_id) ?? []).some((r) => r.hoist && !r.is_default);
  });
  const offlineUngrouped = guildMembers.filter((m) => {
    if (isOnlineLike(m)) return false;
    return !(rolesByUser.get(m.user_id) ?? []).some((r) => r.hoist && !r.is_default);
  });

  const onlineCount = useMemo(
    () => groupedOnlineByRole.reduce((acc, group) => acc + group.members.length, 0) + onlineUngrouped.length,
    [groupedOnlineByRole, onlineUngrouped.length],
  );
  const offlineCount = useMemo(
    () => groupedOfflineByRole.reduce((acc, group) => acc + group.members.length, 0) + offlineUngrouped.length,
    [groupedOfflineByRole, offlineUngrouped.length],
  );

  return (
    <div className="space-y-2">
      {/* Online section */}
      {onlineCount > 0 && (
        <>
          {groupedOnlineByRole.map((group) => (
            <MemberSection
              key={group.role.id}
              title={`${group.role.name} — ${group.members.length}`}
              roleColor={group.role.color}
            >
              {group.members.map((member) => (
                <MemberItem
                  key={member.user_id}
                  member={member}
                  getStatus={getStatus}
                  topRole={getTopRole(member)}
                  isOffline={false}
                />
              ))}
            </MemberSection>
          ))}
          {onlineUngrouped.length > 0 && (
            <MemberSection title={`${onlineLabel} — ${onlineUngrouped.length}`}>
              {onlineUngrouped.map((member) => (
                <MemberItem
                  key={member.user_id}
                  member={member}
                  getStatus={getStatus}
                  topRole={getTopRole(member)}
                  isOffline={false}
                />
              ))}
            </MemberSection>
          )}
        </>
      )}

      {/* Offline section */}
      {offlineCount > 0 && (
        <>
          {groupedOfflineByRole.map((group) => (
            <MemberSection
              key={`off-${group.role.id}`}
              title={`${group.role.name} — ${group.members.length}`}
              roleColor={group.role.color}
            >
              {group.members.map((member) => (
                <MemberItem
                  key={member.user_id}
                  member={member}
                  getStatus={getStatus}
                  topRole={getTopRole(member)}
                  isOffline
                />
              ))}
            </MemberSection>
          ))}
          {offlineUngrouped.length > 0 && (
            <MemberSection title={`${offlineLabel} — ${offlineUngrouped.length}`}>
              {offlineUngrouped.map((member) => (
                <MemberItem
                  key={member.user_id}
                  member={member}
                  getStatus={getStatus}
                  topRole={getTopRole(member)}
                  isOffline
                />
              ))}
            </MemberSection>
          )}
        </>
      )}
    </div>
  );
}

function MemberSection({
  title,
  children,
  roleColor,
}: {
  title: string;
  children: ReactNode;
  roleColor?: number;
}) {
  return (
    <div className="mb-1">
      <div
        className="flex items-center gap-1.5 px-2 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide select-none"
        style={{ color: 'var(--text-muted)' }}
      >
        {roleColor != null && roleColor !== 0 && (
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ background: roleColorToHex(roleColor) }}
          />
        )}
        <span>{title}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function MemberItem({
  member,
  getStatus,
  topRole,
  isOffline,
}: {
  member: GuildMember;
  getStatus: (userId: string) => string;
  topRole?: Role;
  isOffline: boolean;
}) {
  const [showProfile, setShowProfile] = useState(false);
  const status = getEffectiveStatus(member, getStatus);
  const displayName = member.nickname || member.user.display_name || member.user.username;

  const statusColor: Record<string, string> = {
    online: 'var(--online)',
    idle: 'var(--idle)',
    dnd: 'var(--danger)',
    invisible: 'var(--offline)',
    offline: 'var(--offline)',
  };

  const nameColor = topRole && topRole.color !== 0
    ? roleColorToHex(topRole.color)
    : 'var(--text-primary)';

  return (
    <div className="relative">
      <button
        onClick={() => setShowProfile((v) => !v)}
        className="member-row flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-100"
        style={{ opacity: isOffline ? 0.45 : 1 }}
      >
        {/* Avatar with status badge */}
        <div className="relative shrink-0">
          <Avatar className="h-8 w-8">
            {member.user.avatar_url && <AvatarImage src={member.user.avatar_url} />}
            <AvatarFallback
              className="text-[11px] font-semibold"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px]"
            style={{
              background: statusColor[status] ?? statusColor.offline,
              borderColor: 'var(--bg-secondary)',
            }}
          />
        </div>

        {/* Name + custom status */}
        <div className="flex-1 min-w-0">
          <p
            className="truncate text-sm font-medium leading-tight"
            style={{ color: isOffline ? 'var(--text-muted)' : nameColor }}
          >
            {displayName}
          </p>
          {member.user.custom_status && (
            <p
              className="truncate text-[11px] leading-tight mt-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              {member.user.custom_status}
            </p>
          )}
        </div>
      </button>

      {showProfile && (
        <div className="absolute right-full top-0 mr-2 z-50">
          <UserProfileCard
            user={member.user}
            onClose={() => setShowProfile(false)}
          />
        </div>
      )}
    </div>
  );
}

function getEffectiveStatus(member: GuildMember, getStatus: (userId: string) => string): string {
  const liveStatus = getStatus(member.user_id);
  return liveStatus === 'offline' ? (member.user.status ?? 'offline') : liveStatus;
}

function groupMembersByHoistedRole(
  hoistedRoles: Role[],
  members: GuildMember[],
  rolesByUser: Map<string, Role[]>,
  predicate: (member: GuildMember) => boolean,
): Array<{ role: Role; members: GuildMember[] }> {
  return hoistedRoles
    .map((role) => ({
      role,
      members: members.filter((m) => predicate(m) && (rolesByUser.get(m.user_id) ?? []).some((r) => r.id === role.id)),
    }))
    .filter((group) => group.members.length > 0);
}
