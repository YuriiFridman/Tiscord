import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { messagesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { queryClient } from '@/lib/queryClient';
import { cn, formatTime, getInitials, formatFileSize } from '@/lib/utils';
import type { Message } from '@/types';

interface Props {
  message: Message;
  channelId: string;
  isGrouped?: boolean;
}

export default function MessageItem({ message, channelId, isGrouped = false }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [hovering, setHovering] = useState(false);

  const editMutation = useMutation({
    mutationFn: (content: string) => messagesApi.edit(channelId, message.id, content),
    onSuccess: (updated) => {
      queryClient.setQueryData<{ pages: { items: Message[] }[] }>(
        ['messages', channelId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((m) => (m.id === updated.id ? updated : m)),
            })),
          };
        },
      );
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => messagesApi.delete(channelId, message.id),
    onSuccess: () => {
      queryClient.setQueryData<{ pages: { items: Message[] }[] }>(
        ['messages', channelId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((m) => m.id !== message.id),
            })),
          };
        },
      );
    },
  });

  const reactMutation = useMutation({
    mutationFn: ({ emoji, me }: { emoji: string; me: boolean }) =>
      me ? messagesApi.unreact(channelId, message.id, emoji) : messagesApi.react(channelId, message.id, emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
    },
  });

  const isOwn = user?.id === message.author.id;

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editContent.trim() && editContent !== message.content) {
      editMutation.mutate(editContent.trim());
    } else {
      setEditing(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditing(false);
      setEditContent(message.content);
    }
  };

  const isImage = (contentType: string) => contentType.startsWith('image/');

  return (
    <div
      className={cn('group relative flex gap-3 px-4 py-0.5 hover:bg-white/5', !isGrouped && 'mt-4 pt-1')}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Avatar or spacer */}
      <div className="w-10 shrink-0">
        {!isGrouped ? (
          <Avatar className="h-10 w-10">
            {message.author.avatar_url && <AvatarImage src={message.author.avatar_url} />}
            <AvatarFallback style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              {getInitials(message.author.display_name || message.author.username)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span
            className="invisible text-[10px] leading-10 group-hover:visible"
            style={{ color: 'var(--text-muted)' }}
          >
            {formatTime(message.created_at)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {!isGrouped && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {message.author.display_name || message.author.username}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {formatTime(message.created_at)}
            </span>
          </div>
        )}

        {editing ? (
          <form onSubmit={handleEditSubmit} className="mt-1">
            <Input
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              autoFocus
              className="mb-1 text-sm"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
            />
            <div className="flex gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <button type="submit" className="hover:underline" style={{ color: 'var(--accent)' }}>
                {t('common.save')}
              </button>
              <span>•</span>
              <button type="button" onClick={() => { setEditing(false); setEditContent(message.content); }} className="hover:underline">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm break-words whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
            {message.content}
            {message.is_edited && (
              <span className="ml-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {t('messages.edited')}
              </span>
            )}
          </p>
        )}

        {/* Attachments */}
        {message.attachments.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {message.attachments.map((att) => (
              <div key={att.id}>
                {isImage(att.content_type) ? (
                  <img
                    src={att.url}
                    alt={att.filename}
                    className="max-w-xs max-h-64 rounded object-contain"
                  />
                ) : (
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded p-2 text-sm hover:opacity-80"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--accent)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span>{att.filename}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{formatFileSize(att.size)}</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                onClick={() => reactMutation.mutate({ emoji: reaction.emoji, me: reaction.me })}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-0.5 text-sm transition-colors',
                  reaction.me ? 'ring-1 ring-[var(--accent)]' : 'hover:bg-white/10',
                )}
                style={{
                  background: reaction.me ? 'rgba(233,69,96,0.15)' : 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              >
                <span>{reaction.emoji}</span>
                <span className="text-xs">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {hovering && isOwn && !editing && (
        <div
          className="absolute right-4 top-0 flex gap-1 rounded p-1"
          style={{ background: 'var(--bg-primary)' }}
        >
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => { setEditing(true); setEditContent(message.content); }}
          >
            {t('messages.edit')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            style={{ color: 'var(--danger)' }}
            onClick={() => {
              if (confirm(t('messages.delete_confirm'))) deleteMutation.mutate();
            }}
          >
            {t('messages.delete')}
          </Button>
        </div>
      )}
    </div>
  );
}
