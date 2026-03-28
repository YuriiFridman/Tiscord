from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# 1. Screen Sharing
# ---------------------------------------------------------------------------


class ScreenShareStartOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    channel_id: uuid.UUID
    user_id: uuid.UUID
    stream_key: str
    is_active: bool
    started_at: datetime


# ---------------------------------------------------------------------------
# 2. Guild Events
# ---------------------------------------------------------------------------


class GuildEventCreate(BaseModel):
    name: str
    description: str | None = None
    location: str | None = None
    start_time: datetime
    end_time: datetime | None = None


class GuildEventUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    location: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    status: str | None = None


class GuildEventOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    creator_id: uuid.UUID | None
    name: str
    description: str | None
    location: str | None
    start_time: datetime
    end_time: datetime | None
    status: str
    created_at: datetime


# ---------------------------------------------------------------------------
# 3. Polls
# ---------------------------------------------------------------------------


class PollCreate(BaseModel):
    question: str
    options: list[str]
    expires_at: datetime | None = None


class PollVoteIn(BaseModel):
    option_index: int


class PollOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    channel_id: uuid.UUID
    creator_id: uuid.UUID | None
    question: str
    options: str
    expires_at: datetime | None
    created_at: datetime


class PollResultOut(BaseModel):
    poll_id: uuid.UUID
    results: dict[int, int]


# ---------------------------------------------------------------------------
# 4. Threads
# ---------------------------------------------------------------------------


class ThreadCreateIn(BaseModel):
    name: str
    parent_message_id: uuid.UUID | None = None


class ThreadMetaOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    channel_id: uuid.UUID
    parent_message_id: uuid.UUID | None
    is_locked: bool
    auto_archive_minutes: int
    created_at: datetime


# ---------------------------------------------------------------------------
# 5. User Activity
# ---------------------------------------------------------------------------


class UserActivityUpdate(BaseModel):
    activity_type: str
    activity_name: str
    details: str | None = None


class UserActivityOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    activity_type: str
    activity_name: str
    details: str | None
    started_at: datetime


# ---------------------------------------------------------------------------
# 6. Guild Emojis
# ---------------------------------------------------------------------------


class GuildEmojiCreate(BaseModel):
    name: str
    image_url: str


class GuildEmojiOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    name: str
    image_url: str
    creator_id: uuid.UUID | None
    created_at: datetime


# ---------------------------------------------------------------------------
# 7. Bookmarks
# ---------------------------------------------------------------------------


class BookmarkCreate(BaseModel):
    message_id: uuid.UUID
    note: str | None = None


class BookmarkOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    message_id: uuid.UUID
    note: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# 8. Guild Settings (AFK)
# ---------------------------------------------------------------------------


class GuildSettingsUpdate(BaseModel):
    afk_channel_id: uuid.UUID | None = None
    afk_timeout: int | None = None
    default_notifications: str | None = None
    system_channel_id: uuid.UUID | None = None


class GuildSettingsOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    afk_channel_id: uuid.UUID | None
    afk_timeout: int
    default_notifications: str
    system_channel_id: uuid.UUID | None


# ---------------------------------------------------------------------------
# 9. Server Templates
# ---------------------------------------------------------------------------


class GuildTemplateCreate(BaseModel):
    name: str
    description: str | None = None


class GuildTemplateOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    creator_id: uuid.UUID | None
    name: str
    description: str | None
    template_data: str
    created_at: datetime


# ---------------------------------------------------------------------------
# 10. Sound Effects
# ---------------------------------------------------------------------------


class SoundEffectCreate(BaseModel):
    name: str
    file_url: str
    duration_ms: int = 0


class SoundEffectOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    name: str
    file_url: str
    duration_ms: int
    creator_id: uuid.UUID | None
    created_at: datetime


# ---------------------------------------------------------------------------
# 11. Reminders
# ---------------------------------------------------------------------------


class ReminderCreate(BaseModel):
    content: str
    remind_at: datetime
    channel_id: uuid.UUID | None = None


class ReminderOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    channel_id: uuid.UUID | None
    content: str
    remind_at: datetime
    is_delivered: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# 12. Auto-mod Rules
# ---------------------------------------------------------------------------


class AutoModRuleCreate(BaseModel):
    name: str
    trigger_type: str
    trigger_metadata: str
    action_type: str
    action_metadata: str | None = None
    enabled: bool = True


class AutoModRuleUpdate(BaseModel):
    name: str | None = None
    trigger_type: str | None = None
    trigger_metadata: str | None = None
    action_type: str | None = None
    action_metadata: str | None = None
    enabled: bool | None = None


class AutoModRuleOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    name: str
    trigger_type: str
    trigger_metadata: str
    action_type: str
    action_metadata: str | None
    enabled: bool
    creator_id: uuid.UUID | None
    created_at: datetime


# ---------------------------------------------------------------------------
# 13. User Slowmode
# ---------------------------------------------------------------------------


class UserSlowmodeSet(BaseModel):
    user_id: uuid.UUID
    delay_seconds: int
    expires_at: datetime | None = None


class UserSlowmodeOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    channel_id: uuid.UUID
    user_id: uuid.UUID
    delay_seconds: int
    expires_at: datetime | None
    set_by: uuid.UUID
    created_at: datetime


# ---------------------------------------------------------------------------
# 14. Channel Archive — no new schema (simple endpoint patches channel)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# 15. Stickers
# ---------------------------------------------------------------------------


class GuildStickerCreate(BaseModel):
    name: str
    description: str | None = None
    image_url: str
    tags: str | None = None


class GuildStickerOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    name: str
    description: str | None
    image_url: str
    tags: str | None
    creator_id: uuid.UUID | None
    created_at: datetime


# ---------------------------------------------------------------------------
# 16. User Badges
# ---------------------------------------------------------------------------


class UserBadgeCreate(BaseModel):
    user_id: uuid.UUID
    badge_name: str
    badge_icon: str | None = None
    description: str | None = None


class UserBadgeOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    badge_name: str
    badge_icon: str | None
    awarded_at: datetime
    description: str | None


# ---------------------------------------------------------------------------
# 17. Guild Tags
# ---------------------------------------------------------------------------


class GuildTagCreate(BaseModel):
    tag: str


class GuildTagOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    tag: str


# ---------------------------------------------------------------------------
# 18. Vanity Invite
# ---------------------------------------------------------------------------


class VanityInviteSet(BaseModel):
    code: str


class VanityInviteOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    code: str
    created_at: datetime


# ---------------------------------------------------------------------------
# 19. Extended Audit Log
# ---------------------------------------------------------------------------


class ExtendedAuditLogOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    guild_id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    changes: str | None
    reason: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# 20. User Connections
# ---------------------------------------------------------------------------


class UserConnectionCreate(BaseModel):
    provider: str
    provider_id: str
    provider_name: str | None = None
    is_visible: bool = True


class UserConnectionOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    provider: str
    provider_id: str
    provider_name: str | None
    is_visible: bool
    created_at: datetime
