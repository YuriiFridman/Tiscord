import { useEffect, useState, useCallback } from 'react';
import { useWebSocketStore } from '@/store/ws';
import { useAuthStore } from '@/store/auth';

interface Props {
  channelId: string;
}

const TYPING_EXPIRE_MS = 5000;

interface TypingUser {
  userId: string;
  username: string;
  expiresAt: number;
}

export default function TypingIndicator({ channelId }: Props) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { on, off } = useWebSocketStore.getState();

  const handleTypingStart = useCallback(
    (raw: unknown) => {
      const data = raw as { channel_id: string; user_id: string; username: string };
      if (data.channel_id !== channelId) return;
      if (data.user_id === currentUserId) return;

      const expiresAt = Date.now() + TYPING_EXPIRE_MS;

      setTypingUsers((prev) => {
        const exists = prev.find((u) => u.userId === data.user_id);
        if (exists) {
          return prev.map((u) =>
            u.userId === data.user_id ? { ...u, expiresAt } : u,
          );
        }
        return [
          ...prev,
          { userId: data.user_id, username: data.username ?? data.user_id, expiresAt },
        ];
      });
    },
    [channelId, currentUserId],
  );

  useEffect(() => {
    on('TYPING_START', handleTypingStart);
    return () => off('TYPING_START', handleTypingStart);
  }, [on, off, handleTypingStart]);

  // Expire stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => u.expiresAt > now));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (typingUsers.length === 0) {
    return <div className="h-5" />;
  }

  let label = '';
  if (typingUsers.length === 1) {
    label = `${typingUsers[0].username} is typing…`;
  } else if (typingUsers.length === 2) {
    label = `${typingUsers[0].username} and ${typingUsers[1].username} are typing…`;
  } else {
    label = 'Several people are typing…';
  }

  return (
    <div className="flex h-5 items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1 w-1 rounded-full animate-bounce"
            style={{
              background: 'var(--text-muted)',
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}
