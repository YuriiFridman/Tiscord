from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentUser, DbDep
from app.models.channel import Category, Channel, ChannelOverwrite
from app.schemas.channel import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    ChannelCreate,
    ChannelOut,
    ChannelUpdate,
    OverwriteOut,
    OverwriteUpsert,
)
from app.services.channel import get_channel_or_404, upsert_overwrite
from app.services.guild import get_guild_or_404, require_member, require_permission
from app.services.permissions import Permissions
from app.ws.events import WSEvent
from app.ws.manager import manager

router = APIRouter(tags=["channels"])

# ─── Categories ──────────────────────────────────────────────────────────────


@router.get("/guilds/{guild_id}/categories", response_model=list[CategoryOut])
async def list_categories(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)
    result = await db.execute(select(Category).where(Category.guild_id == guild_id).order_by(Category.position))
    return [CategoryOut.model_validate(c) for c in result.scalars().all()]


@router.post("/guilds/{guild_id}/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(guild_id: uuid.UUID, body: CategoryCreate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    cat = Category(guild_id=guild_id, name=body.name, position=body.position)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)

    await manager.broadcast_to_guild(guild_id, WSEvent.CATEGORY_CREATE, CategoryOut.model_validate(cat).model_dump(mode="json"))
    return CategoryOut.model_validate(cat)


@router.patch("/guilds/{guild_id}/categories/{cat_id}", response_model=CategoryOut)
async def update_category(guild_id: uuid.UUID, cat_id: uuid.UUID, body: CategoryUpdate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    result = await db.execute(select(Category).where(Category.id == cat_id, Category.guild_id == guild_id))
    cat = result.scalar_one_or_none()
    if cat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    if body.name is not None:
        cat.name = body.name
    if body.position is not None:
        cat.position = body.position
    await db.commit()
    await db.refresh(cat)

    await manager.broadcast_to_guild(guild_id, WSEvent.CATEGORY_UPDATE, CategoryOut.model_validate(cat).model_dump(mode="json"))
    return CategoryOut.model_validate(cat)


@router.delete("/guilds/{guild_id}/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(guild_id: uuid.UUID, cat_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    result = await db.execute(select(Category).where(Category.id == cat_id, Category.guild_id == guild_id))
    cat = result.scalar_one_or_none()
    if cat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    await db.delete(cat)
    await db.commit()
    await manager.broadcast_to_guild(guild_id, WSEvent.CATEGORY_DELETE, {"category_id": str(cat_id)})


# ─── Channels ────────────────────────────────────────────────────────────────


@router.get("/guilds/{guild_id}/channels", response_model=list[ChannelOut])
async def list_channels(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)
    result = await db.execute(select(Channel).where(Channel.guild_id == guild_id).order_by(Channel.position))
    return [ChannelOut.model_validate(c) for c in result.scalars().all()]


@router.post("/guilds/{guild_id}/channels", response_model=ChannelOut, status_code=status.HTTP_201_CREATED)
async def create_channel(guild_id: uuid.UUID, body: ChannelCreate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    channel = Channel(
        guild_id=guild_id,
        name=body.name,
        type=body.type,
        category_id=body.category_id,
        position=body.position,
        topic=body.topic,
        is_nsfw=body.is_nsfw,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)

    await manager.broadcast_to_guild(guild_id, WSEvent.CHANNEL_CREATE, ChannelOut.model_validate(channel).model_dump(mode="json"))
    return ChannelOut.model_validate(channel)


@router.patch("/guilds/{guild_id}/channels/{channel_id}", response_model=ChannelOut)
async def update_channel(guild_id: uuid.UUID, channel_id: uuid.UUID, body: ChannelUpdate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id != guild_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found in this guild")

    if body.name is not None:
        channel.name = body.name
    if body.category_id is not None:
        channel.category_id = body.category_id
    if body.position is not None:
        channel.position = body.position
    if body.topic is not None:
        channel.topic = body.topic
    if body.is_nsfw is not None:
        channel.is_nsfw = body.is_nsfw
    if body.slowmode_delay is not None:
        channel.slowmode_delay = body.slowmode_delay
    if body.bitrate is not None:
        channel.bitrate = body.bitrate
    if body.user_limit is not None:
        channel.user_limit = body.user_limit
    await db.commit()
    await db.refresh(channel)

    await manager.broadcast_to_guild(guild_id, WSEvent.CHANNEL_UPDATE, ChannelOut.model_validate(channel).model_dump(mode="json"))
    return ChannelOut.model_validate(channel)


@router.delete("/guilds/{guild_id}/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(guild_id: uuid.UUID, channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id != guild_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found in this guild")

    await db.delete(channel)
    await db.commit()
    await manager.broadcast_to_guild(guild_id, WSEvent.CHANNEL_DELETE, {"channel_id": str(channel_id)})


# ─── Permission overwrites ────────────────────────────────────────────────────


@router.get("/guilds/{guild_id}/channels/{channel_id}/overwrites", response_model=list[OverwriteOut])
async def list_overwrites(guild_id: uuid.UUID, channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)
    await get_channel_or_404(db, channel_id)
    result = await db.execute(select(ChannelOverwrite).where(ChannelOverwrite.channel_id == channel_id))
    return [OverwriteOut.model_validate(o) for o in result.scalars().all()]


@router.put("/guilds/{guild_id}/channels/{channel_id}/overwrites/{target_id}", response_model=OverwriteOut)
async def set_overwrite(
    guild_id: uuid.UUID,
    channel_id: uuid.UUID,
    target_id: uuid.UUID,
    body: OverwriteUpsert,
    db: DbDep,
    current_user: CurrentUser,
):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    overwrite = await upsert_overwrite(db, channel_id, target_id, body.target_type, body.allow, body.deny)
    return OverwriteOut.model_validate(overwrite)


@router.delete("/guilds/{guild_id}/channels/{channel_id}/overwrites/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_overwrite(guild_id: uuid.UUID, channel_id: uuid.UUID, target_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    result = await db.execute(
        select(ChannelOverwrite).where(ChannelOverwrite.channel_id == channel_id, ChannelOverwrite.target_id == target_id)
    )
    overwrite = result.scalar_one_or_none()
    if overwrite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Overwrite not found")
    await db.delete(overwrite)
    await db.commit()
