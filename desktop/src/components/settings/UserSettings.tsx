import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { usersApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  onClose: () => void;
}

export default function UserSettings({ onClose }: Props) {
  const { t } = useTranslation();
  const { user, logout, setUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [error, setError] = useState('');
  const [isLight, setIsLight] = useState(document.documentElement.getAttribute('data-theme') === 'light');

  const save = useMutation({
    mutationFn: () => usersApi.updateMe({ display_name: displayName }),
    onSuccess: (updated) => {
      setUser(updated);
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const toggleTheme = () => {
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      setIsLight(false);
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      setIsLight(true);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--text-primary)' }}>{t('nav.settings')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
              {t('settings.display_name')}
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
              style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Appearance section */}
          <div>
            <label className="text-xs font-semibold uppercase mb-2 block" style={{ color: 'var(--text-muted)' }}>
              {t('settings.appearance')}
            </label>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {isLight ? t('theme.light') : t('theme.dark')}
              </span>
              <button
                onClick={toggleTheme}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none"
                style={{ background: isLight ? 'var(--accent)' : 'var(--bg-tertiary)' }}
                aria-label={t('theme.toggle')}
              >
                <span
                  className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  style={{ transform: isLight ? 'translateX(24px)' : 'translateX(4px)' }}
                />
              </button>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="flex justify-between pt-2">
            <Button
              variant="ghost"
              onClick={handleLogout}
              style={{ color: 'var(--danger)' }}
            >
              {t('auth.logout')}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => save.mutate()}
                disabled={!displayName.trim() || save.isPending}
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {save.isPending ? t('common.loading') : t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


