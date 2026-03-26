import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { dmsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import MessageList from '@/components/channels/MessageList';
import MessageInput from '@/components/channels/MessageInput';
import CallPanel from '@/components/voice/CallPanel';
import type { DMThread, User } from '@/types';

interface Props {
  dmId: string;
}

export default function DMView({ dmId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [callActive, setCallActive] = useState(false);

  const { data: dm } = useQuery<DMThread>({
    queryKey: ['dm', dmId],
    queryFn: () => dmsApi.get(dmId),
  });

  if (!dm) return null;

  const isGroup = dm.participants.length > 2;
  const others = dm.participants.filter((p: User) => p.id !== user?.id);
  const title = dm.name ?? others.map((p: User) => p.display_name || p.username).join(', ');

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'var(--bg-primary)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {others.slice(0, 3).map((p: User) => (
              <Avatar key={p.id} className="w-8 h-8 border-2" style={{ borderColor: 'var(--bg-primary)' }}>
                <AvatarFallback style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '0.7rem' }}>
                  {(p.display_name || p.username).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{title}</div>
            {isGroup && (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {dm.participants.length} {t('dm.members')}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCallActive(true)}
            style={{ color: 'var(--text-secondary)' }}
          >
            📞 {t('voice.call')}
          </Button>
        </div>
      </div>

      {/* Call Panel */}
      {callActive && (
        <CallPanel
          channelId={dm.channel_id}
          participants={dm.participants}
          maxParticipants={6}
          onEnd={() => setCallActive(false)}
        />
      )}

      {/* Messages */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <MessageList channelId={dm.channel_id} guildId="" />
          <MessageInput channelId={dm.channel_id} guildId={null} />
        </div>

        {/* Participants panel for group DMs */}
        {isGroup && (
          <div
            className="w-56 flex-shrink-0 border-l p-3 overflow-y-auto"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'var(--bg-secondary)' }}
          >
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
              {t('dm.members')} — {dm.participants.length}
            </div>
            {dm.participants.map((p: User) => (
              <div key={p.id} className="flex items-center gap-2 py-1">
                <Avatar className="w-7 h-7">
                  <AvatarFallback style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '0.65rem' }}>
                    {(p.display_name || p.username).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                  {p.display_name || p.username}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
