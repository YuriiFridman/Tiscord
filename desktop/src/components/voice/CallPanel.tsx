import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoice } from '@/hooks/useVoice';
import { useAuthStore } from '@/store/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { User } from '@/types';

interface Props {
  channelId: string;
  participants: User[];
  maxParticipants?: number;
  onEnd: () => void;
}

export default function CallPanel({ channelId, participants, maxParticipants = 6, onEnd }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const voice = useVoice();
  const [elapsed, setElapsed] = useState(0);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const handleJoinCall = async () => {
    if (!user) return;
    await voice.joinChannel(channelId, user);
  };

  const handleEnd = () => {
    voice.leaveChannel();
    onEnd();
  };

  const isJoined = voice.inCall && voice.channelId === channelId;

  if (minimized) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2 border-b"
        style={{ background: 'rgba(67,181,129,0.1)', borderColor: 'var(--online)' }}
      >
        <span style={{ color: 'var(--online)' }}>🔊 {t('voice.activeCall')} · {formatTime(elapsed)}</span>
        <Button size="sm" variant="ghost" onClick={() => setMinimized(false)} style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          ▼
        </Button>
        <Button size="sm" onClick={handleEnd} style={{ background: 'var(--danger)', color: '#fff' }}>
          {t('voice.end')}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="border-b p-4 flex-shrink-0"
      style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--online)' }}>🔊 {t('voice.activeCall')}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatTime(elapsed)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setMinimized(true)} style={{ color: 'var(--text-secondary)' }}>▲</Button>
        </div>
      </div>

      {/* Warning for large calls */}
      {participants.length >= maxParticipants && (
        <div className="mb-2 text-xs px-2 py-1 rounded" style={{ background: 'rgba(250,166,26,0.15)', color: 'var(--warning)' }}>
          ⚠️ {t('voice.meshWarning')}
        </div>
      )}

      {/* Participants */}
      <div className="flex flex-wrap gap-2 mb-3">
        {participants.map((p: User) => (
          <div key={p.id} className="flex flex-col items-center gap-1">
            <Avatar className="w-10 h-10">
              <AvatarFallback style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '0.75rem' }}>
                {(p.display_name || p.username).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {p.display_name || p.username}
            </span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {!isJoined ? (
          <Button size="sm" onClick={handleJoinCall} style={{ background: 'var(--accent)', color: '#fff' }}>
            {t('voice.join')}
          </Button>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={voice.toggleMute} style={{ color: voice.isMuted ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {voice.isMuted ? '🔇' : '🎤'}
            </Button>
            <Button size="sm" variant="ghost" onClick={voice.toggleDeafen} style={{ color: voice.isDeafened ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {voice.isDeafened ? '🔕' : '🔊'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={voice.toggleScreenShare}
              style={{ color: voice.isScreenSharing ? 'var(--accent)' : 'var(--text-secondary)' }}
              title={voice.isScreenSharing ? t('voice.stop_screen_share') : t('voice.start_screen_share')}
            >
              {voice.isScreenSharing ? '🖥️' : '📺'}
            </Button>
          </>
        )}
        <Button size="sm" onClick={handleEnd} style={{ background: 'var(--danger)', color: '#fff', marginLeft: 'auto' }}>
          {t('voice.end')}
        </Button>
      </div>
    </div>
  );
}
