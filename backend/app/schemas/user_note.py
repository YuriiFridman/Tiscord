from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class UserNoteOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    owner_id: uuid.UUID
    target_id: uuid.UUID
    content: str
    created_at: datetime
    updated_at: datetime


class UserNoteUpdate(BaseModel):
    content: str = Field(..., max_length=4096)
