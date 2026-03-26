import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { messagesApi } from '@/lib/api';
import { useTyping } from '@/hooks/useTyping';
import { queryClient } from '@/lib/queryClient';
import { cn, formatFileSize } from '@/lib/utils';
import type { Message } from '@/types';
import TypingIndicator from './TypingIndicator';

interface Props {
  channelId: string;
  guildId: string | null;
  placeholder?: string;
  onSend?: (content: string) => Promise<void>;
}

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

interface PendingFile {
  id: string;
  file: File;
}

export default function MessageInput({ channelId, guildId, placeholder, onSend }: Props) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { onKeystroke } = useTyping(channelId, guildId);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (onSend) {
        await onSend(text);
      } else {
        return messagesApi.send(channelId, text);
      }
    },
    onSuccess: (msg) => {
      if (!onSend && msg) {
        queryClient.setQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
          ['messages', channelId],
          (old) => {
            if (!old) return old;
            const pages = [...old.pages];
            const lastPage = pages[pages.length - 1];
            pages[pages.length - 1] = [...lastPage, msg];
            return { ...old, pages };
          },
        );
      }
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    onKeystroke();
    // Auto-resize textarea
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  const handleSubmit = useCallback(() => {
    const text = content.trim();
    if (!text && pendingFiles.length === 0) return;
    if (text) {
      sendMutation.mutate(text);
      setContent('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
    setPendingFiles([]);
    setFileError('');
  }, [content, pendingFiles, sendMutation]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const files = Array.from(e.target.files ?? []);
    const tooBig = files.find((f) => f.size > MAX_FILE_SIZE);
    if (tooBig) {
      setFileError(t('messages.file_too_large'));
      e.target.value = '';
      return;
    }
    const newFiles: PendingFile[] = files.map((f) => ({ id: crypto.randomUUID(), file: f }));
    setPendingFiles((prev) => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="shrink-0 px-4 pb-4" style={{ background: 'var(--bg-chat)' }}>
      {/* Typing indicator */}
      <TypingIndicator channelId={channelId} />

      {/* File error */}
      {fileError && (
        <p className="mb-1 text-xs" style={{ color: 'var(--danger)' }}>{fileError}</p>
      )}

      {/* Pending file chips */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingFiles.map(({ id, file }) => (
            <div
              key={id}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              <span className="max-w-[120px] truncate">{file.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>({formatFileSize(file.size)})</span>
              <button
                onClick={() => removeFile(id)}
                className="ml-1 hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div
        className="flex items-end gap-2 rounded-lg px-3 py-2"
        style={{ background: 'var(--bg-tertiary)' }}
      >
        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mb-1 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          title={t('messages.attach_file')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? t('messages.type_message')}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent text-sm outline-none',
            'max-h-[200px] overflow-y-auto leading-5',
          )}
          style={{ color: 'var(--text-primary)' }}
        />

        {/* Send button */}
        <Button
          size="sm"
          className="mb-0.5 shrink-0 h-8 w-8 p-0"
          disabled={(!content.trim() && pendingFiles.length === 0) || sendMutation.isPending}
          onClick={handleSubmit}
          style={{ background: 'var(--accent)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
