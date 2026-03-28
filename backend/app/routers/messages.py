from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbDep
from app.models.message import Message
from app.schemas.message import MessageCreate, MessageOut, MessageUpdate
from app.services.channel import get_channel_or_404
from app.services.message import add_reaction, get_message_or_404, list_messages, remove_reaction
from app.ws.events import WSEvent
from app.ws.manager import manager

router = APIRouter(prefix="/channels", tags=["messages"])


class BulkDeleteRequest(BaseModel):
    message_ids: list[uuid.UUID]


class ChannelStatsOut(BaseModel):
    message_count: int


@router.get("/{channel_id}/messages", response_model=list[MessageOut])
async def get_messages(
    channel_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    before: uuid.UUID | None = None,
    limit: int = 50,
):
    await get_channel_or_404(db, channel_id)
    msgs = await list_messages(db, channel_id, before=before, limit=min(limit, 100))
    return [MessageOut.model_validate(m) for m in msgs]


@router.post("/{channel_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def create_message(channel_id: uuid.UUID, body: MessageCreate, db: DbDep, current_user: CurrentUser):
    channel = await get_channel_or_404(db, channel_id)

    # Enforce slowmode_delay
    if channel.slowmode_delay > 0:
        last_msg_result = await db.execute(
            select(Message)
            .where(Message.channel_id == channel_id, Message.author_id == current_user.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()
        if last_msg is not None:
            created = last_msg.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - created).total_seconds()
            if elapsed < channel.slowmode_delay:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Slowmode active. Wait {channel.slowmode_delay - int(elapsed)} seconds.",
                )

    msg = Message(channel_id=channel_id, author_id=current_user.id, content=body.content)
    if body.reply_to_id is not None:
        reply_target = await db.execute(
            select(Message.id).where(Message.id == body.reply_to_id, Message.channel_id == channel_id)
        )
        if reply_target.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reply target message not found")
        msg.reply_to_id = body.reply_to_id
    db.add(msg)
    await db.flush()

    # Link existing attachments to message
    if body.attachment_ids:
        from app.models.message import Attachment

        for att_id in body.attachment_ids:
            att_result = await db.execute(
                select(Attachment).where(Attachment.id == att_id, Attachment.message_id.is_(None))
            )
            att = att_result.scalar_one_or_none()
            if att:
                att.message_id = msg.id

    await db.commit()
    msg = await get_message_or_404(db, msg.id)

    payload = MessageOut.model_validate(msg).model_dump(mode="json")
    # Broadcast to guild if applicable
    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id:
        await manager.broadcast_to_guild(channel.guild_id, WSEvent.MESSAGE_CREATE, payload)

    return MessageOut.model_validate(msg)


@router.patch("/{channel_id}/messages/{message_id}", response_model=MessageOut)
async def edit_message(channel_id: uuid.UUID, message_id: uuid.UUID, body: MessageUpdate, db: DbDep, current_user: CurrentUser):
    msg = await get_message_or_404(db, message_id)
    if msg.channel_id != channel_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if msg.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit another user's message")

    msg.content = body.content
    msg.is_edited = True
    await db.commit()
    msg = await get_message_or_404(db, message_id)

    payload = MessageOut.model_validate(msg).model_dump(mode="json")
    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id:
        await manager.broadcast_to_guild(channel.guild_id, WSEvent.MESSAGE_UPDATE, payload)

    return MessageOut.model_validate(msg)


@router.delete("/{channel_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(channel_id: uuid.UUID, message_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    msg = await get_message_or_404(db, message_id)
    if msg.channel_id != channel_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if msg.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete another user's message")

    channel = await get_channel_or_404(db, channel_id)
    await db.delete(msg)
    await db.commit()

    if channel.guild_id:
        await manager.broadcast_to_guild(
            channel.guild_id, WSEvent.MESSAGE_DELETE, {"message_id": str(message_id), "channel_id": str(channel_id)}
        )


@router.post("/{channel_id}/messages/{message_id}/reactions/{emoji}", status_code=status.HTTP_201_CREATED)
async def add_reaction_endpoint(channel_id: uuid.UUID, message_id: uuid.UUID, emoji: str, db: DbDep, current_user: CurrentUser):
    await add_reaction(db, message_id, current_user.id, emoji)
    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id:
        await manager.broadcast_to_guild(
            channel.guild_id,
            WSEvent.REACTION_ADD,
            {"message_id": str(message_id), "user_id": str(current_user.id), "emoji": emoji},
        )
    return {"message_id": str(message_id), "emoji": emoji}


@router.delete("/{channel_id}/messages/{message_id}/reactions/{emoji}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_reaction_endpoint(channel_id: uuid.UUID, message_id: uuid.UUID, emoji: str, db: DbDep, current_user: CurrentUser):
    await remove_reaction(db, message_id, current_user.id, emoji)
    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id:
        await manager.broadcast_to_guild(
            channel.guild_id,
            WSEvent.REACTION_REMOVE,
            {"message_id": str(message_id), "user_id": str(current_user.id), "emoji": emoji},
        )


@router.post("/{channel_id}/messages/{message_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def pin_message(channel_id: uuid.UUID, message_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    msg = await get_message_or_404(db, message_id)
    if msg.channel_id != channel_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    msg.is_pinned = True
    await db.commit()
    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id:
        await manager.broadcast_to_guild(
            channel.guild_id, WSEvent.MESSAGE_PIN, {"message_id": str(message_id), "channel_id": str(channel_id)}
        )


@router.delete("/{channel_id}/messages/{message_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def unpin_message(channel_id: uuid.UUID, message_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    msg = await get_message_or_404(db, message_id)
    if msg.channel_id != channel_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    msg.is_pinned = False
    await db.commit()
    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id:
        await manager.broadcast_to_guild(
            channel.guild_id, WSEvent.MESSAGE_UNPIN, {"message_id": str(message_id), "channel_id": str(channel_id)}
        )


@router.get("/{channel_id}/pins", response_model=list[MessageOut])
async def get_pinned_messages(channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await get_channel_or_404(db, channel_id)
    result = await db.execute(
        select(Message)
        .where(Message.channel_id == channel_id, Message.is_pinned.is_(True))
        .options(
            selectinload(Message.attachments),
            selectinload(Message.reactions),
            selectinload(Message.author),
            selectinload(Message.reply_to).selectinload(Message.attachments),
            selectinload(Message.reply_to).selectinload(Message.reactions),
            selectinload(Message.reply_to).selectinload(Message.author),
        )
        .order_by(Message.created_at.desc())
    )
    msgs = result.scalars().all()
    return [MessageOut.model_validate(m) for m in msgs]


@router.get("/{channel_id}/messages/search", response_model=list[MessageOut])
async def search_messages(
    channel_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    q: str = Query(default=""),
    author_id: uuid.UUID | None = Query(default=None),
    before: datetime | None = Query(default=None),
    after: datetime | None = Query(default=None),
    limit: int = Query(default=50, le=100),
):
    await get_channel_or_404(db, channel_id)
    query = (
        select(Message)
        .where(Message.channel_id == channel_id)
        .options(
            selectinload(Message.attachments),
            selectinload(Message.reactions),
            selectinload(Message.author),
            selectinload(Message.reply_to).selectinload(Message.attachments),
            selectinload(Message.reply_to).selectinload(Message.reactions),
            selectinload(Message.reply_to).selectinload(Message.author),
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    if q:
        query = query.where(Message.content.ilike(f"%{q}%"))
    if author_id is not None:
        query = query.where(Message.author_id == author_id)
    if before is not None:
        query = query.where(Message.created_at < before)
    if after is not None:
        query = query.where(Message.created_at > after)
    result = await db.execute(query)
    return [MessageOut.model_validate(m) for m in result.scalars().all()]


# ─── Bulk Delete ──────────────────────────────────────────────────────────────


@router.post("/{channel_id}/messages/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete_messages(
    channel_id: uuid.UUID, body: BulkDeleteRequest, db: DbDep, current_user: CurrentUser
):
    if not body.message_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No message IDs provided")
    if len(body.message_ids) > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot bulk-delete more than 100 messages")

    channel = await get_channel_or_404(db, channel_id)
    result = await db.execute(
        select(Message).where(Message.id.in_(body.message_ids), Message.channel_id == channel_id)
    )
    messages = result.scalars().all()
    deleted_ids = []
    for msg in messages:
        deleted_ids.append(str(msg.id))
        await db.delete(msg)
    await db.commit()

    if channel.guild_id and deleted_ids:
        await manager.broadcast_to_guild(
            channel.guild_id,
            WSEvent.MESSAGE_DELETE,
            {"channel_id": str(channel_id), "message_ids": deleted_ids},
        )


# ─── Channel Stats ───────────────────────────────────────────────────────────


@router.get("/{channel_id}/stats", response_model=ChannelStatsOut)
async def channel_stats(channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await get_channel_or_404(db, channel_id)
    count_result = await db.execute(
        select(func.count()).select_from(Message).where(Message.channel_id == channel_id)
    )
    message_count = count_result.scalar() or 0
    return ChannelStatsOut(message_count=message_count)
