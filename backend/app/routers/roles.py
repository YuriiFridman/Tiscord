from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentUser, DbDep
from app.models.role import MemberRole, Role
from app.schemas.role import MemberRoleOut, RoleCreate, RoleOut, RoleUpdate
from app.services.guild import get_guild_or_404, require_member, require_permission
from app.services.permissions import Permissions

router = APIRouter(tags=["roles"])


@router.get("/guilds/{guild_id}/roles", response_model=list[RoleOut])
async def list_roles(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)
    result = await db.execute(select(Role).where(Role.guild_id == guild_id).order_by(Role.position))
    return [RoleOut.model_validate(r) for r in result.scalars().all()]


@router.get("/guilds/{guild_id}/member-roles", response_model=list[MemberRoleOut])
async def list_member_roles(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)
    result = await db.execute(select(MemberRole).where(MemberRole.guild_id == guild_id))
    return [MemberRoleOut.model_validate(mr) for mr in result.scalars().all()]


@router.post("/guilds/{guild_id}/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(guild_id: uuid.UUID, body: RoleCreate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)

    role = Role(
        guild_id=guild_id,
        name=body.name,
        color=body.color,
        hoist=body.hoist,
        position=body.position,
        permissions=body.permissions,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return RoleOut.model_validate(role)


@router.patch("/guilds/{guild_id}/roles/{role_id}", response_model=RoleOut)
async def update_role(guild_id: uuid.UUID, role_id: uuid.UUID, body: RoleUpdate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)

    result = await db.execute(select(Role).where(Role.id == role_id, Role.guild_id == guild_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(role, field, value)
    await db.commit()
    await db.refresh(role)
    return RoleOut.model_validate(role)


@router.delete("/guilds/{guild_id}/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(guild_id: uuid.UUID, role_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)

    result = await db.execute(select(Role).where(Role.id == role_id, Role.guild_id == guild_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if role.is_default:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the default role")

    await db.delete(role)
    await db.commit()


@router.post("/guilds/{guild_id}/roles/{role_id}/members/{user_id}", status_code=status.HTTP_201_CREATED)
async def assign_role(guild_id: uuid.UUID, role_id: uuid.UUID, user_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)

    # Verify role belongs to guild
    role_result = await db.execute(select(Role).where(Role.id == role_id, Role.guild_id == guild_id))
    if role_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    # Verify target is a member
    await require_member(db, guild_id, user_id)

    existing = await db.execute(
        select(MemberRole).where(MemberRole.guild_id == guild_id, MemberRole.user_id == user_id, MemberRole.role_id == role_id)
    )
    if existing.scalar_one_or_none() is None:
        db.add(MemberRole(guild_id=guild_id, user_id=user_id, role_id=role_id))
        await db.commit()
    return {"guild_id": str(guild_id), "user_id": str(user_id), "role_id": str(role_id)}


@router.delete("/guilds/{guild_id}/roles/{role_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_role(guild_id: uuid.UUID, role_id: uuid.UUID, user_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)

    result = await db.execute(
        select(MemberRole).where(MemberRole.guild_id == guild_id, MemberRole.user_id == user_id, MemberRole.role_id == role_id)
    )
    mr = result.scalar_one_or_none()
    if mr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member role not found")
    await db.delete(mr)
    await db.commit()
