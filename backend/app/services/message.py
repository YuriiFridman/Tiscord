from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.message import Message, Reaction


async def get_message_or_404(db: AsyncSession, message_id: uuid.UUID) -> Message:
    result = await db.execute(
        select(Message)
        .where(Message.id == message_id)
        .options(
            selectinload(Message.attachments),
            selectinload(Message.reactions),
            selectinload(Message.author),
            selectinload(Message.reply_to).selectinload(Message.attachments),
            selectinload(Message.reply_to).selectinload(Message.reactions),
            selectinload(Message.reply_to).selectinload(Message.author),
        )
    )
    msg = result.scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    return msg


async def list_messages(
    db: AsyncSession,
    channel_id: uuid.UUID,
    before: uuid.UUID | None = None,
    limit: int = 50,
) -> list[Message]:
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
    if before:
        subq = select(Message.created_at).where(Message.id == before).scalar_subquery()
        query = query.where(Message.created_at < subq)
    result = await db.execute(query)
    return list(reversed(result.scalars().all()))


async def add_reaction(db: AsyncSession, message_id: uuid.UUID, user_id: uuid.UUID, emoji: str) -> Reaction:
    result = await db.execute(
        select(Reaction).where(
            Reaction.message_id == message_id,
            Reaction.user_id == user_id,
            Reaction.emoji == emoji,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reaction already exists")
    reaction = Reaction(message_id=message_id, user_id=user_id, emoji=emoji)
    db.add(reaction)
    await db.commit()
    await db.refresh(reaction)
    return reaction


async def remove_reaction(db: AsyncSession, message_id: uuid.UUID, user_id: uuid.UUID, emoji: str) -> None:
    result = await db.execute(
        select(Reaction).where(
            Reaction.message_id == message_id,
            Reaction.user_id == user_id,
            Reaction.emoji == emoji,
        )
    )
    reaction = result.scalar_one_or_none()
    if reaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reaction not found")
    await db.delete(reaction)
    await db.commit()
