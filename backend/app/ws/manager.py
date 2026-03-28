from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

from app.ws.events import WSEvent

logger = logging.getLogger(__name__)


class Connection:
    """Represents a single WebSocket connection for a user."""

    def __init__(self, websocket: WebSocket, user_id: uuid.UUID) -> None:
        self.websocket = websocket
        self.user_id = user_id
        self.guild_ids: set[uuid.UUID] = set()
        self.dm_thread_ids: set[uuid.UUID] = set()

    async def send(self, data: dict) -> None:
        try:
            await self.websocket.send_json(data)
        except Exception as exc:
            logger.debug("WebSocket send failed for user %s: %s", self.user_id, exc)


class ConnectionManager:
    """Manages all active WebSocket connections and provides event broadcasting."""

    def __init__(self) -> None:
        # user_id -> list of connections (multi-device support)
        self._user_connections: dict[uuid.UUID, list[Connection]] = defaultdict(list)

    def connect(self, conn: Connection) -> None:
        self._user_connections[conn.user_id].append(conn)

    def disconnect(self, conn: Connection) -> None:
        conns = self._user_connections.get(conn.user_id, [])
        if conn in conns:
            conns.remove(conn)
        if not conns:
            self._user_connections.pop(conn.user_id, None)

    def is_online(self, user_id: uuid.UUID) -> bool:
        return bool(self._user_connections.get(user_id))

    async def send_to_user(self, user_id: uuid.UUID, event: str, data: Any) -> None:
        payload = {"event": event, "data": data}
        conns = self._user_connections.get(user_id, [])
        await asyncio.gather(*(c.send(payload) for c in conns), return_exceptions=True)

    async def broadcast_to_guild(self, guild_id: uuid.UUID, event: str, data: Any, exclude_user: uuid.UUID | None = None) -> None:
        payload = {"event": event, "data": data}
        tasks = []
        for user_id, conns in self._user_connections.items():
            if user_id == exclude_user:
                continue
            for conn in conns:
                if guild_id in conn.guild_ids:
                    tasks.append(conn.send(payload))
        await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_to_channel(self, guild_id: uuid.UUID, event: str, data: Any) -> None:
        """Broadcasts to all members subscribed to the guild (channel-level granularity via guild membership)."""
        await self.broadcast_to_guild(guild_id, event, data)

    async def broadcast_to_dm(self, dm_thread_id: uuid.UUID, event: str, data: Any) -> None:
        payload = {"event": event, "data": data}
        tasks = []
        for conns in self._user_connections.values():
            for conn in conns:
                if dm_thread_id in conn.dm_thread_ids:
                    tasks.append(conn.send(payload))
        await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_presence(self, guild_id: uuid.UUID, user_id: uuid.UUID, status: str) -> None:
        await self.broadcast_to_guild(
            guild_id,
            WSEvent.PRESENCE_UPDATE,
            {"user_id": str(user_id), "status": status},
        )

    def get_online_users_for_guilds(self, guild_ids: set[uuid.UUID], exclude_user: uuid.UUID) -> list[uuid.UUID]:
        """Return user IDs that are online and share at least one of the given guild IDs."""
        online: list[uuid.UUID] = []
        seen: set[uuid.UUID] = set()
        for uid, conns in self._user_connections.items():
            if uid == exclude_user or uid in seen:
                continue
            for conn in conns:
                if conn.guild_ids & guild_ids:
                    online.append(uid)
                    seen.add(uid)
                    break
        return online


manager = ConnectionManager()
