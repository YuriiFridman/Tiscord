from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, create_test_user


# ─── Helpers ─────────────────────────────────────────────────────────────────


async def create_guild(client: AsyncClient, token: str, name: str = "Test Guild"):
    r = await client.post("/api/v1/guilds/", json={"name": name}, headers=auth_headers(token))
    assert r.status_code == 201
    return r.json()


async def create_channel(client: AsyncClient, token: str, guild_id: str, name: str = "general"):
    r = await client.post(
        f"/api/v1/guilds/{guild_id}/channels",
        json={"name": name, "type": "text"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    return r.json()


async def create_voice_channel(client: AsyncClient, token: str, guild_id: str, name: str = "voice"):
    r = await client.post(
        f"/api/v1/guilds/{guild_id}/channels",
        json={"name": name, "type": "voice"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    return r.json()


async def create_message(client: AsyncClient, token: str, channel_id: str, content: str = "hello"):
    r = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": content},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    return r.json()


# ─── 1. Screen Sharing ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_screen_share_start(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user1", email="f20_u1@example.com")
    guild = await create_guild(client, token)
    vc = await create_voice_channel(client, token, guild["id"])

    await client.post(f"/api/v1/voice/channels/{vc['id']}/join", headers=auth_headers(token))

    r = await client.post(
        f"/api/v1/voice/channels/{vc['id']}/screen-share/start",
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    data = r.json()
    assert "stream_key" in data
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_screen_share_stop(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user2", email="f20_u2@example.com")
    guild = await create_guild(client, token)
    vc = await create_voice_channel(client, token, guild["id"])

    await client.post(f"/api/v1/voice/channels/{vc['id']}/join", headers=auth_headers(token))
    await client.post(
        f"/api/v1/voice/channels/{vc['id']}/screen-share/start",
        headers=auth_headers(token),
    )

    r = await client.post(
        f"/api/v1/voice/channels/{vc['id']}/screen-share/stop",
        headers=auth_headers(token),
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_screen_share_list(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user3", email="f20_u3@example.com")
    guild = await create_guild(client, token)
    vc = await create_voice_channel(client, token, guild["id"])

    await client.post(f"/api/v1/voice/channels/{vc['id']}/join", headers=auth_headers(token))
    await client.post(
        f"/api/v1/voice/channels/{vc['id']}/screen-share/start",
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/voice/channels/{vc['id']}/screen-share",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


# ─── 2. Guild Events ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_guild_event(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user4", email="f20_u4@example.com")
    guild = await create_guild(client, token)

    r = await client.post(
        f"/api/v1/guilds/{guild['id']}/events",
        json={"name": "Game Night", "start_time": "2030-01-01T00:00:00Z"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Game Night"


@pytest.mark.asyncio
async def test_list_guild_events(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user5", email="f20_u5@example.com")
    guild = await create_guild(client, token)

    await client.post(
        f"/api/v1/guilds/{guild['id']}/events",
        json={"name": "Event A", "start_time": "2030-01-01T00:00:00Z"},
        headers=auth_headers(token),
    )
    await client.post(
        f"/api/v1/guilds/{guild['id']}/events",
        json={"name": "Event B", "start_time": "2030-02-01T00:00:00Z"},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/guilds/{guild['id']}/events",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 2


# ─── 3. Polls ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_poll(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user6", email="f20_u6@example.com")
    guild = await create_guild(client, token)
    channel = await create_channel(client, token, guild["id"])

    r = await client.post(
        f"/api/v1/channels/{channel['id']}/polls",
        json={"question": "Favorite color?", "options": ["Red", "Blue", "Green"]},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    assert r.json()["question"] == "Favorite color?"


@pytest.mark.asyncio
async def test_poll_vote_and_results(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user7", email="f20_u7@example.com")
    guild = await create_guild(client, token)
    channel = await create_channel(client, token, guild["id"])

    poll = await client.post(
        f"/api/v1/channels/{channel['id']}/polls",
        json={"question": "Pick one", "options": ["A", "B"]},
        headers=auth_headers(token),
    )
    poll_id = poll.json()["id"]

    vote_r = await client.post(
        f"/api/v1/channels/{channel['id']}/polls/{poll_id}/vote",
        json={"option_index": 0},
        headers=auth_headers(token),
    )
    assert vote_r.status_code == 201

    results_r = await client.get(
        f"/api/v1/channels/{channel['id']}/polls/{poll_id}/results",
        headers=auth_headers(token),
    )
    assert results_r.status_code == 200
    assert results_r.json()["results"]["0"] == 1


# ─── 4. Threads ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_thread(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user8", email="f20_u8@example.com")
    guild = await create_guild(client, token)
    channel = await create_channel(client, token, guild["id"])

    r = await client.post(
        f"/api/v1/channels/{channel['id']}/threads",
        json={"name": "My Thread"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    assert r.json()["parent_id"] == channel["id"]


@pytest.mark.asyncio
async def test_list_threads(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user9", email="f20_u9@example.com")
    guild = await create_guild(client, token)
    channel = await create_channel(client, token, guild["id"])

    await client.post(
        f"/api/v1/channels/{channel['id']}/threads",
        json={"name": "Thread 1"},
        headers=auth_headers(token),
    )
    await client.post(
        f"/api/v1/channels/{channel['id']}/threads",
        json={"name": "Thread 2"},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/channels/{channel['id']}/threads",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 2


# ─── 5. User Activity ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_set_and_get_activity(client: AsyncClient):
    token, user = await create_test_user(client, username="f20_user10", email="f20_u10@example.com")

    await client.put(
        "/api/v1/users/me/activity",
        json={"activity_type": "playing", "activity_name": "Chess", "details": "Ranked"},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/users/{user['id']}/activity",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert r.json()["activity_name"] == "Chess"


@pytest.mark.asyncio
async def test_clear_activity(client: AsyncClient):
    token, user = await create_test_user(client, username="f20_user11", email="f20_u11@example.com")

    await client.put(
        "/api/v1/users/me/activity",
        json={"activity_type": "listening", "activity_name": "Music"},
        headers=auth_headers(token),
    )
    await client.delete("/api/v1/users/me/activity", headers=auth_headers(token))

    r = await client.get(
        f"/api/v1/users/{user['id']}/activity",
        headers=auth_headers(token),
    )
    assert r.status_code == 404


# ─── 6. Guild Emojis ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_emojis(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user12", email="f20_u12@example.com")
    guild = await create_guild(client, token)

    await client.post(
        f"/api/v1/guilds/{guild['id']}/emojis",
        json={"name": "pepe", "image_url": "https://cdn.example.com/pepe.png"},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/guilds/{guild['id']}/emojis",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


# ─── 7. Bookmarks ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_bookmarks(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user13", email="f20_u13@example.com")
    guild = await create_guild(client, token)
    channel = await create_channel(client, token, guild["id"])
    msg = await create_message(client, token, channel["id"], "save this")

    await client.post(
        "/api/v1/bookmarks",
        json={"message_id": msg["id"], "note": "important"},
        headers=auth_headers(token),
    )

    r = await client.get("/api/v1/bookmarks", headers=auth_headers(token))
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.asyncio
async def test_delete_bookmark(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user14", email="f20_u14@example.com")
    guild = await create_guild(client, token)
    channel = await create_channel(client, token, guild["id"])
    msg = await create_message(client, token, channel["id"], "to delete")

    bm = await client.post(
        "/api/v1/bookmarks",
        json={"message_id": msg["id"]},
        headers=auth_headers(token),
    )
    bm_id = bm.json()["id"]

    r = await client.delete(f"/api/v1/bookmarks/{bm_id}", headers=auth_headers(token))
    assert r.status_code == 204


# ─── 8. Guild Settings ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_default_guild_settings(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user15", email="f20_u15@example.com")
    guild = await create_guild(client, token)

    r = await client.get(
        f"/api/v1/guilds/{guild['id']}/settings",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert r.json()["afk_timeout"] == 300


@pytest.mark.asyncio
async def test_update_guild_settings(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user16", email="f20_u16@example.com")
    guild = await create_guild(client, token)

    r = await client.patch(
        f"/api/v1/guilds/{guild['id']}/settings",
        json={"afk_timeout": 600},
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert r.json()["afk_timeout"] == 600


# ─── 9. Server Templates ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_templates(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user17", email="f20_u17@example.com")
    guild = await create_guild(client, token)

    await client.post(
        f"/api/v1/guilds/{guild['id']}/templates",
        json={"name": "Starter", "description": "A starter template"},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/guilds/{guild['id']}/templates",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


# ─── 10. Sound Effects ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_sound_effects(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user18", email="f20_u18@example.com")
    guild = await create_guild(client, token)

    await client.post(
        f"/api/v1/guilds/{guild['id']}/sound-effects",
        json={"name": "airhorn", "file_url": "https://cdn.example.com/airhorn.mp3", "duration_ms": 2000},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/guilds/{guild['id']}/sound-effects",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


# ─── 11. Reminders ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_reminders(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user19", email="f20_u19@example.com")

    await client.post(
        "/api/v1/reminders",
        json={"content": "Buy milk", "remind_at": "2030-01-01T00:00:00Z"},
        headers=auth_headers(token),
    )

    r = await client.get("/api/v1/reminders", headers=auth_headers(token))
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.asyncio
async def test_delete_reminder(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user20", email="f20_u20@example.com")

    rem = await client.post(
        "/api/v1/reminders",
        json={"content": "Trash day", "remind_at": "2030-01-01T00:00:00Z"},
        headers=auth_headers(token),
    )
    rem_id = rem.json()["id"]

    r = await client.delete(f"/api/v1/reminders/{rem_id}", headers=auth_headers(token))
    assert r.status_code == 204


# ─── 12. Auto-mod Rules ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_automod(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user21", email="f20_u21@example.com")
    guild = await create_guild(client, token)

    await client.post(
        f"/api/v1/guilds/{guild['id']}/automod",
        json={
            "name": "No spam",
            "trigger_type": "keyword",
            "trigger_metadata": "[]",
            "action_type": "block_message",
        },
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/guilds/{guild['id']}/automod",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.asyncio
async def test_update_automod(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user22", email="f20_u22@example.com")
    guild = await create_guild(client, token)

    rule = await client.post(
        f"/api/v1/guilds/{guild['id']}/automod",
        json={
            "name": "Old Rule",
            "trigger_type": "keyword",
            "trigger_metadata": "[]",
            "action_type": "block_message",
        },
        headers=auth_headers(token),
    )
    rule_id = rule.json()["id"]

    r = await client.patch(
        f"/api/v1/guilds/{guild['id']}/automod/{rule_id}",
        json={"name": "Updated Rule"},
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Updated Rule"


# ─── 13. User Slowmode ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_set_and_list_user_slowmode(client: AsyncClient):
    token, user = await create_test_user(client, username="f20_user23", email="f20_u23@example.com")
    guild = await create_guild(client, token)
    channel = await create_channel(client, token, guild["id"])

    await client.put(
        f"/api/v1/channels/{channel['id']}/slowmode/users",
        json={"user_id": user["id"], "delay_seconds": 30},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/channels/{channel['id']}/slowmode/users",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


# ─── 14. Channel Archive ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_archive_and_unarchive(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user24", email="f20_u24@example.com")
    guild = await create_guild(client, token)
    channel = await create_channel(client, token, guild["id"], name="lobby")

    # Archive
    r = await client.post(
        f"/api/v1/guilds/{guild['id']}/channels/{channel['id']}/archive",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert r.json()["name"].startswith("[ARCHIVED]")

    # Unarchive
    r = await client.post(
        f"/api/v1/guilds/{guild['id']}/channels/{channel['id']}/unarchive",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert not r.json()["name"].startswith("[ARCHIVED]")


# ─── 15. Stickers ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_stickers(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user25", email="f20_u25@example.com")
    guild = await create_guild(client, token)

    await client.post(
        f"/api/v1/guilds/{guild['id']}/stickers",
        json={"name": "wave", "image_url": "https://cdn.example.com/wave.png"},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/guilds/{guild['id']}/stickers",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


# ─── 16. User Badges ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_award_and_list_badges(client: AsyncClient):
    token, user = await create_test_user(client, username="f20_user26", email="f20_u26@example.com")

    await client.post(
        f"/api/v1/users/{user['id']}/badges",
        json={"user_id": user["id"], "badge_name": "Early Adopter", "description": "First 100 users"},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/users/{user['id']}/badges",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


# ─── 17. Guild Tags ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_tags(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user27", email="f20_u27@example.com")
    guild = await create_guild(client, token)

    await client.post(
        f"/api/v1/guilds/{guild['id']}/tags",
        json={"tag": "gaming"},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/guilds/{guild['id']}/tags",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


# ─── 18. Vanity Invite ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_set_and_get_vanity(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user28", email="f20_u28@example.com")
    guild = await create_guild(client, token)

    await client.put(
        f"/api/v1/guilds/{guild['id']}/vanity",
        json={"code": "cool-server"},
        headers=auth_headers(token),
    )

    r = await client.get(
        f"/api/v1/guilds/{guild['id']}/vanity",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert r.json()["code"] == "cool-server"


# ─── 19. Extended Audit Log ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_extended_audit_log(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user29", email="f20_u29@example.com")
    guild = await create_guild(client, token)

    r = await client.get(
        f"/api/v1/guilds/{guild['id']}/audit-log-ext",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ─── 20. User Connections ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_and_list_connections(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user30", email="f20_u30@example.com")

    await client.post(
        "/api/v1/users/me/connections",
        json={"provider": "github", "provider_id": "12345", "provider_name": "octocat"},
        headers=auth_headers(token),
    )

    r = await client.get("/api/v1/users/me/connections", headers=auth_headers(token))
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.asyncio
async def test_delete_connection(client: AsyncClient):
    token, _ = await create_test_user(client, username="f20_user31", email="f20_u31@example.com")

    conn = await client.post(
        "/api/v1/users/me/connections",
        json={"provider": "twitter", "provider_id": "99999", "provider_name": "tweeter"},
        headers=auth_headers(token),
    )
    conn_id = conn.json()["id"]

    r = await client.delete(
        f"/api/v1/users/me/connections/{conn_id}",
        headers=auth_headers(token),
    )
    assert r.status_code == 204
