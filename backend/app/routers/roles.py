from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select

from app.deps import CurrentUser, DbDep
from app.models.role import MemberRole, Role, RoleAuditLog
from app.schemas.role import (
    MemberRoleOut,
    PermissionEntry,
    RoleAuditLogOut,
    RoleBulkAssignPayload,
    RoleCreate,
    RoleOut,
    RoleReorderPayload,
    RoleTemplateCreate,
    RoleUpdate,
)
from app.services.guild import (
    get_guild_or_404,
    get_user_permissions_mask,
    get_user_top_role_position,
    require_member,
    require_permission,
)
from app.services.permissions import Permissions

router = APIRouter(tags=["roles"])

ROLE_NAME_MAX_LEN = 100
ROLE_TEMPLATES: dict[str, dict[str, int | bool | str]] = {
    "admin": {
        "permissions": Permissions.all(),
        "color": 0xED4245,
        "hoist": True,
        "mentionable": False,
        "name": "Admin",
    },
    "moderator": {
        "permissions": (
            Permissions.MANAGE_MESSAGES
            | Permissions.KICK_MEMBERS
            | Permissions.BAN_MEMBERS
            | Permissions.MANAGE_NICKNAMES
            | Permissions.VIEW_AUDIT_LOG
        ),
        "color": 0x5865F2,
        "hoist": True,
        "mentionable": True,
        "name": "Moderator",
    },
    "member": {
        "permissions": Permissions.SEND_MESSAGES | Permissions.CONNECT | Permissions.SPEAK,
        "color": 0x57F287,
        "hoist": False,
        "mentionable": True,
        "name": "Member",
    },
    "guest": {
        "permissions": Permissions.SEND_MESSAGES | Permissions.CONNECT,
        "color": 0xFEE75C,
        "hoist": False,
        "mentionable": False,
        "name": "Guest",
    },
}
PERMISSIONS_META: list[PermissionEntry] = [
    PermissionEntry(
        key="MANAGE_GUILD",
        label="Manage Guild",
        description="Edit guild settings and metadata.",
        value=Permissions.MANAGE_GUILD,
        category="General",
    ),
    PermissionEntry(
        key="VIEW_AUDIT_LOG",
        label="View Audit Log",
        description="Read moderation and role change history.",
        value=Permissions.VIEW_AUDIT_LOG,
        category="General",
    ),
    PermissionEntry(
        key="MANAGE_CHANNELS",
        label="Manage Channels",
        description="Create, edit and delete channels.",
        value=Permissions.MANAGE_CHANNELS,
        category="Channels",
    ),
    PermissionEntry(
        key="MANAGE_ROLES",
        label="Manage Roles",
        description="Create, edit and assign roles.",
        value=Permissions.MANAGE_ROLES,
        category="Moderation",
    ),
    PermissionEntry(
        key="KICK_MEMBERS",
        label="Kick Members",
        description="Remove members from guild.",
        value=Permissions.KICK_MEMBERS,
        category="Moderation",
    ),
    PermissionEntry(
        key="BAN_MEMBERS",
        label="Ban Members",
        description="Ban members from guild.",
        value=Permissions.BAN_MEMBERS,
        category="Moderation",
    ),
    PermissionEntry(
        key="SEND_MESSAGES",
        label="Send Messages",
        description="Send text messages in channels.",
        value=Permissions.SEND_MESSAGES,
        category="Text",
    ),
    PermissionEntry(
        key="MANAGE_MESSAGES",
        label="Manage Messages",
        description="Delete and pin messages.",
        value=Permissions.MANAGE_MESSAGES,
        category="Text",
    ),
    PermissionEntry(
        key="CONNECT",
        label="Connect",
        description="Join voice channels.",
        value=Permissions.CONNECT,
        category="Voice",
    ),
    PermissionEntry(
        key="SPEAK",
        label="Speak",
        description="Speak in voice channels.",
        value=Permissions.SPEAK,
        category="Voice",
    ),
    PermissionEntry(
        key="MUTE_MEMBERS",
        label="Mute Members",
        description="Mute members in voice channels.",
        value=Permissions.MUTE_MEMBERS,
        category="Voice",
    ),
    PermissionEntry(
        key="MANAGE_NICKNAMES",
        label="Manage Nicknames",
        description="Change member nicknames.",
        value=Permissions.MANAGE_NICKNAMES,
        category="Moderation",
    ),
    PermissionEntry(
        key="ADMINISTRATOR",
        label="Administrator",
        description="Bypasses all permission checks.",
        value=Permissions.ADMINISTRATOR,
        category="Critical",
        critical=True,
    ),
]


async def _ensure_unique_role_name(
    db,
    guild_id: uuid.UUID,
    name: str,
    exclude_role_id: uuid.UUID | None = None,
) -> None:
    normalized = name.strip().lower()
    stmt = select(Role).where(Role.guild_id == guild_id)
    if exclude_role_id:
        stmt = stmt.where(Role.id != exclude_role_id)
    existing = (await db.execute(stmt)).scalars().all()
    if any(role.name.strip().lower() == normalized for role in existing):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role name already exists")


def _validate_role_name(name: str) -> str:
    normalized = name.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role name cannot be empty")
    if len(normalized) > ROLE_NAME_MAX_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role name max length is {ROLE_NAME_MAX_LEN}",
        )
    return normalized


async def _append_role_audit_log(
    db,
    guild_id: uuid.UUID,
    actor_id: uuid.UUID,
    action: str,
    details: str,
    role_id: uuid.UUID | None = None,
) -> None:
    db.add(RoleAuditLog(guild_id=guild_id, role_id=role_id, actor_id=actor_id, action=action, details=details))


async def _get_role_or_404(db, guild_id: uuid.UUID, role_id: uuid.UUID) -> Role:
    result = await db.execute(select(Role).where(Role.id == role_id, Role.guild_id == guild_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role


async def _ensure_manageable_role(db, guild_id: uuid.UUID, current_user: CurrentUser, role: Role) -> None:
    top_position = await get_user_top_role_position(db, guild_id, current_user.id)
    if role.position >= top_position:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot manage role with equal or higher hierarchy position",
        )


@router.get("/guilds/{guild_id}/roles", response_model=list[RoleOut])
async def list_roles(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)
    result = await db.execute(
        select(Role).where(Role.guild_id == guild_id).order_by(Role.position.desc(), Role.created_at.asc())
    )
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
    name = _validate_role_name(body.name)
    await _ensure_unique_role_name(db, guild_id, name)

    top_position = await get_user_top_role_position(db, guild_id, current_user.id)
    if body.position >= top_position:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create role above your hierarchy")
    actor_permissions = await get_user_permissions_mask(db, guild, current_user.id)
    if body.permissions & ~actor_permissions:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot grant permissions you do not have")

    role = Role(
        guild_id=guild_id,
        name=name,
        color=body.color,
        icon_emoji=body.icon_emoji,
        hoist=body.hoist,
        mentionable=body.mentionable,
        position=body.position,
        permissions=body.permissions,
    )
    db.add(role)
    await db.flush()
    await _append_role_audit_log(db, guild_id, current_user.id, "create", f"Created role {name}", role.id)
    await db.commit()
    await db.refresh(role)
    return RoleOut.model_validate(role)


@router.patch("/guilds/{guild_id}/roles/{role_id}", response_model=RoleOut)
async def update_role(guild_id: uuid.UUID, role_id: uuid.UUID, body: RoleUpdate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)
    role = await _get_role_or_404(db, guild_id, role_id)
    if role.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit default role with this endpoint",
        )
    await _ensure_manageable_role(db, guild_id, current_user, role)

    changes = body.model_dump(exclude_unset=True)
    if "name" in changes:
        changes["name"] = _validate_role_name(changes["name"])
        await _ensure_unique_role_name(db, guild_id, changes["name"], exclude_role_id=role_id)
    if "position" in changes:
        top_position = await get_user_top_role_position(db, guild_id, current_user.id)
        if changes["position"] >= top_position:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot move role above your hierarchy")
    if "permissions" in changes:
        actor_permissions = await get_user_permissions_mask(db, guild, current_user.id)
        if changes["permissions"] & ~actor_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot grant permissions you do not have",
            )

    for field, value in changes.items():
        setattr(role, field, value)
    await _append_role_audit_log(db, guild_id, current_user.id, "update", f"Updated role {role.name}", role.id)
    await db.commit()
    await db.refresh(role)
    return RoleOut.model_validate(role)


@router.delete("/guilds/{guild_id}/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(guild_id: uuid.UUID, role_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)
    role = await _get_role_or_404(db, guild_id, role_id)
    if role.is_default:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the default role")
    await _ensure_manageable_role(db, guild_id, current_user, role)

    await _append_role_audit_log(db, guild_id, current_user.id, "delete", f"Deleted role {role.name}", role.id)
    await db.delete(role)
    await db.commit()


@router.post("/guilds/{guild_id}/roles/{role_id}/members/{user_id}", status_code=status.HTTP_201_CREATED)
async def assign_role(
    guild_id: uuid.UUID,
    role_id: uuid.UUID,
    user_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)

    role = await _get_role_or_404(db, guild_id, role_id)
    await _ensure_manageable_role(db, guild_id, current_user, role)

    # Verify target is a member
    await require_member(db, guild_id, user_id)

    existing = await db.execute(
        select(MemberRole).where(
            MemberRole.guild_id == guild_id,
            MemberRole.user_id == user_id,
            MemberRole.role_id == role_id,
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(MemberRole(guild_id=guild_id, user_id=user_id, role_id=role_id))
        await _append_role_audit_log(
            db,
            guild_id,
            current_user.id,
            "assign_member",
            f"Assigned role {role.name} to user {user_id}",
            role.id,
        )
        await db.commit()
    return {"guild_id": str(guild_id), "user_id": str(user_id), "role_id": str(role_id)}


@router.delete("/guilds/{guild_id}/roles/{role_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_role(
    guild_id: uuid.UUID,
    role_id: uuid.UUID,
    user_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)
    role = await _get_role_or_404(db, guild_id, role_id)
    await _ensure_manageable_role(db, guild_id, current_user, role)

    result = await db.execute(
        select(MemberRole).where(
            MemberRole.guild_id == guild_id,
            MemberRole.user_id == user_id,
            MemberRole.role_id == role_id,
        )
    )
    mr = result.scalar_one_or_none()
    if mr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member role not found")
    await db.delete(mr)
    await _append_role_audit_log(
        db,
        guild_id,
        current_user.id,
        "remove_member",
        f"Removed role {role.name} from user {user_id}",
        role.id,
    )
    await db.commit()


@router.get("/role-templates", response_model=list[str])
async def list_role_templates():
    return list(ROLE_TEMPLATES.keys())


@router.get("/permissions", response_model=list[PermissionEntry])
async def list_permissions():
    return PERMISSIONS_META


@router.post("/guilds/{guild_id}/roles/template", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role_from_template(
    guild_id: uuid.UUID,
    body: RoleTemplateCreate,
    db: DbDep,
    current_user: CurrentUser,
):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)
    key = body.template.lower().strip()
    template = ROLE_TEMPLATES.get(key)
    if template is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown role template")

    name = _validate_role_name(body.name or str(template["name"]))
    await _ensure_unique_role_name(db, guild_id, name)
    top_position = await get_user_top_role_position(db, guild_id, current_user.id)
    if body.position >= top_position:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create role above your hierarchy")
    actor_permissions = await get_user_permissions_mask(db, guild, current_user.id)
    template_permissions = int(template["permissions"])
    if template_permissions & ~actor_permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot grant permissions you do not have",
        )

    role = Role(
        guild_id=guild_id,
        name=name,
        color=int(template["color"]),
        hoist=bool(template["hoist"]),
        mentionable=bool(template["mentionable"]),
        position=body.position,
        permissions=template_permissions,
    )
    db.add(role)
    await db.flush()
    await _append_role_audit_log(db, guild_id, current_user.id, "create_template", f"Created role from {key}", role.id)
    await db.commit()
    await db.refresh(role)
    return RoleOut.model_validate(role)


@router.post(
    "/guilds/{guild_id}/roles/{role_id}/duplicate",
    response_model=RoleOut,
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_role(guild_id: uuid.UUID, role_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)
    role = await _get_role_or_404(db, guild_id, role_id)
    await _ensure_manageable_role(db, guild_id, current_user, role)

    base_name = f"{role.name} Copy"
    existing_names = {
        existing_role.name
        for existing_role in (
            await db.execute(select(Role).where(Role.guild_id == guild_id))
        ).scalars().all()
    }
    name = base_name
    if name in existing_names:
        suffix = 2
        while f"{base_name} {suffix}" in existing_names:
            suffix += 1
        name = f"{base_name} {suffix}"
    duplicated = Role(
        guild_id=guild_id,
        name=name,
        color=role.color,
        icon_emoji=role.icon_emoji,
        hoist=role.hoist,
        mentionable=role.mentionable,
        position=max(0, role.position - 1),
        permissions=role.permissions,
    )
    db.add(duplicated)
    await db.flush()
    await _append_role_audit_log(
        db,
        guild_id,
        current_user.id,
        "duplicate",
        f"Duplicated role {role.name}",
        duplicated.id,
    )
    await db.commit()
    await db.refresh(duplicated)
    return RoleOut.model_validate(duplicated)


@router.patch("/guilds/{guild_id}/role-reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_roles(guild_id: uuid.UUID, body: RoleReorderPayload, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)
    if not body.items:
        return
    top_position = await get_user_top_role_position(db, guild_id, current_user.id)
    role_ids = [item.role_id for item in body.items]
    roles = (await db.execute(select(Role).where(Role.guild_id == guild_id, Role.id.in_(role_ids)))).scalars().all()
    by_id = {role.id: role for role in roles}
    if len(by_id) != len(set(role_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Some roles were not found")

    for item in body.items:
        role = by_id[item.role_id]
        if role.is_default:
            continue
        if role.position >= top_position or item.position >= top_position:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot reorder role above your hierarchy",
            )
        role.position = item.position

    await _append_role_audit_log(db, guild_id, current_user.id, "reorder", "Reordered roles")
    await db.commit()


@router.post("/guilds/{guild_id}/roles/bulk-assign", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_assign_role(guild_id: uuid.UUID, body: RoleBulkAssignPayload, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)
    role = await _get_role_or_404(db, guild_id, body.role_id)
    await _ensure_manageable_role(db, guild_id, current_user, role)

    unique_user_ids = set(body.user_ids)
    for user_id in unique_user_ids:
        await require_member(db, guild_id, user_id)
        existing = await db.execute(
            select(MemberRole).where(
                MemberRole.guild_id == guild_id,
                MemberRole.user_id == user_id,
                MemberRole.role_id == role.id,
            )
        )
        if existing.scalar_one_or_none() is None:
            db.add(MemberRole(guild_id=guild_id, user_id=user_id, role_id=role.id))
    await _append_role_audit_log(
        db,
        guild_id,
        current_user.id,
        "bulk_assign",
        f"Bulk assigned role {role.name} to {len(unique_user_ids)} members",
        role.id,
    )
    await db.commit()


@router.delete("/guilds/{guild_id}/roles/bulk-assign", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_remove_role(guild_id: uuid.UUID, body: RoleBulkAssignPayload, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_ROLES)
    role = await _get_role_or_404(db, guild_id, body.role_id)
    await _ensure_manageable_role(db, guild_id, current_user, role)

    unique_user_ids = set(body.user_ids)
    await db.execute(
        delete(MemberRole).where(
            MemberRole.guild_id == guild_id,
            MemberRole.role_id == role.id,
            MemberRole.user_id.in_(list(unique_user_ids)),
        )
    )
    await _append_role_audit_log(
        db,
        guild_id,
        current_user.id,
        "bulk_remove",
        f"Bulk removed role {role.name} from {len(unique_user_ids)} members",
        role.id,
    )
    await db.commit()

@router.get("/guilds/{guild_id}/roles/audit", response_model=list[RoleAuditLogOut])
async def list_role_audit_logs(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.VIEW_AUDIT_LOG)
    result = await db.execute(
        select(RoleAuditLog).where(RoleAuditLog.guild_id == guild_id).order_by(RoleAuditLog.created_at.desc())
    )
    return [RoleAuditLogOut.model_validate(item) for item in result.scalars().all()]
