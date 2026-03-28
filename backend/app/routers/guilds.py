from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbDep
from app.models.guild import Guild, GuildMember
from app.schemas.guild import GuildCreate, GuildMemberOut, GuildOut, GuildUpdate
from app.services.guild import create_guild, get_guild_or_404, require_member, require_permission
from app.services.permissions import Permissions
from app.ws.events import WSEvent
from app.ws.manager import manager

router = APIRouter(prefix="/guilds", tags=["guilds"])


class NicknameUpdate(BaseModel):
    nickname: str | None = None


class GuildStatsOut(BaseModel):
    member_count: int
    online_count: int


class TransferRequest(BaseModel):
    new_owner_id: uuid.UUID


@router.get("/", response_model=list[GuildOut])
async def list_guilds(db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(Guild)
        .join(GuildMember, GuildMember.guild_id == Guild.id)
        .where(GuildMember.user_id == current_user.id)
    )
    return [GuildOut.model_validate(g) for g in result.scalars().all()]


@router.post("/", response_model=GuildOut, status_code=status.HTTP_201_CREATED)
async def create_guild_endpoint(body: GuildCreate, db: DbDep, current_user: CurrentUser):
    guild = await create_guild(db, body.name, current_user)
    return GuildOut.model_validate(guild)


@router.get("/{guild_id}", response_model=GuildOut)
async def get_guild(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)
    guild = await get_guild_or_404(db, guild_id)
    return GuildOut.model_validate(guild)


@router.patch("/{guild_id}", response_model=GuildOut)
async def update_guild(guild_id: uuid.UUID, body: GuildUpdate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    if body.name is not None:
        guild.name = body.name
    if body.icon_url is not None:
        guild.icon_url = body.icon_url
    await db.commit()
    await db.refresh(guild)

    await manager.broadcast_to_guild(guild_id, WSEvent.GUILD_UPDATE, GuildOut.model_validate(guild).model_dump(mode="json"))
    return GuildOut.model_validate(guild)


@router.delete("/{guild_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_guild(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    if guild.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can delete the guild")

    await manager.broadcast_to_guild(guild_id, WSEvent.GUILD_DELETE, {"guild_id": str(guild_id)})
    await db.delete(guild)
    await db.commit()


@router.get("/{guild_id}/members", response_model=list[GuildMemberOut])
async def list_members(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)
    result = await db.execute(
        select(GuildMember).where(GuildMember.guild_id == guild_id).options(selectinload(GuildMember.user))
    )
    return [GuildMemberOut.model_validate(m) for m in result.scalars().all()]


@router.delete("/{guild_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
async def leave_guild(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    if guild.owner_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner cannot leave the guild")
    member = await require_member(db, guild_id, current_user.id)
    await db.delete(member)
    await db.commit()
    await manager.broadcast_to_guild(
        guild_id, WSEvent.GUILD_MEMBER_REMOVE, {"guild_id": str(guild_id), "user_id": str(current_user.id)}
    )


# ─── Nickname ─────────────────────────────────────────────────────────────────


@router.patch("/{guild_id}/members/me/nickname", response_model=GuildMemberOut)
async def update_my_nickname(guild_id: uuid.UUID, body: NicknameUpdate, db: DbDep, current_user: CurrentUser):
    member = await require_member(db, guild_id, current_user.id)
    member.nickname = body.nickname
    await db.commit()
    result = await db.execute(
        select(GuildMember)
        .where(GuildMember.guild_id == guild_id, GuildMember.user_id == current_user.id)
        .options(selectinload(GuildMember.user))
    )
    member = result.scalar_one()
    payload = GuildMemberOut.model_validate(member).model_dump(mode="json")
    await manager.broadcast_to_guild(guild_id, WSEvent.GUILD_MEMBER_UPDATE, payload)
    return GuildMemberOut.model_validate(member)


# ─── Guild Stats ──────────────────────────────────────────────────────────────


@router.get("/{guild_id}/stats", response_model=GuildStatsOut)
async def guild_stats(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)
    count_result = await db.execute(
        select(func.count()).select_from(GuildMember).where(GuildMember.guild_id == guild_id)
    )
    member_count = count_result.scalar() or 0

    # Count online members via the WS manager
    members_result = await db.execute(
        select(GuildMember.user_id).where(GuildMember.guild_id == guild_id)
    )
    member_ids = members_result.scalars().all()
    online_count = sum(1 for uid in member_ids if manager.is_online(uid))

    return GuildStatsOut(member_count=member_count, online_count=online_count)


# ─── Transfer Ownership ──────────────────────────────────────────────────────


@router.post("/{guild_id}/transfer", response_model=GuildOut)
async def transfer_ownership(guild_id: uuid.UUID, body: TransferRequest, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    if guild.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can transfer ownership")
    if body.new_owner_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already the owner")

    # Ensure new owner is a member
    await require_member(db, guild_id, body.new_owner_id)

    guild.owner_id = body.new_owner_id
    await db.commit()
    await db.refresh(guild)

    payload = GuildOut.model_validate(guild).model_dump(mode="json")
    await manager.broadcast_to_guild(guild_id, WSEvent.GUILD_UPDATE, payload)
    return GuildOut.model_validate(guild)
