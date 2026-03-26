import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Guild, Channel, Category } from '@/types';
import { channelsApi, guildsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import GuildSettings from '@/components/guild/GuildSettings';
import InviteModal from '@/components/guild/InviteModal';
import CreateCategoryModal from '@/components/guild/CreateCategoryModal';
import CreateChannelModal from '@/components/guild/CreateChannelModal';

interface Props {
  guild: Guild;
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onLeaveGuild: () => void;
}

type ChannelModalState =
  | { open: false }
  | { open: true; type: 'text' | 'voice'; categoryId: string | null };

export default function ChannelSidebar({ guild, channels, activeChannelId, onSelectChannel, onLeaveGuild }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [channelModal, setChannelModal] = useState<ChannelModalState>({ open: false });

  const leaveGuild = useMutation({
    mutationFn: () => guildsApi.leave(guild.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guilds'] });
      onLeaveGuild();
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories', guild.id],
    queryFn: () => channelsApi.listCategories(guild.id),
  });

  // Group channels by category
  const uncategorized = channels.filter((c) => !c.category_id).sort((a, b) => a.position - b.position);
  const byCategory = categories
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((cat) => ({
      category: cat,
      channels: channels.filter((c) => c.category_id === cat.id).sort((a, b) => a.position - b.position),
    }));

  function openChannelModal(type: 'text' | 'voice', categoryId: string | null = null) {
    setChannelModal({ open: true, type, categoryId });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Guild header */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-12 items-center justify-between px-4 font-semibold hover:bg-white/5 transition-colors border-b border-white/5"
            style={{ color: 'var(--text-primary)' }}
          >
            <span className="truncate">{guild.name}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 ml-2">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" className="w-56">
          <DropdownMenuItem onClick={() => setShowInvite(true)}>
            <InviteIcon />
            {t('guild.invite')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowSettings(true)}>
            <SettingsIcon />
            {t('guild.settings')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowCreateCategory(true)}>
            <FolderPlusIcon />
            {t('channel.createCategory')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openChannelModal('text')}>
            <HashPlusIcon />
            {t('channel.createTextChannel')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openChannelModal('voice')}>
            <VoicePlusIcon />
            {t('channel.createVoiceChannel')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            danger
            disabled={leaveGuild.isPending}
            onClick={() => {
              if (window.confirm(t('guild.leave_confirm', { name: guild.name }))) {
                leaveGuild.mutate();
              }
            }}
          >
            <LeaveIcon />
            {t('guild.leave')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ScrollArea className="flex-1 px-2 py-3">
        {/* Uncategorized channels section header with "+" button */}
        <div className="flex items-center justify-between mb-0.5 group">
          <span
            className="text-xs font-semibold uppercase tracking-wider px-1"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('channel.channels')}
          </span>
          <button
            onClick={() => openChannelModal('text')}
            title={t('channel.createTextChannel')}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
          >
            <PlusIcon />
          </button>
        </div>

        {/* Uncategorized channels */}
        <ChannelGroup channels={uncategorized} activeChannelId={activeChannelId} onSelect={onSelectChannel} />

        {/* Categorized */}
        {byCategory.map(({ category, channels: catChannels }) => (
          <CategorySection
            key={category.id}
            category={category}
            channels={catChannels}
            activeChannelId={activeChannelId}
            onSelect={onSelectChannel}
            onAddChannel={(categoryId) => openChannelModal('text', categoryId)}
          />
        ))}

        {/* Add category "+" button */}
        <button
          onClick={() => setShowCreateCategory(true)}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-white/5"
          style={{ color: 'var(--text-muted)' }}
        >
          <PlusIcon />
          {t('channel.addCategory')}
        </button>
      </ScrollArea>

      {showSettings && <GuildSettings guild={guild} onClose={() => setShowSettings(false)} />}
      {showInvite && <InviteModal mode="create" guildId={guild.id} onClose={() => setShowInvite(false)} />}
      <CreateCategoryModal
        open={showCreateCategory}
        guildId={guild.id}
        onClose={() => setShowCreateCategory(false)}
      />
      <CreateChannelModal
        open={channelModal.open}
        guildId={guild.id}
        categories={categories}
        defaultType={channelModal.open ? channelModal.type : 'text'}
        defaultCategoryId={channelModal.open ? channelModal.categoryId : null}
        onClose={() => setChannelModal({ open: false })}
        onCreated={onSelectChannel}
      />
    </div>
  );
}

function CategorySection({
  category,
  channels,
  activeChannelId,
  onSelect,
  onAddChannel,
}: {
  category: Category;
  channels: Channel[];
  activeChannelId: string | null;
  onSelect: (id: string) => void;
  onAddChannel: (categoryId: string) => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-2">
      <div className="flex items-center group">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex flex-1 items-center gap-1 py-1 text-xs font-semibold uppercase tracking-wider hover:text-[var(--channel-hover)] transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={cn('transition-transform', collapsed ? '-rotate-90' : '')}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {category.name}
        </button>
        <button
          onClick={() => onAddChannel(category.id)}
          title={t('channel.createTextChannel')}
          className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 hover:bg-white/10"
          style={{ color: 'var(--text-muted)' }}
        >
          <PlusIcon />
        </button>
      </div>
      {!collapsed && (
        <ChannelGroup channels={channels} activeChannelId={activeChannelId} onSelect={onSelect} />
      )}
    </div>
  );
}

function ChannelGroup({
  channels,
  activeChannelId,
  onSelect,
}: {
  channels: Channel[];
  activeChannelId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {channels.map((ch) => (
        <ChannelRow key={ch.id} channel={ch} isActive={ch.id === activeChannelId} onClick={() => onSelect(ch.id)} />
      ))}
    </div>
  );
}

function ChannelRow({ channel, isActive, onClick }: { channel: Channel; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-white/10 font-medium'
          : 'hover:bg-white/5',
      )}
      style={{ color: isActive ? 'var(--channel-hover)' : 'var(--channel-text)' }}
    >
      {channel.type === 'voice' ? <VoiceIcon /> : <HashIcon />}
      <span className="truncate">{channel.name}</span>
    </button>
  );
}

function HashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}
function VoiceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function InviteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" strokeLinecap="round" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  );
}
function LeaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round"/><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function FolderPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
    </svg>
  );
}
function HashPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2">
      <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}
function VoicePlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 010 7.07" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
