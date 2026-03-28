import { create } from 'zustand';
import type { WSEvent } from '../types';
import { getAccessToken } from '../lib/api';

type Handler = (data: unknown) => void;

interface WSState {
  socket: WebSocket | null;
  connected: boolean;
  reconnectAttempt: number;
  handlers: Map<string, Set<Handler>>;

  connect: () => void;
  disconnect: () => void;
  send: (event: string, data: unknown) => void;
  on: (event: string, handler: Handler) => void;
  off: (event: string, handler: Handler) => void;
  _dispatch: (event: WSEvent) => void;
}

// When VITE_WS_URL is set (e.g. Tauri production build) use that absolute URL.
// Otherwise derive the URL from the current page origin so the app works when
// the backend serves the frontend from the same host.
function resolveWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

const WS_URL = resolveWsUrl();
const MAX_RECONNECT_DELAY = 30_000;

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export const useWebSocketStore = create<WSState>((set, get) => ({
  socket: null,
  connected: false,
  reconnectAttempt: 0,
  handlers: new Map(),

  connect: () => {
    const token = getAccessToken();
    if (!token) return;

    const { socket } = get();
    if (socket && socket.readyState <= WebSocket.OPEN) return;

    const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      set({ connected: true, reconnectAttempt: 0 });
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WSEvent;
        get()._dispatch(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      set({ connected: false, socket: null });
      const { reconnectAttempt } = get();
      const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY);
      set({ reconnectAttempt: reconnectAttempt + 1 });
      reconnectTimer = setTimeout(() => {
        if (getAccessToken()) get().connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    set({ socket: ws });
  },

  disconnect: () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const { socket } = get();
    if (socket) {
      socket.onclose = null; // prevent reconnect
      socket.close();
    }
    set({ socket: null, connected: false, reconnectAttempt: 0 });
  },

  send: (event, data) => {
    const { socket } = get();
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event, data }));
    }
  },

  on: (event, handler) => {
    const { handlers } = get();
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler);
    set({ handlers: new Map(handlers) });
  },

  off: (event, handler) => {
    const { handlers } = get();
    handlers.get(event)?.delete(handler);
    set({ handlers: new Map(handlers) });
  },

  _dispatch: (msg) => {
    const { handlers } = get();
    const set_ = handlers.get(msg.event);
    set_?.forEach((h) => h(msg.data));
    // also fire wildcard handlers with just the data payload
    handlers.get('*')?.forEach((h) => h(msg.data));
  },
}));
