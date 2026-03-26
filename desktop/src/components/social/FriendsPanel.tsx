import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { friendsApi } from '@/lib/api';
import { usePresenceStore } from '@/store/presence';
import { useAuthStore } from '@/store/auth';
import { getInitials } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { FriendRequest } from '@/types';

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

export default function FriendsPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('online');
  const [addUsername, setAddUsername] = useState('');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const getStatus = usePresenceStore((s) => s.getStatus);

  const { data: friends = [] } = useQuery<FriendRequest[]>({
    queryKey: ['friends'],
    queryFn: friendsApi.list,
  });

  const { data: requests = [] } = useQuery<FriendRequest[]>({
    queryKey: ['friendRequests'],
    queryFn: friendsApi.requests,
  });

  const { data: blocked = [] } = useQuery<FriendRequest[]>({
    queryKey: ['blockedUsers'],
    queryFn: friendsApi.blocked,
  });

  const sendRequest = useMutation({
    mutationFn: (receiverId: string) => friendsApi.send(receiverId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friendRequests'] });
      setAddSuccess(t('friends.send_request'));
      setAddUsername('');
      setAddError('');
      setTimeout(() => setAddSuccess(''), 3000);
    },
    onError: (e: Error) => {
      setAddError(e.message);
      setAddSuccess('');
    },
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
      friendsApi.respond(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['friendRequests'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => friendsApi.remove(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends'] }),
  });

  const unblockMutation = useMutation({
    mutationFn: (userId: string) => friendsApi.unblock(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blockedUsers'] }),
  });

  const statusColor: Record<string, string> = {
    online: 'var(--online)',
    idle: 'var(--idle)',
    dnd: 'var(--danger)',
    offline: 'var(--offline)',
    invisible: 'var(--offline)',
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'online', label: t('friends.online') },
    { key: 'all', label: t('friends.all') },
    { key: 'pending', label: t('friends.pending') },
    { key: 'blocked', label: t('friends.blocked') },
    { key: 'add', label: t('friends.add_friend') },
  ];

  const incomingRequests = requests.filter(
    (r) => r.receiver_id === currentUser?.id && r.status === 'pending',
  );
  const outgoingRequests = requests.filter(
    (r) => r.sender_id === currentUser?.id && r.status === 'pending',
  );

  const onlineFriends = friends.filter((f) => {
    const friendUser = f.sender_id === currentUser?.id ? f.receiver : f.sender;
    if (!friendUser) return false;
    const status = getStatus(friendUser.id);
    return status === 'online' || status === 'idle' || status === 'dnd';
  });

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg-chat)' }}>
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center gap-1 border-b border-white/5 px-4"
        style={{ background: 'var(--bg-primary)' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" className="mr-1">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
        </svg>
        <span className="font-semibold mr-4" style={{ color: 'var(--text-primary)' }}>
          {t('friends.title')}
        </span>
        <div className="flex gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'rounded px-3 py-1 text-sm transition-colors',
                tab === key
                  ? 'font-semibold'
                  : 'hover:bg-white/5',
              )}
              style={{
                background: tab === key ? 'var(--bg-tertiary)' : undefined,
                color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {label}
              {key === 'pending' && incomingRequests.length > 0 && (
                <span
                  className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: 'var(--danger)', color: '#fff' }}
                >
                  {incomingRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-6 py-4">
        {/* Online tab */}
        {tab === 'online' && (
          <FriendList
            title={`${t('friends.online')} — ${onlineFriends.length}`}
            items={onlineFriends}
            currentUserId={currentUser?.id ?? ''}
            statusColor={statusColor}
            getStatus={getStatus}
            onRemove={(userId) => removeMutation.mutate(userId)}
            emptyLabel={t('friends.no_friends')}
          />
        )}

        {/* All tab */}
        {tab === 'all' && (
          <FriendList
            title={`${t('friends.all')} — ${friends.length}`}
            items={friends}
            currentUserId={currentUser?.id ?? ''}
            statusColor={statusColor}
            getStatus={getStatus}
            onRemove={(userId) => removeMutation.mutate(userId)}
            emptyLabel={t('friends.no_friends')}
          />
        )}

        {/* Pending tab */}
        {tab === 'pending' && (
          <div className="space-y-4">
            {incomingRequests.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {t('friends.incoming')} — {incomingRequests.length}
                </p>
                <div className="space-y-2">
                  {incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center gap-3 rounded-lg p-3 hover:bg-white/5 transition-colors"
                      style={{ background: 'var(--bg-secondary)' }}
                    >
                      <Avatar className="h-9 w-9">
                        {req.sender?.avatar_url && <AvatarImage src={req.sender.avatar_url} />}
                        <AvatarFallback className="text-xs" style={{ background: 'var(--bg-tertiary)' }}>
                          {getInitials(req.sender?.display_name || req.sender?.username || '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {req.sender?.display_name || req.sender?.username}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          @{req.sender?.username}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs"
                          style={{ background: 'var(--online)', color: '#fff' }}
                          onClick={() => respondMutation.mutate({ id: req.id, action: 'accept' })}
                          disabled={respondMutation.isPending}
                        >
                          {t('friends.accept')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-3 text-xs"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => respondMutation.mutate({ id: req.id, action: 'reject' })}
                          disabled={respondMutation.isPending}
                        >
                          {t('friends.decline')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {outgoingRequests.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {t('friends.outgoing')} — {outgoingRequests.length}
                </p>
                <div className="space-y-2">
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center gap-3 rounded-lg p-3"
                      style={{ background: 'var(--bg-secondary)' }}
                    >
                      <Avatar className="h-9 w-9">
                        {req.receiver?.avatar_url && <AvatarImage src={req.receiver.avatar_url} />}
                        <AvatarFallback className="text-xs" style={{ background: 'var(--bg-tertiary)' }}>
                          {getInitials(req.receiver?.display_name || req.receiver?.username || '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {req.receiver?.display_name || req.receiver?.username}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          @{req.receiver?.username}
                        </p>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t('friends.pending')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
              <EmptyState label={t('friends.no_pending')} />
            )}
          </div>
        )}

        {/* Blocked tab */}
        {tab === 'blocked' && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {t('friends.blocked')} — {blocked.length}
            </p>
            {blocked.length === 0 ? (
              <EmptyState label={t('friends.no_friends')} />
            ) : (
              <div className="space-y-2">
                {blocked.map((b) => {
                  const blockedUser = b.sender_id === currentUser?.id ? b.receiver : b.sender;
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 rounded-lg p-3"
                      style={{ background: 'var(--bg-secondary)' }}
                    >
                      <Avatar className="h-9 w-9">
                        {blockedUser?.avatar_url && <AvatarImage src={blockedUser.avatar_url} />}
                        <AvatarFallback className="text-xs" style={{ background: 'var(--bg-tertiary)' }}>
                          {getInitials(blockedUser?.display_name || blockedUser?.username || '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {blockedUser?.display_name || blockedUser?.username}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          @{blockedUser?.username}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-3 text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                        onClick={() => blockedUser && unblockMutation.mutate(blockedUser.id)}
                        disabled={unblockMutation.isPending}
                      >
                        {t('friends.unblock')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Add Friend tab */}
        {tab === 'add' && (
          <div className="max-w-lg">
            <h3 className="mb-1 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {t('friends.add_friend')}
            </h3>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('friends.add_friend_placeholder')}
            </p>
            <div
              className="flex gap-2 rounded-lg p-1"
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <Input
                value={addUsername}
                onChange={(e) => { setAddUsername(e.target.value); setAddError(''); setAddSuccess(''); }}
                placeholder={t('friends.add_friend_placeholder')}
                onKeyDown={(e) => e.key === 'Enter' && addUsername.trim() && sendRequest.mutate(addUsername.trim())}
                className="flex-1 border-0 bg-transparent text-sm outline-none focus-visible:ring-0"
                style={{ color: 'var(--text-primary)' }}
              />
              <Button
                size="sm"
                disabled={!addUsername.trim() || sendRequest.isPending}
                onClick={() => sendRequest.mutate(addUsername.trim())}
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {t('friends.send_request')}
              </Button>
            </div>
            {addError && <p className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{addError}</p>}
            {addSuccess && <p className="mt-2 text-sm" style={{ color: 'var(--online)' }}>{addSuccess}</p>}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function FriendList({
  title,
  items,
  currentUserId,
  statusColor,
  getStatus,
  onRemove,
  emptyLabel,
}: {
  title: string;
  items: FriendRequest[];
  currentUserId: string;
  statusColor: Record<string, string>;
  getStatus: (id: string) => string;
  onRemove: (userId: string) => void;
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {title}
      </p>
      {items.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className="space-y-px">
          {items.map((f) => {
            const friendUser = f.sender_id === currentUserId ? f.receiver : f.sender;
            if (!friendUser) return null;
            const status = getStatus(friendUser.id);
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-lg p-3 hover:bg-white/5 transition-colors cursor-default"
              >
                <div className="relative">
                  <Avatar className="h-9 w-9">
                    {friendUser.avatar_url && <AvatarImage src={friendUser.avatar_url} />}
                    <AvatarFallback className="text-xs" style={{ background: 'var(--bg-tertiary)' }}>
                      {getInitials(friendUser.display_name || friendUser.username)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2"
                    style={{
                      background: statusColor[status] ?? statusColor.offline,
                      borderColor: 'var(--bg-chat)',
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {friendUser.display_name || friendUser.username}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    @{friendUser.username}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-3 text-xs opacity-0 group-hover:opacity-100"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => onRemove(friendUser.id)}
                >
                  ✕
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <span className="text-4xl">👥</span>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}
