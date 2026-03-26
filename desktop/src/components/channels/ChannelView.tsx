import { useTranslation } from 'react-i18next';
import type { Channel, Guild } from '@/types';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import VoiceChannel from '@/components/voice/VoiceChannel';

interface Props {
  channel: Channel;
  guild: Guild;
}

export default function ChannelView({ channel, guild }: Props) {
  const { t } = useTranslation();

  if (channel.type === 'voice') {
    return <VoiceChannel channelId={channel.id} channelName={channel.name} />;
  }

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg-chat)' }}>
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
      </div>

      {/* Messages */}
      <MessageList channelId={channel.id} guildId={guild.id} />

      {/* Input */}
      <MessageInput
        channelId={channel.id}
        guildId={guild.id}
        placeholder={t('messages.type_message_to', { name: channel.name })}
      />
    </div>
  );
}
