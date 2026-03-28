import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { guildsApi, channelsApi } from '@/lib/api';
import type { Guild, Channel, Message } from '@/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import GuildSidebar from './GuildSidebar';
import ChannelSidebar from './ChannelSidebar';
import UserPanel from './UserPanel';
import ChannelView from '@/components/channels/ChannelView';
import DMList from '@/components/dm/DMList';
import DMView from '@/components/dm/DMView';
import FriendsPanel from '@/components/social/FriendsPanel';
import { useWebSocket } from '@/hooks/useWebSocket';
import { queryClient } from '@/lib/queryClient';
import ErrorBoundary from '@/components/ErrorBoundary';
import { usePresenceStore } from '@/store/presence';
import { check } from '@tauri-apps/plugin-updater';
import type { PresenceStatus } from '@/types';

type ActiveView = { type: 'guild'; guildId: string; channelId: string | null } | { type: 'dm'; channelId: string | null };

export default function AppLayout() {
  const { t } = useTranslation();
  const setPresence = usePresenceStore((s) => s.setStatus);
  const bulkSetPresence = usePresenceStore((s) => s.bulkSet);
  const [view, setView] = useState<ActiveView>({ type: 'dm', channelId: null });
  const [showFriends, setShowFriends] = useState(false);

  const { data: guilds = [] } = useQuery({
    queryKey: ['guilds'],
    queryFn: async () => {
      const list = await guildsApi.list();
      // Seed individual guild cache entries to avoid re-fetching on navigation
      list.forEach((g) => {
        queryClient.setQueryData(['guild', g.id], g);
      });
      return list;
    },
  });

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const update = await check();
        if (!mounted || !update?.available) return;
        // Keep it explicit for users before restarting to apply update.
        const shouldInstall = window.confirm(t('common.update_available_install_now'));
        if (!shouldInstall) return;
        await update.downloadAndInstall();
      } catch {
        // no-op in web mode or when updater is not configured
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [t]);

  // Real-time guild list updates
  useWebSocket('GUILD_CREATE', (data) => {
    queryClient.invalidateQueries({ queryKey: ['guilds'] });
    const guild = data as Guild;
    setView({ type: 'guild', guildId: guild.id, channelId: null });
  });
  useWebSocket('GUILD_DELETE', () => {
    queryClient.invalidateQueries({ queryKey: ['guilds'] });
    setView({ type: 'dm', channelId: null });
  });
  useWebSocket('GUILD_UPDATE', (data) => {
    const guild = data as Guild;
    queryClient.setQueryData<Guild>(['guild', guild.id], guild);
    queryClient.invalidateQueries({ queryKey: ['guilds'] });
  });
  // MESSAGE_CREATE/UPDATE/DELETE are handled inside MessageList via setQueryData.
  // We keep invalidation here only for channels that have no active subscriber
  // (i.e. the user is not currently viewing that channel).
  useWebSocket('MESSAGE_CREATE', (data) => {
    const msg = data as Message;
    queryClient.setQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
      ['messages', msg.channel_id],
      (old) => {
        if (!old) return old;
        // Avoid duplicates (MessageList may have already added it)
        const allIds = new Set(old.pages.flatMap((p) => p.map((m) => m.id)));
        if (allIds.has(msg.id)) return old;
        const pages = [...old.pages];
        pages[pages.length - 1] = [...pages[pages.length - 1], msg];
        return { ...old, pages };
      },
    );
  });
  useWebSocket('MESSAGE_UPDATE', (data) => {
    const msg = data as Message;
    queryClient.setQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
      ['messages', msg.channel_id],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => page.map((m) => (m.id === msg.id ? msg : m))),
        };
      },
    );
  });
  useWebSocket('MESSAGE_DELETE', (data) => {
    const { message_id, channel_id } = data as { message_id: string; channel_id: string };
    queryClient.setQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
      ['messages', channel_id],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => page.filter((m) => m.id !== message_id)),
        };
      },
    );
  });
  useWebSocket('DM_MESSAGE_CREATE', (data) => {
    const msg = data as Message;
    queryClient.setQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
      ['messages', msg.channel_id],
      (old) => {
        if (!old) return old;
        const allIds = new Set(old.pages.flatMap((p) => p.map((m) => m.id)));
        if (allIds.has(msg.id)) return old;
        const pages = [...old.pages];
        pages[pages.length - 1] = [...pages[pages.length - 1], msg];
        return { ...old, pages };
      },
    );
    queryClient.invalidateQueries({ queryKey: ['dms'] });
  });
  useWebSocket('CHANNEL_CREATE', (data) => {
    const ch = data as Channel;
    if (ch.guild_id) queryClient.invalidateQueries({ queryKey: ['channels', ch.guild_id] });
  });
  useWebSocket('CHANNEL_UPDATE', (data) => {
    const ch = data as Channel;
    if (ch.guild_id) queryClient.invalidateQueries({ queryKey: ['channels', ch.guild_id] });
  });
  useWebSocket('CHANNEL_DELETE', (data) => {
    const ch = data as { guild_id?: string };
    if (ch.guild_id) queryClient.invalidateQueries({ queryKey: ['channels', ch.guild_id] });
  });
  useWebSocket('GUILD_MEMBER_ADD', (data) => {
    const payload = data as { guild_id: string };
    if (payload.guild_id) {
      queryClient.invalidateQueries({ queryKey: ['guildMembers', payload.guild_id] });
      queryClient.invalidateQueries({ queryKey: ['guilds'] });
    }
  });
  useWebSocket('GUILD_MEMBER_REMOVE', (data) => {
    const payload = data as { guild_id: string; user_id: string };
    if (payload.guild_id) {
      queryClient.invalidateQueries({ queryKey: ['guildMembers', payload.guild_id] });
    }
  });
  useWebSocket('DM_THREAD_CREATE', () => {
    queryClient.invalidateQueries({ queryKey: ['dms'] });
  });
  useWebSocket('PRESENCE_UPDATE', (data) => {
    const payload = data as { user_id: string; status: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline' };
    if (!payload?.user_id) return;
    setPresence(payload.user_id, payload.status ?? 'offline');
  });
  useWebSocket('READY', (data) => {
    const payload = data as { user_id: string; guild_ids: string[]; presence?: Array<{ user_id: string; status: string }> };
    if (payload.presence?.length) {
      bulkSetPresence(
        payload.presence.map((p) => ({
          userId: p.user_id,
          status: (p.status ?? 'online') as PresenceStatus,
        })),
      );
    }
  });

  // Auto-select first text channel when guild selected
  const guildId = view.type === 'guild' ? view.guildId : undefined;
  const viewChannelId = view.channelId;
  const { data: channels = [], isLoading: isChannelsLoading } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => channelsApi.list(guildId!),
    enabled: !!guildId,
  });

  useEffect(() => {
    if (guildId && !viewChannelId && channels.length > 0) {
      const first = channels.find((c) => c.type === 'text');
      if (first) setView({ type: 'guild', guildId, channelId: first.id });
    }
  }, [channels, guildId, viewChannelId]);

  function selectGuild(id: string) {
    setView({ type: 'guild', guildId: id, channelId: null });
  }

  function selectChannel(channelId: string) {
    setShowFriends(false);
    if (view.type === 'guild') {
      setView({ ...view, channelId });
    } else {
      setView({ type: 'dm', channelId });
    }
  }

  function goToDMs() {
    setView({ type: 'dm', channelId: null });
    setShowFriends(false);
  }

  const activeGuild = guilds.find((g) => g.id === guildId);
  const activeChannelId = view.channelId;
  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full select-none" style={{ background: 'var(--bg-primary)' }}>
        {/* Guild Sidebar (72px) */}
        <GuildSidebar
          guilds={guilds}
          activeGuildId={guildId ?? null}
          onSelectGuild={selectGuild}
          onSelectDMs={goToDMs}
          isDMActive={view.type === 'dm'}
        />

        {/* Channel / DM Sidebar (240px) */}
        <div className="flex w-60 flex-col" style={{ background: 'var(--bg-secondary)' }}>
          {view.type === 'guild' && activeGuild ? (
            <ChannelSidebar
              guild={activeGuild}
              channels={channels}
              activeChannelId={view.channelId}
              onSelectChannel={selectChannel}
              onLeaveGuild={goToDMs}
            />
          ) : (
            <>
              {/* Friends button */}
              <button
                onClick={() => { setShowFriends((v) => !v); setView({ type: 'dm', channelId: null }); }}
                className="mx-2 mt-3 mb-1 flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-white/5"
                style={{
                  color: showFriends ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: showFriends ? 'var(--bg-tertiary)' : undefined,
                  fontWeight: showFriends ? 600 : undefined,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" /><circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
                </svg>
                {t('friends.title')}
              </button>
              <DMList
                selectedChannelId={view.channelId}
                onSelect={selectChannel}
              />
            </>
          )}
          <UserPanel />
        </div>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <ErrorBoundary>
            {view.type === 'guild' && isChannelsLoading ? (
              <SkeletonState />
            ) : view.type === 'guild' && view.channelId ? (
              activeChannel ? (
                <ChannelView channel={activeChannel} guild={activeGuild!} />
              ) : (
                <BlankState label={t('common.loading')} />
              )
            ) : view.type === 'dm' && view.channelId ? (
              <DMView dmId={view.channelId} />
            ) : showFriends ? (
              <FriendsPanel />
            ) : (
              <BlankState label={view.type === 'guild' ? t('channel.text') : t('nav.direct_messages')} />
            )}
          </ErrorBoundary>
        </div>
      </div>
    </TooltipProvider>
  );
}

function BlankState({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'var(--bg-secondary)' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
          <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function SkeletonState() {
  return (
    <div className="flex flex-col h-full animate-pulse" style={{ background: 'var(--bg-primary)' }}>
      {/* Header skeleton */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5" style={{ background: 'var(--bg-primary)' }}>
        <div className="h-5 w-32 rounded" style={{ background: 'var(--bg-tertiary)' }} />
      </div>
      {/* Messages skeleton */}
      <div className="flex flex-col gap-4 p-4 flex-1 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full shrink-0" style={{ background: 'var(--bg-tertiary)' }} />
            <div className="flex flex-col gap-2 flex-1">
              <div className="h-3 w-24 rounded" style={{ background: 'var(--bg-tertiary)' }} />
              {/* Vary widths to simulate realistic message lengths */}
              <div className="h-3 rounded" style={{ background: 'var(--bg-tertiary)', width: `${50 + (i * 17) % 40}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
