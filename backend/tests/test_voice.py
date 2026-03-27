from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, create_test_user


async def setup_voice_channel(client: AsyncClient, suffix: str):
    token, _ = await create_test_user(client, username=f"voiceuser{suffix}", email=f"voice{suffix}@example.com")
    guild_resp = await client.post("/api/v1/guilds/", json={"name": "Voice Guild"}, headers=auth_headers(token))
    guild_id = guild_resp.json()["id"]
    ch_resp = await client.post(
        f"/api/v1/guilds/{guild_id}/channels",
        json={"name": "voice", "type": "voice"},
        headers=auth_headers(token),
    )
    channel_id = ch_resp.json()["id"]
    return token, channel_id


@pytest.mark.asyncio
async def test_update_voice_state(client: AsyncClient):
    token, channel_id = await setup_voice_channel(client, "state")

    join_resp = await client.post(
        f"/api/v1/voice/channels/{channel_id}/join",
        headers=auth_headers(token),
    )
    assert join_resp.status_code == 200

    state_resp = await client.patch(
        f"/api/v1/voice/channels/{channel_id}/state",
        json={"is_muted": True, "is_deafened": True},
        headers=auth_headers(token),
    )
    assert state_resp.status_code == 200
    assert state_resp.json()["ok"] is True

    participants_resp = await client.get(
        f"/api/v1/voice/channels/{channel_id}/participants",
        headers=auth_headers(token),
    )
    assert participants_resp.status_code == 200
    participants = participants_resp.json()
    assert len(participants) == 1
    assert participants[0]["is_muted"] is True
    assert participants[0]["is_deafened"] is True


@pytest.mark.asyncio
async def test_update_voice_state_without_session_returns_404(client: AsyncClient):
    token, channel_id = await setup_voice_channel(client, "nosession")

    state_resp = await client.patch(
        f"/api/v1/voice/channels/{channel_id}/state",
        json={"is_muted": True},
        headers=auth_headers(token),
    )
    assert state_resp.status_code == 404
    assert state_resp.json()["detail"] == "Voice session not found"


@pytest.mark.asyncio
async def test_update_voice_state_in_dm_channel(client: AsyncClient):
    token, _owner = await create_test_user(client, username="voicedmowner", email="voicedmowner@example.com")
    token2, user2 = await create_test_user(client, username="voicedmjoiner", email="voicedmjoiner@example.com")

    dm_resp = await client.post(
        "/api/v1/dms/",
        json={"user_ids": [user2["id"]]},
        headers=auth_headers(token),
    )
    assert dm_resp.status_code == 201
    channel_id = dm_resp.json()["channel_id"]

    join_resp = await client.post(
        f"/api/v1/voice/channels/{channel_id}/join",
        headers=auth_headers(token),
    )
    assert join_resp.status_code == 200

    state_resp = await client.patch(
        f"/api/v1/voice/channels/{channel_id}/state",
        json={"is_muted": True, "is_deafened": True},
        headers=auth_headers(token),
    )
    assert state_resp.status_code == 200
    assert state_resp.json()["ok"] is True
