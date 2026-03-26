import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateGuildModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () => guildsApi.create(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guilds'] });
      setName('');
      setError('');
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--text-primary)' }}>{t('guild.create_server')}</DialogTitle>
        </DialogHeader>

        {/* Icon preview */}
        <div className="flex justify-center my-4">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold"
            style={{ background: initial ? 'var(--accent)' : 'var(--bg-tertiary)', color: '#fff' }}
          >
            {initial || '?'}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
              {t('guild.server_name')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('guild.server_name_placeholder')}
              maxLength={100}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && create.mutate()}
              style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
            />
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!name.trim() || create.isPending}
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {create.isPending ? t('common.loading') : t('common.create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
