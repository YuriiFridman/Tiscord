from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ReadStateOut(BaseModel):
    model_config = {"from_attributes": True}

    user_id: uuid.UUID
    channel_id: uuid.UUID
    last_message_id: uuid.UUID
    updated_at: datetime


class ReadStateUpdate(BaseModel):
    last_message_id: uuid.UUID
