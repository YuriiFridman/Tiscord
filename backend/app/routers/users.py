from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.deps import CurrentUser, DbDep
from app.models.guild import GuildMember
from app.models.user import User
from app.schemas.user import UserOut, UserUpdateRequest
from app.ws.manager import manager

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search", response_model=list[UserOut])
async def search_users(db: DbDep, current_user: CurrentUser, q: str = Query(..., min_length=1)):
    result = await db.execute(select(User).where(User.username.ilike(f"%{q}%")).limit(25))
    return [UserOut.model_validate(u) for u in result.scalars().all()]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
async def update_me(body: UserUpdateRequest, db: DbDep, current_user: CurrentUser):
    status_changed = body.status is not None and body.status != current_user.status

    if body.display_name is not None:
        current_user.display_name = body.display_name
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    if body.status is not None:
        current_user.status = body.status
    if body.custom_status is not None:
        current_user.custom_status = body.custom_status
    if body.bio is not None:
        current_user.bio = body.bio
    await db.commit()
    await db.refresh(current_user)

    # Broadcast PRESENCE_UPDATE to all guilds the user belongs to
    if status_changed:
        result = await db.execute(
            select(GuildMember).where(GuildMember.user_id == current_user.id)
        )
        memberships = result.scalars().all()
        for membership in memberships:
            await manager.broadcast_presence(
                membership.guild_id,
                current_user.id,
                current_user.status or "online",
            )

    return UserOut.model_validate(current_user)
