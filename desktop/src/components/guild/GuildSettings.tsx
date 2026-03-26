import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Guild } from '@/types';

interface Props {
  guild: Guild;
  onClose: () => void;
}

export default function GuildSettings({ guild, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(guild.name);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => guildsApi.update(guild.id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guilds'] });
      setError('');
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--text-primary)' }}>{t('guild.settings')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
              {t('guild.server_name')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
            />
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {save.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
