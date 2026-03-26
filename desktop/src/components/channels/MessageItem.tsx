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
  onReply?: (message: Message) => void;
}

// ─── Simple inline markdown renderer ─────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  // Split off code blocks first
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderInline(text.slice(lastIndex, match.index), `pre-${match.index}`));
    }
    parts.push(
      <pre
        key={`code-${match.index}`}
        className="my-1 rounded px-3 py-2 text-xs overflow-x-auto"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
      >
        <code>{match[1].trim()}</code>
      </pre>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(...renderInline(text.slice(lastIndex), `tail-${lastIndex}`));
  }

  return <>{parts}</>;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Pattern order matters: bold, italic, strikethrough, code, url
  const tokenRegex =
    /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|(~~)(.+?)\5|(`[^`]+`)|((https?:\/\/)[^\s]+)/g;

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = tokenRegex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));

    if (m[1]) {
      nodes.push(<strong key={`${keyPrefix}-b-${m.index}`}>{m[2]}</strong>);
    } else if (m[3]) {
      nodes.push(<em key={`${keyPrefix}-i-${m.index}`}>{m[4]}</em>);
    } else if (m[5]) {
      nodes.push(<del key={`${keyPrefix}-s-${m.index}`}>{m[6]}</del>);
    } else if (m[7]) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${m.index}`}
          className="rounded px-1 py-0.5 text-xs font-mono"
          style={{ background: 'var(--bg-tertiary)' }}
        >
          {m[7].slice(1, -1)}
        </code>,
      );
    } else if (m[8]) {
      nodes.push(
        <a
          key={`${keyPrefix}-u-${m.index}`}
          href={m[8]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
          style={{ color: 'var(--accent)' }}
        >
          {m[8]}
        </a>,
      );
    }

    last = m.index + m[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────

const COMMON_EMOJIS = ['👍', '👎', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🤔', '👀'];

function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <div
      className="absolute right-0 top-8 z-10 rounded-lg p-2 shadow-lg"
      style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div className="flex gap-1">
        {COMMON_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onPick(emoji); onClose(); }}
            className="rounded p-1 text-lg hover:bg-white/10 transition-colors"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MessageItem ──────────────────────────────────────────────────────────────

export default function MessageItem({ message, channelId, isGrouped = false, onReply }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [hovering, setHovering] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

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
      onMouseLeave={() => { setHovering(false); setShowEmoji(false); }}
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
        {/* Reply preview */}
        {message.reply_to && (
          <div
            className="mb-1 flex items-center gap-1.5 rounded px-2 py-1 text-xs border-l-2"
            style={{
              background: 'var(--bg-tertiary)',
              borderColor: 'var(--text-muted)',
              color: 'var(--text-muted)',
            }}
          >
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {message.reply_to.author.display_name || message.reply_to.author.username}
            </span>
            <span className="truncate max-w-xs">{message.reply_to.content}</span>
          </div>
        )}

        {!isGrouped && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {message.author.display_name || message.author.username}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {formatTime(message.created_at)}
            </span>
            {message.is_pinned && (
              <span className="text-[11px]" title={t('pins.title')}>📌</span>
            )}
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
          <div className="text-sm break-words whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
            {renderMarkdown(message.content)}
            {message.is_edited && (
              <span className="ml-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {t('messages.edited')}
              </span>
            )}
          </div>
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
      {hovering && !editing && (
        <div
          className="absolute right-4 top-0 flex gap-1 rounded p-1"
          style={{ background: 'var(--bg-primary)' }}
        >
          {/* Emoji picker button */}
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setShowEmoji((v) => !v)}
              title={t('messages.react')}
            >
              +
            </Button>
            {showEmoji && (
              <EmojiPicker
                onPick={(emoji) => reactMutation.mutate({ emoji, me: false })}
                onClose={() => setShowEmoji(false)}
              />
            )}
          </div>

          {/* Reply button */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onReply?.(message)}
          >
            {t('messages.reply')}
          </Button>

          {isOwn && (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
