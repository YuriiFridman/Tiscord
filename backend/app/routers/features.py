from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.deps import CurrentUser, DbDep
from app.models.channel import Channel
from app.models.features import (
    AutoModRule,
    Bookmark,
    ExtendedAuditLog,
    GuildEmoji,
    GuildEvent,
    GuildSettings,
    GuildSticker,
    GuildTag,
    GuildTemplate,
    Poll,
    PollVote,
    Reminder,
    ScreenShareSession,
    SoundEffect,
    ThreadMeta,
    UserActivity,
    UserBadge,
    UserConnection,
    UserSlowmode,
    VanityInvite,
)
from app.schemas.channel import ChannelOut
from app.schemas.features import (
    AutoModRuleCreate,
    AutoModRuleOut,
    AutoModRuleUpdate,
    BookmarkCreate,
    BookmarkOut,
    ExtendedAuditLogOut,
    GuildEmojiCreate,
    GuildEmojiOut,
    GuildEventCreate,
    GuildEventOut,
    GuildEventUpdate,
    GuildSettingsOut,
    GuildSettingsUpdate,
    GuildStickerCreate,
    GuildStickerOut,
    GuildTagCreate,
    GuildTagOut,
    GuildTemplateCreate,
    GuildTemplateOut,
    PollCreate,
    PollOut,
    PollResultOut,
    PollVoteIn,
    ReminderCreate,
    ReminderOut,
    ScreenShareStartOut,
    SoundEffectCreate,
    SoundEffectOut,
    ThreadCreateIn,
    UserActivityOut,
    UserActivityUpdate,
    UserBadgeCreate,
    UserBadgeOut,
    UserConnectionCreate,
    UserConnectionOut,
    UserSlowmodeOut,
    UserSlowmodeSet,
    VanityInviteOut,
    VanityInviteSet,
)
from app.services.channel import get_channel_or_404
from app.services.guild import get_guild_or_404, require_member, require_permission
from app.services.permissions import Permissions
from app.ws.events import WSEvent
from app.ws.manager import manager

router = APIRouter(tags=["features"])


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ===========================================================================
# 1. Screen Sharing
# ===========================================================================


@router.post(
    "/voice/channels/{channel_id}/screen-share/start",
    response_model=ScreenShareStartOut,
    status_code=status.HTTP_201_CREATED,
)
async def start_screen_share(channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(ScreenShareSession).where(
            ScreenShareSession.channel_id == channel_id,
            ScreenShareSession.user_id == current_user.id,
            ScreenShareSession.is_active.is_(True),
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return ScreenShareStartOut.model_validate(existing)

    session = ScreenShareSession(
        channel_id=channel_id,
        user_id=current_user.id,
        stream_key=secrets.token_urlsafe(16),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id:
        await manager.broadcast_to_guild(
            channel.guild_id,
            WSEvent.SCREEN_SHARE_START,
            {
                "channel_id": str(channel_id),
                "user_id": str(current_user.id),
                "stream_key": session.stream_key,
            },
        )

    return ScreenShareStartOut.model_validate(session)


@router.post("/voice/channels/{channel_id}/screen-share/stop", status_code=status.HTTP_200_OK)
async def stop_screen_share(channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(ScreenShareSession).where(
            ScreenShareSession.channel_id == channel_id,
            ScreenShareSession.user_id == current_user.id,
            ScreenShareSession.is_active.is_(True),
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active screen share session")

    session.is_active = False
    session.ended_at = utcnow()
    await db.commit()

    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id:
        await manager.broadcast_to_guild(
            channel.guild_id,
            WSEvent.SCREEN_SHARE_STOP,
            {
                "channel_id": str(channel_id),
                "user_id": str(current_user.id),
            },
        )

    return {"ok": True}


@router.get("/voice/channels/{channel_id}/screen-share", response_model=list[ScreenShareStartOut])
async def list_screen_shares(channel_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(ScreenShareSession).where(
            ScreenShareSession.channel_id == channel_id,
            ScreenShareSession.is_active.is_(True),
        )
    )
    return [ScreenShareStartOut.model_validate(s) for s in result.scalars().all()]


# ===========================================================================
# 2. Guild Events
# ===========================================================================


@router.post("/guilds/{guild_id}/events", response_model=GuildEventOut, status_code=status.HTTP_201_CREATED)
async def create_guild_event(guild_id: uuid.UUID, body: GuildEventCreate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    event = GuildEvent(
        guild_id=guild_id,
        creator_id=current_user.id,
        name=body.name,
        description=body.description,
        location=body.location,
        start_time=body.start_time,
        end_time=body.end_time,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return GuildEventOut.model_validate(event)


@router.get("/guilds/{guild_id}/events", response_model=list[GuildEventOut])
async def list_guild_events(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)
    result = await db.execute(
        select(GuildEvent).where(GuildEvent.guild_id == guild_id).order_by(GuildEvent.start_time)
    )
    return [GuildEventOut.model_validate(e) for e in result.scalars().all()]


@router.patch("/guilds/{guild_id}/events/{event_id}", response_model=GuildEventOut)
async def update_guild_event(
    guild_id: uuid.UUID, event_id: uuid.UUID, body: GuildEventUpdate, db: DbDep, current_user: CurrentUser
):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    result = await db.execute(
        select(GuildEvent).where(GuildEvent.id == event_id, GuildEvent.guild_id == guild_id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if body.name is not None:
        event.name = body.name
    if body.description is not None:
        event.description = body.description
    if body.location is not None:
        event.location = body.location
    if body.start_time is not None:
        event.start_time = body.start_time
    if body.end_time is not None:
        event.end_time = body.end_time
    if body.status is not None:
        event.status = body.status
    await db.commit()
    await db.refresh(event)
    return GuildEventOut.model_validate(event)


@router.delete("/guilds/{guild_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_guild_event(guild_id: uuid.UUID, event_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    result = await db.execute(
        select(GuildEvent).where(GuildEvent.id == event_id, GuildEvent.guild_id == guild_id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    await db.delete(event)
    await db.commit()


# ===========================================================================
# 3. Polls
# ===========================================================================


@router.post("/channels/{channel_id}/polls", response_model=PollOut, status_code=status.HTTP_201_CREATED)
async def create_poll(channel_id: uuid.UUID, body: PollCreate, db: DbDep, current_user: CurrentUser):
    await get_channel_or_404(db, channel_id)

    poll = Poll(
        channel_id=channel_id,
        creator_id=current_user.id,
        question=body.question,
        options=json.dumps(body.options),
        expires_at=body.expires_at,
    )
    db.add(poll)
    await db.commit()
    await db.refresh(poll)
    return PollOut.model_validate(poll)


@router.post("/channels/{channel_id}/polls/{poll_id}/vote", status_code=status.HTTP_201_CREATED)
async def vote_on_poll(
    channel_id: uuid.UUID, poll_id: uuid.UUID, body: PollVoteIn, db: DbDep, current_user: CurrentUser
):
    result = await db.execute(
        select(Poll).where(Poll.id == poll_id, Poll.channel_id == channel_id)
    )
    poll = result.scalar_one_or_none()
    if poll is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Poll not found")

    options = json.loads(poll.options)
    if body.option_index < 0 or body.option_index >= len(options):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid option index")

    existing = await db.execute(
        select(PollVote).where(PollVote.poll_id == poll_id, PollVote.user_id == current_user.id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already voted")

    vote = PollVote(poll_id=poll_id, user_id=current_user.id, option_index=body.option_index)
    db.add(vote)
    await db.commit()
    return {"poll_id": str(poll_id), "option_index": body.option_index}


@router.get("/channels/{channel_id}/polls/{poll_id}/results", response_model=PollResultOut)
async def get_poll_results(channel_id: uuid.UUID, poll_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(Poll).where(Poll.id == poll_id, Poll.channel_id == channel_id)
    )
    poll = result.scalar_one_or_none()
    if poll is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Poll not found")

    votes_result = await db.execute(
        select(PollVote.option_index, func.count())
        .where(PollVote.poll_id == poll_id)
        .group_by(PollVote.option_index)
    )
    results = {row[0]: row[1] for row in votes_result.all()}
    return PollResultOut(poll_id=poll_id, results=results)


# ===========================================================================
# 4. Threads
# ===========================================================================


@router.post("/channels/{channel_id}/threads", response_model=ChannelOut, status_code=status.HTTP_201_CREATED)
async def create_thread(channel_id: uuid.UUID, body: ThreadCreateIn, db: DbDep, current_user: CurrentUser):
    parent_channel = await get_channel_or_404(db, channel_id)

    thread_channel = Channel(
        type="text",
        name=body.name,
        parent_id=channel_id,
        guild_id=parent_channel.guild_id,
    )
    db.add(thread_channel)
    await db.flush()

    meta = ThreadMeta(
        channel_id=thread_channel.id,
        parent_message_id=body.parent_message_id,
    )
    db.add(meta)
    await db.commit()
    await db.refresh(thread_channel)
    return ChannelOut.model_validate(thread_channel)


@router.get("/channels/{channel_id}/threads", response_model=list[ChannelOut])
async def list_threads(channel_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(Channel).where(Channel.parent_id == channel_id)
    )
    return [ChannelOut.model_validate(c) for c in result.scalars().all()]


# ===========================================================================
# 5. User Activity
# ===========================================================================


@router.put("/users/me/activity", response_model=UserActivityOut)
async def set_user_activity(body: UserActivityUpdate, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(UserActivity).where(UserActivity.user_id == current_user.id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        activity = UserActivity(
            user_id=current_user.id,
            activity_type=body.activity_type,
            activity_name=body.activity_name,
            details=body.details,
        )
        db.add(activity)
    else:
        activity.activity_type = body.activity_type
        activity.activity_name = body.activity_name
        activity.details = body.details
        activity.started_at = utcnow()
    await db.commit()
    await db.refresh(activity)
    return UserActivityOut.model_validate(activity)


@router.delete("/users/me/activity", status_code=status.HTTP_204_NO_CONTENT)
async def clear_user_activity(db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(UserActivity).where(UserActivity.user_id == current_user.id)
    )
    activity = result.scalar_one_or_none()
    if activity:
        await db.delete(activity)
        await db.commit()


@router.get("/users/{user_id}/activity", response_model=UserActivityOut)
async def get_user_activity(user_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(UserActivity).where(UserActivity.user_id == user_id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No activity found")
    return UserActivityOut.model_validate(activity)


# ===========================================================================
# 6. Guild Emojis
# ===========================================================================


@router.post("/guilds/{guild_id}/emojis", response_model=GuildEmojiOut, status_code=status.HTTP_201_CREATED)
async def create_guild_emoji(guild_id: uuid.UUID, body: GuildEmojiCreate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    emoji = GuildEmoji(
        guild_id=guild_id,
        name=body.name,
        image_url=body.image_url,
        creator_id=current_user.id,
    )
    db.add(emoji)
    await db.commit()
    await db.refresh(emoji)
    return GuildEmojiOut.model_validate(emoji)


@router.get("/guilds/{guild_id}/emojis", response_model=list[GuildEmojiOut])
async def list_guild_emojis(guild_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(GuildEmoji).where(GuildEmoji.guild_id == guild_id)
    )
    return [GuildEmojiOut.model_validate(e) for e in result.scalars().all()]


@router.delete("/guilds/{guild_id}/emojis/{emoji_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_guild_emoji(guild_id: uuid.UUID, emoji_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    result = await db.execute(
        select(GuildEmoji).where(GuildEmoji.id == emoji_id, GuildEmoji.guild_id == guild_id)
    )
    emoji = result.scalar_one_or_none()
    if emoji is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Emoji not found")

    await db.delete(emoji)
    await db.commit()


# ===========================================================================
# 7. Bookmarks
# ===========================================================================


@router.post("/bookmarks", response_model=BookmarkOut, status_code=status.HTTP_201_CREATED)
async def create_bookmark(body: BookmarkCreate, db: DbDep, current_user: CurrentUser):
    bookmark = Bookmark(
        user_id=current_user.id,
        message_id=body.message_id,
        note=body.note,
    )
    db.add(bookmark)
    await db.commit()
    await db.refresh(bookmark)
    return BookmarkOut.model_validate(bookmark)


@router.get("/bookmarks", response_model=list[BookmarkOut])
async def list_bookmarks(db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(Bookmark).where(Bookmark.user_id == current_user.id).order_by(Bookmark.created_at.desc())
    )
    return [BookmarkOut.model_validate(b) for b in result.scalars().all()]


@router.delete("/bookmarks/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bookmark(bookmark_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.user_id == current_user.id)
    )
    bookmark = result.scalar_one_or_none()
    if bookmark is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bookmark not found")

    await db.delete(bookmark)
    await db.commit()


# ===========================================================================
# 8. Guild Settings (AFK)
# ===========================================================================


@router.get("/guilds/{guild_id}/settings", response_model=GuildSettingsOut)
async def get_guild_settings(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)

    result = await db.execute(
        select(GuildSettings).where(GuildSettings.guild_id == guild_id)
    )
    gs = result.scalar_one_or_none()
    if gs is None:
        gs = GuildSettings(guild_id=guild_id)
        db.add(gs)
        await db.commit()
        await db.refresh(gs)
    return GuildSettingsOut.model_validate(gs)


@router.patch("/guilds/{guild_id}/settings", response_model=GuildSettingsOut)
async def update_guild_settings(
    guild_id: uuid.UUID, body: GuildSettingsUpdate, db: DbDep, current_user: CurrentUser
):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    result = await db.execute(
        select(GuildSettings).where(GuildSettings.guild_id == guild_id)
    )
    gs = result.scalar_one_or_none()
    if gs is None:
        gs = GuildSettings(guild_id=guild_id)
        db.add(gs)
        await db.flush()

    if body.afk_channel_id is not None:
        gs.afk_channel_id = body.afk_channel_id
    if body.afk_timeout is not None:
        gs.afk_timeout = body.afk_timeout
    if body.default_notifications is not None:
        gs.default_notifications = body.default_notifications
    if body.system_channel_id is not None:
        gs.system_channel_id = body.system_channel_id
    await db.commit()
    await db.refresh(gs)
    return GuildSettingsOut.model_validate(gs)


# ===========================================================================
# 9. Server Templates
# ===========================================================================


@router.post("/guilds/{guild_id}/templates", response_model=GuildTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_guild_template(
    guild_id: uuid.UUID, body: GuildTemplateCreate, db: DbDep, current_user: CurrentUser
):
    await require_member(db, guild_id, current_user.id)

    template = GuildTemplate(
        guild_id=guild_id,
        creator_id=current_user.id,
        name=body.name,
        description=body.description,
        template_data="{}",
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return GuildTemplateOut.model_validate(template)


@router.get("/guilds/{guild_id}/templates", response_model=list[GuildTemplateOut])
async def list_guild_templates(guild_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(GuildTemplate).where(GuildTemplate.guild_id == guild_id)
    )
    return [GuildTemplateOut.model_validate(t) for t in result.scalars().all()]


# ===========================================================================
# 10. Sound Effects
# ===========================================================================


@router.post("/guilds/{guild_id}/sound-effects", response_model=SoundEffectOut, status_code=status.HTTP_201_CREATED)
async def create_sound_effect(guild_id: uuid.UUID, body: SoundEffectCreate, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)

    effect = SoundEffect(
        guild_id=guild_id,
        name=body.name,
        file_url=body.file_url,
        duration_ms=body.duration_ms,
        creator_id=current_user.id,
    )
    db.add(effect)
    await db.commit()
    await db.refresh(effect)
    return SoundEffectOut.model_validate(effect)


@router.get("/guilds/{guild_id}/sound-effects", response_model=list[SoundEffectOut])
async def list_sound_effects(guild_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(SoundEffect).where(SoundEffect.guild_id == guild_id)
    )
    return [SoundEffectOut.model_validate(e) for e in result.scalars().all()]


@router.delete("/guilds/{guild_id}/sound-effects/{effect_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sound_effect(guild_id: uuid.UUID, effect_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)

    result = await db.execute(
        select(SoundEffect).where(SoundEffect.id == effect_id, SoundEffect.guild_id == guild_id)
    )
    effect = result.scalar_one_or_none()
    if effect is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sound effect not found")

    await db.delete(effect)
    await db.commit()


# ===========================================================================
# 11. Reminders
# ===========================================================================


@router.post("/reminders", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
async def create_reminder(body: ReminderCreate, db: DbDep, current_user: CurrentUser):
    reminder = Reminder(
        user_id=current_user.id,
        content=body.content,
        remind_at=body.remind_at,
        channel_id=body.channel_id,
    )
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return ReminderOut.model_validate(reminder)


@router.get("/reminders", response_model=list[ReminderOut])
async def list_reminders(db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(Reminder).where(Reminder.user_id == current_user.id).order_by(Reminder.remind_at)
    )
    return [ReminderOut.model_validate(r) for r in result.scalars().all()]


@router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(reminder_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
    )
    reminder = result.scalar_one_or_none()
    if reminder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")

    await db.delete(reminder)
    await db.commit()


# ===========================================================================
# 12. Auto-mod Rules
# ===========================================================================


@router.post("/guilds/{guild_id}/automod", response_model=AutoModRuleOut, status_code=status.HTTP_201_CREATED)
async def create_automod_rule(guild_id: uuid.UUID, body: AutoModRuleCreate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    rule = AutoModRule(
        guild_id=guild_id,
        name=body.name,
        trigger_type=body.trigger_type,
        trigger_metadata=body.trigger_metadata,
        action_type=body.action_type,
        action_metadata=body.action_metadata,
        enabled=body.enabled,
        creator_id=current_user.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return AutoModRuleOut.model_validate(rule)


@router.get("/guilds/{guild_id}/automod", response_model=list[AutoModRuleOut])
async def list_automod_rules(guild_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)

    result = await db.execute(
        select(AutoModRule).where(AutoModRule.guild_id == guild_id)
    )
    return [AutoModRuleOut.model_validate(r) for r in result.scalars().all()]


@router.patch("/guilds/{guild_id}/automod/{rule_id}", response_model=AutoModRuleOut)
async def update_automod_rule(
    guild_id: uuid.UUID, rule_id: uuid.UUID, body: AutoModRuleUpdate, db: DbDep, current_user: CurrentUser
):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    result = await db.execute(
        select(AutoModRule).where(AutoModRule.id == rule_id, AutoModRule.guild_id == guild_id)
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auto-mod rule not found")

    if body.name is not None:
        rule.name = body.name
    if body.trigger_type is not None:
        rule.trigger_type = body.trigger_type
    if body.trigger_metadata is not None:
        rule.trigger_metadata = body.trigger_metadata
    if body.action_type is not None:
        rule.action_type = body.action_type
    if body.action_metadata is not None:
        rule.action_metadata = body.action_metadata
    if body.enabled is not None:
        rule.enabled = body.enabled
    await db.commit()
    await db.refresh(rule)
    return AutoModRuleOut.model_validate(rule)


@router.delete("/guilds/{guild_id}/automod/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automod_rule(guild_id: uuid.UUID, rule_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    result = await db.execute(
        select(AutoModRule).where(AutoModRule.id == rule_id, AutoModRule.guild_id == guild_id)
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auto-mod rule not found")

    await db.delete(rule)
    await db.commit()


# ===========================================================================
# 13. User Slowmode
# ===========================================================================


@router.put("/channels/{channel_id}/slowmode/users", response_model=UserSlowmodeOut)
async def set_user_slowmode(channel_id: uuid.UUID, body: UserSlowmodeSet, db: DbDep, current_user: CurrentUser):
    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id:
        guild = await get_guild_or_404(db, channel.guild_id)
        await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    result = await db.execute(
        select(UserSlowmode).where(
            UserSlowmode.channel_id == channel_id,
            UserSlowmode.user_id == body.user_id,
        )
    )
    slowmode = result.scalar_one_or_none()
    if slowmode is None:
        slowmode = UserSlowmode(
            channel_id=channel_id,
            user_id=body.user_id,
            delay_seconds=body.delay_seconds,
            expires_at=body.expires_at,
            set_by=current_user.id,
        )
        db.add(slowmode)
    else:
        slowmode.delay_seconds = body.delay_seconds
        slowmode.expires_at = body.expires_at
        slowmode.set_by = current_user.id
    await db.commit()
    await db.refresh(slowmode)
    return UserSlowmodeOut.model_validate(slowmode)


@router.get("/channels/{channel_id}/slowmode/users", response_model=list[UserSlowmodeOut])
async def list_user_slowmodes(channel_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(UserSlowmode).where(UserSlowmode.channel_id == channel_id)
    )
    return [UserSlowmodeOut.model_validate(s) for s in result.scalars().all()]


@router.delete("/channels/{channel_id}/slowmode/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user_slowmode(channel_id: uuid.UUID, user_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(UserSlowmode).where(
            UserSlowmode.channel_id == channel_id,
            UserSlowmode.user_id == user_id,
        )
    )
    slowmode = result.scalar_one_or_none()
    if slowmode is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slowmode entry not found")

    await db.delete(slowmode)
    await db.commit()


# ===========================================================================
# 14. Channel Archive
# ===========================================================================


@router.post("/guilds/{guild_id}/channels/{channel_id}/archive", response_model=ChannelOut)
async def archive_channel(guild_id: uuid.UUID, channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id != guild_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found in this guild")

    if not channel.name.startswith("[ARCHIVED] "):
        channel.name = f"[ARCHIVED] {channel.name}"
    await db.commit()
    await db.refresh(channel)
    return ChannelOut.model_validate(channel)


@router.post("/guilds/{guild_id}/channels/{channel_id}/unarchive", response_model=ChannelOut)
async def unarchive_channel(guild_id: uuid.UUID, channel_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_CHANNELS)

    channel = await get_channel_or_404(db, channel_id)
    if channel.guild_id != guild_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found in this guild")

    if channel.name.startswith("[ARCHIVED] "):
        channel.name = channel.name.removeprefix("[ARCHIVED] ")
    await db.commit()
    await db.refresh(channel)
    return ChannelOut.model_validate(channel)


# ===========================================================================
# 15. Stickers
# ===========================================================================


@router.post("/guilds/{guild_id}/stickers", response_model=GuildStickerOut, status_code=status.HTTP_201_CREATED)
async def create_guild_sticker(guild_id: uuid.UUID, body: GuildStickerCreate, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)

    sticker = GuildSticker(
        guild_id=guild_id,
        name=body.name,
        description=body.description,
        image_url=body.image_url,
        tags=body.tags,
        creator_id=current_user.id,
    )
    db.add(sticker)
    await db.commit()
    await db.refresh(sticker)
    return GuildStickerOut.model_validate(sticker)


@router.get("/guilds/{guild_id}/stickers", response_model=list[GuildStickerOut])
async def list_guild_stickers(guild_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(GuildSticker).where(GuildSticker.guild_id == guild_id)
    )
    return [GuildStickerOut.model_validate(s) for s in result.scalars().all()]


@router.delete("/guilds/{guild_id}/stickers/{sticker_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_guild_sticker(guild_id: uuid.UUID, sticker_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    await require_member(db, guild_id, current_user.id)

    result = await db.execute(
        select(GuildSticker).where(GuildSticker.id == sticker_id, GuildSticker.guild_id == guild_id)
    )
    sticker = result.scalar_one_or_none()
    if sticker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sticker not found")

    await db.delete(sticker)
    await db.commit()


# ===========================================================================
# 16. User Badges
# ===========================================================================


@router.post("/users/{user_id}/badges", response_model=UserBadgeOut, status_code=status.HTTP_201_CREATED)
async def award_badge(user_id: uuid.UUID, body: UserBadgeCreate, db: DbDep, _: CurrentUser):
    badge = UserBadge(
        user_id=user_id,
        badge_name=body.badge_name,
        badge_icon=body.badge_icon,
        description=body.description,
    )
    db.add(badge)
    await db.commit()
    await db.refresh(badge)
    return UserBadgeOut.model_validate(badge)


@router.get("/users/{user_id}/badges", response_model=list[UserBadgeOut])
async def list_user_badges(user_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(UserBadge).where(UserBadge.user_id == user_id)
    )
    return [UserBadgeOut.model_validate(b) for b in result.scalars().all()]


# ===========================================================================
# 17. Guild Tags
# ===========================================================================


@router.post("/guilds/{guild_id}/tags", response_model=GuildTagOut, status_code=status.HTTP_201_CREATED)
async def create_guild_tag(guild_id: uuid.UUID, body: GuildTagCreate, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    tag = GuildTag(guild_id=guild_id, tag=body.tag)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return GuildTagOut.model_validate(tag)


@router.get("/guilds/{guild_id}/tags", response_model=list[GuildTagOut])
async def list_guild_tags(guild_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(GuildTag).where(GuildTag.guild_id == guild_id)
    )
    return [GuildTagOut.model_validate(t) for t in result.scalars().all()]


@router.delete("/guilds/{guild_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_guild_tag(guild_id: uuid.UUID, tag_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    result = await db.execute(
        select(GuildTag).where(GuildTag.id == tag_id, GuildTag.guild_id == guild_id)
    )
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    await db.delete(tag)
    await db.commit()


# ===========================================================================
# 18. Vanity Invite
# ===========================================================================


@router.put("/guilds/{guild_id}/vanity", response_model=VanityInviteOut)
async def set_vanity_invite(guild_id: uuid.UUID, body: VanityInviteSet, db: DbDep, current_user: CurrentUser):
    guild = await get_guild_or_404(db, guild_id)
    await require_permission(db, guild, current_user, Permissions.MANAGE_GUILD)

    result = await db.execute(
        select(VanityInvite).where(VanityInvite.guild_id == guild_id)
    )
    vanity = result.scalar_one_or_none()
    if vanity is None:
        vanity = VanityInvite(guild_id=guild_id, code=body.code)
        db.add(vanity)
    else:
        vanity.code = body.code
    await db.commit()
    await db.refresh(vanity)
    return VanityInviteOut.model_validate(vanity)


@router.get("/guilds/{guild_id}/vanity", response_model=VanityInviteOut)
async def get_vanity_invite(guild_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(VanityInvite).where(VanityInvite.guild_id == guild_id)
    )
    vanity = result.scalar_one_or_none()
    if vanity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No vanity URL set")
    return VanityInviteOut.model_validate(vanity)


# ===========================================================================
# 19. Extended Audit Log
# ===========================================================================


@router.get("/guilds/{guild_id}/audit-log-ext", response_model=list[ExtendedAuditLogOut])
async def list_extended_audit_log(
    guild_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    limit: int = Query(default=50, le=100),
    before: uuid.UUID | None = Query(default=None),
):
    await require_member(db, guild_id, current_user.id)

    query = (
        select(ExtendedAuditLog)
        .where(ExtendedAuditLog.guild_id == guild_id)
        .order_by(ExtendedAuditLog.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        before_result = await db.execute(
            select(ExtendedAuditLog.created_at).where(ExtendedAuditLog.id == before)
        )
        before_ts = before_result.scalar_one_or_none()
        if before_ts is not None:
            query = query.where(ExtendedAuditLog.created_at < before_ts)
    result = await db.execute(query)
    return [ExtendedAuditLogOut.model_validate(e) for e in result.scalars().all()]


# ===========================================================================
# 20. User Connections
# ===========================================================================


@router.post("/users/me/connections", response_model=UserConnectionOut, status_code=status.HTTP_201_CREATED)
async def create_user_connection(body: UserConnectionCreate, db: DbDep, current_user: CurrentUser):
    connection = UserConnection(
        user_id=current_user.id,
        provider=body.provider,
        provider_id=body.provider_id,
        provider_name=body.provider_name,
        is_visible=body.is_visible,
    )
    db.add(connection)
    await db.commit()
    await db.refresh(connection)
    return UserConnectionOut.model_validate(connection)


@router.get("/users/me/connections", response_model=list[UserConnectionOut])
async def list_my_connections(db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(UserConnection).where(UserConnection.user_id == current_user.id)
    )
    return [UserConnectionOut.model_validate(c) for c in result.scalars().all()]


@router.get("/users/{user_id}/connections", response_model=list[UserConnectionOut])
async def list_user_connections(user_id: uuid.UUID, db: DbDep, _: CurrentUser):
    result = await db.execute(
        select(UserConnection).where(
            UserConnection.user_id == user_id,
            UserConnection.is_visible.is_(True),
        )
    )
    return [UserConnectionOut.model_validate(c) for c in result.scalars().all()]


@router.delete("/users/me/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_connection(connection_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(UserConnection).where(
            UserConnection.id == connection_id,
            UserConnection.user_id == current_user.id,
        )
    )
    connection = result.scalar_one_or_none()
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    await db.delete(connection)
    await db.commit()
