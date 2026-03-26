import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Guild } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getInitials } from '@/lib/utils';
import CreateGuildModal from '@/components/guild/CreateGuildModal';
import InviteModal from '@/components/guild/InviteModal';

interface Props {
  guilds: Guild[];
  activeGuildId: string | null;
  onSelectGuild: (id: string) => void;
  onSelectDMs: () => void;
  isDMActive: boolean;
}

export default function GuildSidebar({ guilds, activeGuildId, onSelectGuild, onSelectDMs, isDMActive }: Props) {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  return (
    <div
      className="flex w-[72px] flex-col items-center py-3 gap-2 overflow-y-auto"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {/* DM Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onSelectDMs}
            className={cn(
              'relative flex h-12 w-12 items-center justify-center rounded-[24px] transition-all duration-200',
              'hover:rounded-[16px]',
              isDMActive
                ? 'rounded-[16px] bg-[var(--accent)]'
                : 'bg-[var(--bg-tertiary)] hover:bg-[var(--accent)]',
            )}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" opacity=".2" />
              <polyline points="22,6 12,13 2,6" stroke="white" strokeWidth="2" fill="none" />
            </svg>
            {isDMActive && <ActivePill />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t('nav.direct_messages')}</TooltipContent>
      </Tooltip>

      {/* Divider */}
      <div className="mx-auto h-px w-8 rounded-full" style={{ background: 'var(--text-muted)' }} />

      {/* Guild list */}
      {guilds.map((guild) => (
        <GuildIcon
          key={guild.id}
          guild={guild}
          isActive={guild.id === activeGuildId}
          onClick={() => onSelectGuild(guild.id)}
        />
      ))}

      {/* Add server */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setShowCreate(true)}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-[24px] transition-all duration-200',
              'bg-[var(--bg-tertiary)] text-[var(--success)] hover:rounded-[16px] hover:bg-[var(--success)] hover:text-white',
            )}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H5a1 1 0 110-2h6V5a1 1 0 011-1z" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t('nav.add_server')}</TooltipContent>
      </Tooltip>

      {/* Join via invite */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setShowInvite(true)}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-[24px] transition-all duration-200',
              'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:rounded-[16px] hover:bg-[var(--accent)] hover:text-white',
            )}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t('guild.join_via_invite')}</TooltipContent>
      </Tooltip>

      {showCreate && <CreateGuildModal open={showCreate} onClose={() => setShowCreate(false)} />}
      {showInvite && <InviteModal mode="join" onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function GuildIcon({ guild, isActive, onClick }: { guild: Guild; isActive: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'relative flex h-12 w-12 items-center justify-center transition-all duration-200',
            isActive ? 'rounded-[16px]' : 'rounded-[24px] hover:rounded-[16px]',
          )}
        >
          <Avatar className="h-12 w-12">
            {guild.icon_url && <AvatarImage src={guild.icon_url} alt={guild.name} />}
            <AvatarFallback
              className={cn(
                'text-sm font-bold transition-all duration-200',
                isActive ? 'rounded-[16px] bg-[var(--accent)] text-white' : 'bg-[var(--bg-tertiary)]',
              )}
            >
              {getInitials(guild.name)}
            </AvatarFallback>
          </Avatar>
          {isActive && <ActivePill />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{guild.name}</TooltipContent>
    </Tooltip>
  );
}

function ActivePill() {
  return (
    <span
      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 h-5 w-1 rounded-r-full"
      style={{ background: 'var(--text-primary)', left: '-4px' }}
    />
  );
}
