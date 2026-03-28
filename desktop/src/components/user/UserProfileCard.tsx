import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { userNotesApi } from '@/lib/api';
import { usePresenceStore } from '@/store/presence';
import { useAuthStore } from '@/store/auth';
import { getInitials } from '@/lib/utils';
import type { User, UserNote } from '@/types';

interface Props {
  user: User;
  onClose: () => void;
}

export default function UserProfileCard({ user: targetUser, onClose }: Props) {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const getStatus = usePresenceStore((s) => s.getStatus);
  const qc = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);

  const isOwnProfile = currentUser?.id === targetUser.id;
  const status = getStatus(targetUser.id);

  const statusColor: Record<string, string> = {
    online: 'var(--online)',
    idle: 'var(--idle)',
    dnd: 'var(--danger)',
    offline: 'var(--offline)',
    invisible: 'var(--offline)',
  };

  const statusLabel: Record<string, string> = {
    online: t('status.online'),
    idle: t('status.idle'),
    dnd: t('status.dnd'),
    offline: t('status.offline'),
    invisible: t('status.offline'),
  };

  // Fetch note
  const { data: note } = useQuery<UserNote | null>({
    queryKey: ['userNote', targetUser.id],
    queryFn: () => userNotesApi.get(targetUser.id),
    enabled: !isOwnProfile,
  });

  const [noteContent, setNoteContent] = useState('');
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saved' | 'deleted'>('idle');

  useEffect(() => {
    setNoteContent(note?.content ?? '');
  }, [note]);

  const saveMutation = useMutation({
    mutationFn: (content: string) => userNotesApi.set(targetUser.id, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userNote', targetUser.id] });
      setNoteStatus('saved');
      setTimeout(() => setNoteStatus('idle'), 2000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => userNotesApi.remove(targetUser.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userNote', targetUser.id] });
      setNoteContent('');
      setNoteStatus('deleted');
      setTimeout(() => setNoteStatus('idle'), 2000);
    },
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleNoteSave = () => {
    const trimmed = noteContent.trim();
    if (trimmed) {
      saveMutation.mutate(trimmed);
    } else if (note) {
      deleteMutation.mutate();
    }
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleNoteSave();
    }
  };

  return (
    <div
      ref={cardRef}
      className="absolute z-50 w-72 rounded-lg shadow-xl overflow-hidden"
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* Banner / header area */}
      <div
        className="h-16 relative"
        style={{ background: 'var(--accent)' }}
      />

      {/* Avatar */}
      <div className="px-4 -mt-8 relative">
        <div className="relative inline-block">
          <Avatar className="h-16 w-16 ring-4 ring-[var(--bg-primary)]">
            {targetUser.avatar_url && <AvatarImage src={targetUser.avatar_url} />}
            <AvatarFallback
              className="text-lg"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              {getInitials(targetUser.display_name || targetUser.username)}
            </AvatarFallback>
          </Avatar>
          <span
            className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-[3px]"
            style={{
              background: statusColor[status] ?? statusColor.offline,
              borderColor: 'var(--bg-primary)',
            }}
          />
        </div>
      </div>

      {/* User info */}
      <div className="px-4 pt-2 pb-3">
        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          {targetUser.display_name || targetUser.username}
        </p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          @{targetUser.username}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: statusColor[status] ?? statusColor.offline }}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {statusLabel[status] ?? statusLabel.offline}
          </span>
          {targetUser.custom_status && (
            <span className="text-xs ml-1" style={{ color: 'var(--text-secondary)' }}>
              — {targetUser.custom_status}
            </span>
          )}
        </div>

        {targetUser.bio && (
          <div
            className="mt-3 rounded p-2 text-xs"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            {targetUser.bio}
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

      {/* Notes section - only for other users */}
      {!isOwnProfile && (
        <div className="px-4 py-3">
          <p
            className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('notes.title')}
          </p>
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            onBlur={handleNoteSave}
            onKeyDown={handleNoteKeyDown}
            placeholder={t('notes.placeholder')}
            maxLength={4096}
            rows={2}
            className="w-full resize-none rounded p-2 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {t('notes.private_hint')}
            </span>
            {noteStatus === 'saved' && (
              <span className="text-[10px]" style={{ color: 'var(--online)' }}>
                ✓ {t('notes.saved')}
              </span>
            )}
            {noteStatus === 'deleted' && (
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {t('notes.deleted')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
