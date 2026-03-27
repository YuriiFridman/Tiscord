import { useEffect, useMemo, useState } from 'react';
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
  const [tab, setTab] = useState<'profile' | 'appearance' | 'sound'>('profile');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [error, setError] = useState('');
  const [isLight, setIsLight] = useState(document.documentElement.getAttribute('data-theme') === 'light');
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState(localStorage.getItem('voice_input_device_id') ?? '');
  const [selectedOutput, setSelectedOutput] = useState(localStorage.getItem('voice_output_device_id') ?? '');

  const save = useMutation({
    mutationFn: () => usersApi.updateMe(buildProfilePayload(displayName, customStatus, bio)),
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

  useEffect(() => {
    let mounted = true;
    async function loadDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;
        setInputDevices(devices.filter((d) => d.kind === 'audioinput'));
        setOutputDevices(devices.filter((d) => d.kind === 'audiooutput'));
      } catch {
        // ignore
      }
    }
    loadDevices();
    return () => {
      mounted = false;
    };
  }, []);

  const canSaveProfile = useMemo(() => {
    if (!displayName.trim()) return false;
    const nextDisplay = displayName.trim();
    const nextCustom = customStatus.trim() || null;
    const nextBio = bio.trim() || null;
    return (
      nextDisplay !== (user?.display_name ?? '') ||
      nextCustom !== (user?.custom_status ?? null) ||
      nextBio !== (user?.bio ?? null)
    );
  }, [bio, customStatus, displayName, user?.bio, user?.custom_status, user?.display_name]);

  const saveAudioSettings = () => {
    localStorage.setItem('voice_input_device_id', selectedInput);
    localStorage.setItem('voice_output_device_id', selectedOutput);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--text-primary)' }}>{t('nav.settings')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="flex gap-2">
            <Button variant={tab === 'profile' ? 'default' : 'ghost'} onClick={() => setTab('profile')}>
              {t('settings.profile')}
            </Button>
            <Button variant={tab === 'appearance' ? 'default' : 'ghost'} onClick={() => setTab('appearance')}>
              {t('settings.appearance')}
            </Button>
            <Button variant={tab === 'sound' ? 'default' : 'ghost'} onClick={() => setTab('sound')}>
              {t('settings.sound')}
            </Button>
          </div>

          {tab === 'profile' && (
            <div className="space-y-3">
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
              <div>
                <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  {t('status.custom_status')}
                </label>
                <Input
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  maxLength={128}
                  style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.bio')}
                </label>
                <Input
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={256}
                  style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          )}

          {tab === 'appearance' && (
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
          )}

          {tab === 'sound' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.audio_input')}
                </label>
                <select
                  value={selectedInput}
                  onChange={(e) => setSelectedInput(e.target.value)}
                  className="h-9 w-full rounded-md px-2 text-sm"
                  style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <option value="">{t('settings.default_device')}</option>
                  {inputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `${t('settings.unknown_input_device')} (${d.deviceId.slice(0, 8)})`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.audio_output')}
                </label>
                <select
                  value={selectedOutput}
                  onChange={(e) => setSelectedOutput(e.target.value)}
                  className="h-9 w-full rounded-md px-2 text-sm"
                  style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <option value="">{t('settings.default_device')}</option>
                  {outputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `${t('settings.unknown_output_device')} (${d.deviceId.slice(0, 8)})`}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('settings.sound_note')}
              </p>
            </div>
          )}

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
              {tab !== 'sound' ? (
                <Button
                  onClick={() => save.mutate()}
                  disabled={!canSaveProfile || save.isPending}
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {save.isPending ? t('common.loading') : t('common.save')}
                </Button>
              ) : (
                <Button onClick={saveAudioSettings} style={{ background: 'var(--accent)', color: '#fff' }}>
                  {t('common.save')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildProfilePayload(displayName: string, customStatus: string, bio: string) {
  return {
    display_name: displayName.trim(),
    custom_status: customStatus.trim() || null,
    bio: bio.trim() || null,
  };
}
