import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invitesApi, channelsApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Channel, Invite } from '@/types';

interface Props {
  mode: 'create' | 'join';
  guildId?: string;
  onClose: () => void;
}

export default function InviteModal({ mode, guildId, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels', guildId],
    queryFn: () => channelsApi.list(guildId!),
    enabled: mode === 'create' && !!guildId,
  });

  const firstTextChannel = channels.find((c) => c.type === 'text');

  const createInvite = useMutation({
    mutationFn: () => invitesApi.create(guildId!, firstTextChannel!.id),
    onSuccess: (data) => {
      setInvite(data);
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const joinInvite = useMutation({
    mutationFn: () => invitesApi.join(code.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guilds'] });
      setError('');
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const appUrl = import.meta.env.VITE_APP_URL as string | undefined;
  const inviteLink = invite
    ? appUrl
      ? `${appUrl}/invite/${invite.code}`
      : invite.code
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--text-primary)' }}>
            {mode === 'create' ? t('guild.invite') : t('guild.join_via_invite')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {mode === 'create' ? (
            <>
              {invite ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
                    {appUrl ? t('guild.invite_link') : t('guild.invite_code')}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={inviteLink}
                      style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
                    />
                    <Button
                      onClick={handleCopy}
                      style={{ background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap' }}
                    >
                      {copied ? t('guild.copied') : t('guild.copy_link')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-2">
                  {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
                  <Button
                    onClick={() => createInvite.mutate()}
                    disabled={!firstTextChannel || createInvite.isPending}
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    {createInvite.isPending ? t('common.loading') : t('guild.invite')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
                {t('guild.invite_code')}
              </label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="abc123"
                style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
                onKeyDown={(e) => e.key === 'Enter' && code.trim() && joinInvite.mutate()}
              />
              {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => joinInvite.mutate()}
                  disabled={!code.trim() || joinInvite.isPending}
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {joinInvite.isPending ? t('common.loading') : t('guild.join')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
