import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { guildsApi, channelsApi } from '@/lib/api';
import type { Guild, Channel } from '@/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import GuildSidebar from './GuildSidebar';
import ChannelSidebar from './ChannelSidebar';
import UserPanel from './UserPanel';
import ChannelView from '@/components/channels/ChannelView';
import DMList from '@/components/dm/DMList';
import DMView from '@/components/dm/DMView';
import { useWebSocket } from '@/hooks/useWebSocket';
import { queryClient } from '@/lib/queryClient';
import ErrorBoundary from '@/components/ErrorBoundary';

type ActiveView = { type: 'guild'; guildId: string; channelId: string | null } | { type: 'dm'; channelId: string | null };

export default function AppLayout() {
  const { t } = useTranslation();
  const [view, setView] = useState<ActiveView>({ type: 'dm', channelId: null });

  const { data: guilds = [] } = useQuery({
    queryKey: ['guilds'],
    queryFn: guildsApi.list,
  });

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
  useWebSocket('MESSAGE_CREATE', (data) => {
    const msg = data as { channel_id: string; guild_id?: string };
    queryClient.invalidateQueries({ queryKey: ['messages', msg.channel_id] });
  });
  useWebSocket('MESSAGE_UPDATE', (data) => {
    const msg = data as { channel_id: string };
    queryClient.invalidateQueries({ queryKey: ['messages', msg.channel_id] });
  });
  useWebSocket('MESSAGE_DELETE', (data) => {
    const msg = data as { channel_id: string };
    queryClient.invalidateQueries({ queryKey: ['messages', msg.channel_id] });
  });
  useWebSocket('CHANNEL_CREATE', (data) => {
    const ch = data as Channel;
    if (ch.guild_id) queryClient.invalidateQueries({ queryKey: ['channels', ch.guild_id] });
  });
  useWebSocket('CHANNEL_DELETE', (data) => {
    const ch = data as { guild_id?: string };
    if (ch.guild_id) queryClient.invalidateQueries({ queryKey: ['channels', ch.guild_id] });
  });

  // Auto-select first text channel when guild selected
  const guildId = view.type === 'guild' ? view.guildId : undefined;
  const viewChannelId = view.channelId;
  const { data: channels = [] } = useQuery({
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
    if (view.type === 'guild') {
      setView({ ...view, channelId });
    } else {
      setView({ type: 'dm', channelId });
    }
  }

  function goToDMs() {
    setView({ type: 'dm', channelId: null });
  }

  const activeGuild = guilds.find((g) => g.id === guildId);
  const activeChannelId = view.type === 'guild' ? view.channelId : view.channelId;
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
            <DMList
              selectedChannelId={view.channelId}
              onSelect={selectChannel}
            />
          )}
          <UserPanel />
        </div>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <ErrorBoundary>
            {view.type === 'guild' && view.channelId ? (
              activeChannel ? (
                <ChannelView channel={activeChannel} guild={activeGuild!} />
              ) : (
                <BlankState label={t('common.loading')} />
              )
            ) : view.type === 'dm' && view.channelId ? (
              <DMView dmId={view.channelId} />
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
