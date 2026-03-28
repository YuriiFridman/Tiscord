from __future__ import annotations

import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentUser, DbDep
from app.models.read_state import ReadState
from app.schemas.read_state import ReadStateOut, ReadStateUpdate
from app.services.channel import get_channel_or_404

router = APIRouter(tags=["read-state"])


@router.get("/channels/{channel_id}/ack", response_model=ReadStateOut | None)
async def get_read_state(channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await get_channel_or_404(db, channel_id)
    result = await db.execute(
        select(ReadState).where(
            ReadState.user_id == current_user.id,
            ReadState.channel_id == channel_id,
        )
    )
    rs = result.scalar_one_or_none()
    if rs is None:
        return None
    return ReadStateOut.model_validate(rs)


@router.put("/channels/{channel_id}/ack", response_model=ReadStateOut)
async def set_read_state(
    channel_id: uuid.UUID, body: ReadStateUpdate, db: DbDep, current_user: CurrentUser
):
    await get_channel_or_404(db, channel_id)
    result = await db.execute(
        select(ReadState).where(
            ReadState.user_id == current_user.id,
            ReadState.channel_id == channel_id,
        )
    )
    rs = result.scalar_one_or_none()
    if rs is None:
        rs = ReadState(
            user_id=current_user.id,
            channel_id=channel_id,
            last_message_id=body.last_message_id,
        )
        db.add(rs)
    else:
        rs.last_message_id = body.last_message_id
    await db.commit()
    await db.refresh(rs)
    return ReadStateOut.model_validate(rs)
