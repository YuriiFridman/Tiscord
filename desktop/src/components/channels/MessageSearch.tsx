import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { searchApi } from '@/lib/api';
import { formatTime } from '@/lib/utils';
import type { Message } from '@/types';

interface Props {
  channelId: string;
  onClose: () => void;
}

export default function MessageSearch({ channelId, onClose }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [committed, setCommitted] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results = [], isFetching } = useQuery<Message[]>({
    queryKey: ['messageSearch', channelId, committed],
    queryFn: () => searchApi.messages(channelId, committed),
    enabled: committed.trim().length > 0,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') setCommitted(query.trim());
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="flex h-full w-80 shrink-0 flex-col border-l border-white/5"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-3"
        style={{ background: 'var(--bg-primary)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <Input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          className="flex-1 border-0 bg-transparent text-sm outline-none focus-visible:ring-0 px-0"
          style={{ color: 'var(--text-primary)' }}
        />
        <button
          onClick={onClose}
          className="ml-auto shrink-0 rounded p-1 hover:bg-white/10 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          aria-label={t('common.close')}
        >
          ✕
        </button>
      </div>

      <ScrollArea className="flex-1 p-3">
        {isFetching && (
          <p className="text-center text-sm py-4" style={{ color: 'var(--text-muted)' }}>
            {t('common.loading')}
          </p>
        )}

        {!isFetching && committed && results.length === 0 && (
          <div className="flex flex-col items-center py-10 gap-2">
            <span className="text-3xl">🔍</span>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('search.no_results')}</p>
          </div>
        )}

        {!isFetching && results.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {t('search.results')} — {results.length}
            </p>
            <div className="space-y-2">
              {results.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg p-3 text-sm"
                  style={{ background: 'var(--bg-tertiary)' }}
                >
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
                      {msg.author.display_name || msg.author.username}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <p className="break-words text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {msg.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
