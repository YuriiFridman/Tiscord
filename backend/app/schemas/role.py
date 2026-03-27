from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class RoleCreate(BaseModel):
    name: str
    color: int = 0
    hoist: bool = False
    position: int = 0
    permissions: int = 0


class RoleUpdate(BaseModel):
    name: str | None = None
    color: int | None = None
    hoist: bool | None = None
    position: int | None = None
    permissions: int | None = None


class RoleOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    name: str
    color: int
    hoist: bool
    position: int
    permissions: int
    is_default: bool
    created_at: datetime


class MemberRoleOut(BaseModel):
    model_config = {"from_attributes": True}

    guild_id: uuid.UUID
    user_id: uuid.UUID
    role_id: uuid.UUID
