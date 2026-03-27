import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import { messagesApi } from '@/lib/api';
import { useWebSocketStore } from '@/store/ws';
import { queryClient } from '@/lib/queryClient';
import { formatDateHeader, isSameDay } from '@/lib/utils';
import type { Message } from '@/types';
import MessageItem from './MessageItem';

interface Props {
  channelId: string;
  guildId: string;
  onReply?: (message: Message) => void;
}

const PAGE_SIZE = 50;

export default function MessageList({ channelId, onReply }: Props) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef<number>(0);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['messages', channelId],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      return messagesApi.list(channelId, { before: pageParam, limit: PAGE_SIZE });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (firstPage: Message[]) => {
      if (firstPage.length < PAGE_SIZE) return undefined;
      return firstPage[0]?.id;
    },
    select: (data) => ({
      pages: [...data.pages].reverse(),
      pageParams: [...data.pageParams].reverse(),
    }),
  });

  // Flatten messages in order
  const messages: Message[] = data
    ? data.pages.flatMap((page) => [...page].reverse()).reverse()
    : [];

  // Scroll to bottom on initial load and new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [channelId]);

  // Preserve scroll position when loading older messages
  useEffect(() => {
    if (isFetchingNextPage) {
      prevScrollHeight.current = containerRef.current?.scrollHeight ?? 0;
    } else if (prevScrollHeight.current > 0 && containerRef.current) {
      const newScrollHeight = containerRef.current.scrollHeight;
      containerRef.current.scrollTop = newScrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = 0;
    }
  }, [isFetchingNextPage]);

  // Auto-scroll to bottom for new messages (only when near bottom)
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    // containerRef and bottomRef are stable React refs and intentionally omitted from deps
  }, [lastMessageId]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // WS event handlers
  const handleMessageCreate = useCallback(
    (raw: unknown) => {
      const msg = raw as Message;
      if (msg.channel_id !== channelId) return;
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
    },
    [channelId],
  );

  const handleMessageUpdate = useCallback(
    (raw: unknown) => {
      const msg = raw as Message;
      if (msg.channel_id !== channelId) return;
      queryClient.setQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
        ['messages', channelId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => page.map((m) => (m.id === msg.id ? msg : m))),
          };
        },
      );
    },
    [channelId],
  );

  const handleMessageDelete = useCallback(
    (raw: unknown) => {
      const { message_id, channel_id } = raw as { message_id: string; channel_id: string };
      if (channel_id !== channelId) return;
      queryClient.setQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
        ['messages', channelId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => page.filter((m) => m.id !== message_id)),
          };
        },
      );
    },
    [channelId],
  );

  const { on, off } = useWebSocketStore.getState();

  useEffect(() => {
    on('MESSAGE_CREATE', handleMessageCreate);
    on('DM_MESSAGE_CREATE', handleMessageCreate);
    on('MESSAGE_UPDATE', handleMessageUpdate);
    on('MESSAGE_DELETE', handleMessageDelete);
    return () => {
      off('MESSAGE_CREATE', handleMessageCreate);
      off('DM_MESSAGE_CREATE', handleMessageCreate);
      off('MESSAGE_UPDATE', handleMessageUpdate);
      off('MESSAGE_DELETE', handleMessageDelete);
    };
  }, [on, off, handleMessageCreate, handleMessageUpdate, handleMessageDelete]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      style={{ background: 'var(--bg-chat)' }}
    >
      <div className="pb-2">
        {/* Top sentinel */}
        <div ref={topRef} className="h-1" />

        {isFetchingNextPage && (
          <div className="py-2 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('common.loading')}
          </div>
        )}

        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
            <p className="text-lg font-semibold">{t('messages.no_messages')}</p>
            <p className="text-sm">{t('messages.be_first')}</p>
          </div>
        )}

        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const showDateHeader = !prev || !isSameDay(prev.created_at, message.created_at);
          const isGrouped =
            !showDateHeader &&
            prev?.author.id === message.author.id &&
            new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;

          return (
            <div key={message.id}>
              {showDateHeader && (
                <div className="my-4 flex items-center gap-3 px-4">
                  <div className="flex-1 border-t border-white/10" />
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {formatDateHeader(message.created_at)}
                  </span>
                  <div className="flex-1 border-t border-white/10" />
                </div>
              )}
              <MessageItem
                message={message}
                channelId={channelId}
                isGrouped={isGrouped}
                onReply={onReply}
              />
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
