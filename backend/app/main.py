from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.dm import DmParticipant
from app.models.guild import GuildMember
from app.models.user import User
from app.routers import attachments, auth, channels, dms, guilds, invites, messages, moderation, notifications, roles, social, totp, users, voice, webhooks
from app.services.auth import decode_access_token
from app.ws.events import WSEvent
from app.ws.manager import Connection, manager

# Ensure all models are imported so Base.metadata includes all tables.
import app.models.user  # noqa: F401
import app.models.guild  # noqa: F401
import app.models.channel  # noqa: F401
import app.models.message  # noqa: F401
import app.models.dm  # noqa: F401
import app.models.role  # noqa: F401
import app.models.invite  # noqa: F401
import app.models.moderation  # noqa: F401
import app.models.voice  # noqa: F401
import app.models.social  # noqa: F401
import app.models.webhook  # noqa: F401
import app.models.notification  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Alembic migrations on every startup to keep the schema up to date.
    # We run the synchronous alembic command in a thread to avoid blocking the
    # event loop and to allow alembic's own asyncio.run() call inside env.py
    # to work correctly (it needs a thread without a running event loop).
    def _run_migrations() -> None:
        import os
        from alembic import command
        from alembic.config import Config as AlembicConfig

        ini_path = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
        cfg = AlembicConfig(ini_path)
        command.upgrade(cfg, "head")

    await asyncio.get_event_loop().run_in_executor(None, _run_migrations)

    # Create upload directory if using local storage
    if settings.STORAGE_BACKEND == "local":
        import os

        os.makedirs(settings.STORAGE_LOCAL_PATH, exist_ok=True)
    yield


app = FastAPI(
    title="Tiscord API",
    version="1.0.0",
    description="Backend API for Tiscord, a Discord-like application.",
    lifespan=lifespan,
)

# CORS
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files in dev mode
if settings.STORAGE_BACKEND == "local":
    import os
    os.makedirs(settings.STORAGE_LOCAL_PATH, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.STORAGE_LOCAL_PATH), name="uploads")

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(guilds.router, prefix=API_PREFIX)
app.include_router(channels.router, prefix=API_PREFIX)
app.include_router(messages.router, prefix=API_PREFIX)
app.include_router(attachments.router, prefix=API_PREFIX)
app.include_router(dms.router, prefix=API_PREFIX)
app.include_router(invites.router, prefix=API_PREFIX)
app.include_router(roles.router, prefix=API_PREFIX)
app.include_router(moderation.router, prefix=API_PREFIX)
app.include_router(voice.router, prefix=API_PREFIX)
app.include_router(social.router, prefix=API_PREFIX)
app.include_router(webhooks.router, prefix=API_PREFIX)
app.include_router(notifications.router, prefix=API_PREFIX)
app.include_router(totp.router, prefix=API_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    payload = decode_access_token(token)
    if payload is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = uuid.UUID(payload["sub"])
    conn = Connection(websocket, user_id)

    await websocket.accept()
    manager.connect(conn)

    async with AsyncSessionLocal() as db:
        # Load guild memberships and DM participations for subscription
        guild_result = await db.execute(select(GuildMember.guild_id).where(GuildMember.user_id == user_id))
        conn.guild_ids = {row for row in guild_result.scalars().all()}

        dm_result = await db.execute(select(DmParticipant.dm_thread_id).where(DmParticipant.user_id == user_id))
        conn.dm_thread_ids = {row for row in dm_result.scalars().all()}

        user_result = await db.execute(select(User).where(User.id == user_id))
        _user = user_result.scalar_one_or_none()

    # Send READY event
    await conn.send({
        "event": WSEvent.READY,
        "data": {
            "user_id": str(user_id),
            "guild_ids": [str(g) for g in conn.guild_ids],
        },
    })

    # Broadcast online presence to all guilds
    for guild_id in conn.guild_ids:
        await manager.broadcast_presence(guild_id, user_id, "online")

    try:
        while True:
            data = await websocket.receive_json()
            event = data.get("event")

            if event == "TYPING_START":
                channel_id = data.get("data", {}).get("channel_id")
                guild_id = data.get("data", {}).get("guild_id")
                if guild_id and channel_id:
                    await manager.broadcast_to_guild(
                        uuid.UUID(guild_id),
                        WSEvent.TYPING_START,
                        {"channel_id": channel_id, "user_id": str(user_id)},
                        exclude_user=user_id,
                    )

            elif event == "CALL_SIGNAL":
                # Relay WebRTC signaling (offer/answer/ice-candidate) to target user
                target_user_id = data.get("data", {}).get("target_user_id")
                if target_user_id:
                    await manager.send_to_user(
                        uuid.UUID(target_user_id),
                        WSEvent.CALL_SIGNAL,
                        {**data.get("data", {}), "from_user_id": str(user_id)},
                    )

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(conn)
        for guild_id in conn.guild_ids:
            await manager.broadcast_presence(guild_id, user_id, "offline")
