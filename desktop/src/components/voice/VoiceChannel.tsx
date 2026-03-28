import { useTranslation } from 'react-i18next';
import { useVoice } from '@/hooks/useVoice';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { voiceApi } from '@/lib/api';
import VoiceParticipantItem from './VoiceParticipant';
import { Button } from '@/components/ui/button';
import type { VoiceParticipant } from '@/types';

interface Props {
  channelId: string;
  channelName: string;
}

const MESH_WARN_THRESHOLD = 6;
const MAX_PARTICIPANTS = 10;

export default function VoiceChannel({ channelId, channelName }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const voice = useVoice();

  const { data: serverParticipants = [] } = useQuery<VoiceParticipant[]>({
    queryKey: ['voice', channelId],
    queryFn: () => voiceApi.getParticipants(channelId),
    refetchInterval: 5000,
  });

  const isJoined = voice.inCall && voice.channelId === channelId;
  const count = serverParticipants.length;

  const handleJoin = async () => {
    if (!user) return;
    await voice.joinChannel(channelId, user);
  };

  const handleLeave = () => {
    voice.leaveChannel();
  };

  return (
    <div className="flex flex-col h-full p-4" style={{ background: 'var(--bg-primary)' }}>
      {/* Channel header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          🔊 {channelName}
        </h2>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {count} / {MAX_PARTICIPANTS} {t('voice.participants')}
        </div>
      </div>

      {/* Warnings */}
      {count >= MAX_PARTICIPANTS && (
        <div
          className="mb-3 px-3 py-2 rounded text-sm"
          style={{ background: 'rgba(240,71,71,0.15)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
        >
          ⚠️ {t('voice.channelFull')}
        </div>
      )}
      {count >= MESH_WARN_THRESHOLD && count < MAX_PARTICIPANTS && (
        <div
          className="mb-3 px-3 py-2 rounded text-sm"
          style={{ background: 'rgba(250,166,26,0.15)', color: 'var(--warning)', border: '1px solid var(--warning)' }}
        >
          ⚠️ {t('voice.meshWarning')}
        </div>
      )}

      {/* Participants list */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          {serverParticipants.map((p: VoiceParticipant) => (
            <VoiceParticipantItem
              key={p.user.id}
              user={p.user}
              isMuted={p.is_muted}
              isDeafened={p.is_deafened}
              isSpeaking={false}
              isLocal={p.user.id === user?.id}
            />
          ))}
        </div>
        {serverParticipants.length === 0 && (
          <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
            {t('voice.empty')}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {isJoined ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={voice.toggleMute}
              style={{ color: voice.isMuted ? 'var(--danger)' : 'var(--text-secondary)' }}
            >
              {voice.isMuted ? '🔇' : '🎤'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={voice.toggleDeafen}
              style={{ color: voice.isDeafened ? 'var(--danger)' : 'var(--text-secondary)' }}
            >
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
            <Button
              size="sm"
              onClick={handleLeave}
              style={{ background: 'var(--danger)', color: '#fff', marginLeft: 'auto' }}
            >
              {t('voice.leave')}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={handleJoin}
            disabled={count >= MAX_PARTICIPANTS}
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {t('voice.join')}
          </Button>
        )}
      </div>
    </div>
  );
}
