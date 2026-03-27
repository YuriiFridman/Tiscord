from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbDep
from app.models.channel import Channel
from app.models.voice import VoiceSession
from app.ws.events import WSEvent
from app.ws.manager import manager

router = APIRouter(prefix="/voice", tags=["voice"])


class VoiceStateUpdateIn(BaseModel):
    is_muted: bool | None = None
    is_deafened: bool | None = None


def _serialize_user(user) -> dict:
    return {
        "id": str(user.id),
        "username": user.username,
        "display_name": user.display_name,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at.isoformat(),
        "status": user.status,
    }


def _serialize_session(s: VoiceSession) -> dict:
    return {
        "user": _serialize_user(s.user),
        "is_muted": s.is_muted,
        "is_deafened": s.is_deafened,
    }


@router.get("/channels/{channel_id}/participants")
async def voice_participants(channel_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(VoiceSession)
        .where(VoiceSession.channel_id == channel_id)
        .options(selectinload(VoiceSession.user))
    )
    sessions = result.scalars().all()
    return [_serialize_session(s) for s in sessions]


@router.post("/channels/{channel_id}/join", status_code=status.HTTP_200_OK)
async def join_voice_channel(channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    # Remove any existing session for this user in this channel (idempotent)
    existing = await db.execute(
        select(VoiceSession)
        .where(VoiceSession.channel_id == channel_id, VoiceSession.user_id == current_user.id)
        .options(selectinload(VoiceSession.user))
    )
    session = existing.scalar_one_or_none()
    if not session:
        session = VoiceSession(channel_id=channel_id, user_id=current_user.id)
        db.add(session)
        await db.commit()
        await db.refresh(session)
        # Reload with user relationship
        result = await db.execute(
            select(VoiceSession)
            .where(VoiceSession.id == session.id)
            .options(selectinload(VoiceSession.user))
        )
        session = result.scalar_one()

    # Broadcast voice state update to all guild members via channel's guild
    ch_result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = ch_result.scalar_one_or_none()
    if channel and channel.guild_id:
        await manager.broadcast_to_guild(
            channel.guild_id,
            WSEvent.VOICE_STATE_UPDATE,
            {
                "channel_id": str(channel_id),
                "action": "join",
                "user": _serialize_user(current_user),
                "is_muted": session.is_muted,
                "is_deafened": session.is_deafened,
            },
        )

    return _serialize_session(session)


@router.post("/channels/{channel_id}/leave", status_code=status.HTTP_200_OK)
async def leave_voice_channel(channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(VoiceSession)
        .where(VoiceSession.channel_id == channel_id, VoiceSession.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if session:
        await db.delete(session)
        await db.commit()

    # Broadcast voice state update
    ch_result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = ch_result.scalar_one_or_none()
    if channel and channel.guild_id:
        await manager.broadcast_to_guild(
            channel.guild_id,
            WSEvent.VOICE_STATE_UPDATE,
            {
                "channel_id": str(channel_id),
                "action": "leave",
                "user": _serialize_user(current_user),
                "is_muted": False,
                "is_deafened": False,
            },
        )

    return {"ok": True}


@router.patch("/channels/{channel_id}/state", status_code=status.HTTP_200_OK)
async def update_voice_state(channel_id: uuid.UUID, body: VoiceStateUpdateIn, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(VoiceSession)
        .where(VoiceSession.channel_id == channel_id, VoiceSession.user_id == current_user.id)
        .options(selectinload(VoiceSession.user), selectinload(VoiceSession.channel))
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voice session not found")

    if body.is_muted is not None:
        session.is_muted = body.is_muted
    if body.is_deafened is not None:
        session.is_deafened = body.is_deafened
    await db.commit()

    if session.channel and session.channel.guild_id:
        await manager.broadcast_to_guild(
            session.channel.guild_id,
            WSEvent.VOICE_STATE_UPDATE,
            {
                "channel_id": str(channel_id),
                "action": "state",
                "user": _serialize_user(session.user),
                "is_muted": session.is_muted,
                "is_deafened": session.is_deafened,
            },
        )

    return {"ok": True}
