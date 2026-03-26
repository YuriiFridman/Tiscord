import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth';
import { usePresenceStore } from '@/store/presence';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getInitials } from '@/lib/utils';
import UserSettings from '@/components/settings/UserSettings';

export default function UserPanel() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const getStatus = usePresenceStore((s) => s.getStatus);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (!user) return null;

  const status = getStatus(user.id);

  const statusColor: Record<string, string> = {
    online: 'var(--online)',
    idle: 'var(--idle)',
    offline: 'var(--offline)',
  };

  return (
    <div
      className="flex items-center gap-2 px-2 py-2 border-t border-white/5"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {/* Avatar + name */}
      <div className="relative flex-1 flex items-center gap-2 min-w-0">
        <div className="relative">
          <Avatar className="h-8 w-8">
            {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.display_name} />}
            <AvatarFallback className="text-xs">{getInitials(user.display_name)}</AvatarFallback>
          </Avatar>
          <span
            className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2"
            style={{
              background: statusColor[status] ?? statusColor.offline,
              borderColor: 'var(--bg-secondary)',
            }}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {user.display_name}
          </p>
          <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
            @{user.username}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsMuted((m) => !m)}
              className="rounded p-1.5 transition-colors hover:bg-white/10"
              style={{ color: isMuted ? 'var(--danger)' : 'var(--text-secondary)' }}
            >
              {isMuted ? <MicOffIcon /> : <MicIcon />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{isMuted ? t('voice.unmute') : t('voice.mute')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsDeafened((d) => !d)}
              className="rounded p-1.5 transition-colors hover:bg-white/10"
              style={{ color: isDeafened ? 'var(--danger)' : 'var(--text-secondary)' }}
            >
              {isDeafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{isDeafened ? t('voice.undeafen') : t('voice.deafen')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded p-1.5 transition-colors hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}
            >
              <SettingsIcon />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('nav.settings')}</TooltipContent>
        </Tooltip>
      </div>

      {showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" strokeLinecap="round" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" strokeLinecap="round" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function HeadphonesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 18v-6a9 9 0 0118 0v6" /><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
    </svg>
  );
}
function HeadphonesOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 3L3 21" strokeLinecap="round" /><path d="M3 18v-6a9 9 0 018.05-8.93M12 3c4.97 0 9 4.03 9 9v6" /><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  );
}
