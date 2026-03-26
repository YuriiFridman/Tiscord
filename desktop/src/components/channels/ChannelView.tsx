import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Channel, Guild, Message } from '@/types';
import { pinsApi } from '@/lib/api';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import MessageSearch from './MessageSearch';
import VoiceChannel from '@/components/voice/VoiceChannel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatTime } from '@/lib/utils';

interface Props {
  channel: Channel;
  guild: Guild;
}

export default function ChannelView({ channel, guild }: Props) {
  const { t } = useTranslation();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showPins, setShowPins] = useState(false);

  const { data: pins = [] } = useQuery<Message[]>({
    queryKey: ['pins', channel.id],
    queryFn: () => pinsApi.list(channel.id),
    enabled: showPins,
  });

  if (channel.type === 'voice') {
    return <VoiceChannel channelId={channel.id} channelName={channel.name} />;
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-chat)' }}>
      <div className="flex flex-1 flex-col min-w-0">
        {/* Channel header */}
        <div
          className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-4 shadow-sm"
          style={{ background: 'var(--bg-primary)' }}
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
          className="flex h-full w-80 shrink-0 flex-col border-l border-white/5"
          style={{ background: 'var(--bg-secondary)' }}
        >
          <div
            className="flex h-12 shrink-0 items-center justify-between border-b border-white/5 px-4"
            style={{ background: 'var(--bg-primary)' }}
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
    </div>
  );
}


