from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, create_test_user


async def setup_channel(client: AsyncClient, username_suffix: str = ""):
    suffix = username_suffix or "msgtest"
    token, user = await create_test_user(client, username=f"msguser{suffix}", email=f"msg{suffix}@example.com")
    guild_resp = await client.post("/api/v1/guilds/", json={"name": "Message Guild"}, headers=auth_headers(token))
    guild_id = guild_resp.json()["id"]
    ch_resp = await client.post(
        f"/api/v1/guilds/{guild_id}/channels",
        json={"name": "general", "type": "text"},
        headers=auth_headers(token),
    )
    channel_id = ch_resp.json()["id"]
    return token, guild_id, channel_id


@pytest.mark.asyncio
async def test_send_message(client: AsyncClient):
    token, _, channel_id = await setup_channel(client, "send")
    response = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "Hello World"},
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["content"] == "Hello World"
    assert data["is_edited"] is False


@pytest.mark.asyncio
async def test_edit_message(client: AsyncClient):
    token, _, channel_id = await setup_channel(client, "edit")
    msg_resp = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "Original"},
        headers=auth_headers(token),
    )
    msg_id = msg_resp.json()["id"]

    edit_resp = await client.patch(
        f"/api/v1/channels/{channel_id}/messages/{msg_id}",
        json={"content": "Edited"},
        headers=auth_headers(token),
    )
    assert edit_resp.status_code == 200
    assert edit_resp.json()["content"] == "Edited"
    assert edit_resp.json()["is_edited"] is True


@pytest.mark.asyncio
async def test_delete_message(client: AsyncClient):
    token, _, channel_id = await setup_channel(client, "del")
    msg_resp = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "To be deleted"},
        headers=auth_headers(token),
    )
    msg_id = msg_resp.json()["id"]

    del_resp = await client.delete(
        f"/api/v1/channels/{channel_id}/messages/{msg_id}",
        headers=auth_headers(token),
    )
    assert del_resp.status_code == 204


@pytest.mark.asyncio
async def test_send_message_with_deleted_reply_target_returns_400(client: AsyncClient):
    token, _, channel_id = await setup_channel(client, "replydeleted")
    original_resp = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "Original"},
        headers=auth_headers(token),
    )
    original_id = original_resp.json()["id"]

    del_resp = await client.delete(
        f"/api/v1/channels/{channel_id}/messages/{original_id}",
        headers=auth_headers(token),
    )
    assert del_resp.status_code == 204

    reply_resp = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "Reply to deleted", "reply_to_id": original_id},
        headers=auth_headers(token),
    )
    assert reply_resp.status_code == 400
    assert reply_resp.json()["detail"] == "Reply target message not found"


@pytest.mark.asyncio
async def test_send_message_with_reply_returns_reply_preview(client: AsyncClient):
    token, _, channel_id = await setup_channel(client, "replyok")
    original_resp = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "Original"},
        headers=auth_headers(token),
    )
    assert original_resp.status_code == 201
    original_id = original_resp.json()["id"]

    reply_resp = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "Reply", "reply_to_id": original_id},
        headers=auth_headers(token),
    )
    assert reply_resp.status_code == 201
    reply_data = reply_resp.json()
    assert reply_data["reply_to_id"] == original_id
    assert reply_data["reply_to"] is not None
    assert reply_data["reply_to"]["id"] == original_id
    assert reply_data["reply_to"]["content"] == "Original"
    assert reply_data["reply_to"]["author"] is not None


@pytest.mark.asyncio
async def test_message_pagination(client: AsyncClient):
    token, _, channel_id = await setup_channel(client, "page")

    # Send 5 messages
    msg_ids = []
    for i in range(5):
        resp = await client.post(
            f"/api/v1/channels/{channel_id}/messages",
            json={"content": f"Message {i}"},
            headers=auth_headers(token),
        )
        msg_ids.append(resp.json()["id"])

    # Fetch all
    list_resp = await client.get(f"/api/v1/channels/{channel_id}/messages", headers=auth_headers(token))
    assert list_resp.status_code == 200
    messages = list_resp.json()
    assert len(messages) == 5

    # Pagination: fetch before the last message
    last_id = msg_ids[-1]
    paged_resp = await client.get(
        f"/api/v1/channels/{channel_id}/messages?before={last_id}&limit=3",
        headers=auth_headers(token),
    )
    assert paged_resp.status_code == 200
    paged = paged_resp.json()
    assert len(paged) <= 3
    assert all(m["id"] != last_id for m in paged)


@pytest.mark.asyncio
async def test_reaction(client: AsyncClient):
    token, _, channel_id = await setup_channel(client, "react")
    msg_resp = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "React to me"},
        headers=auth_headers(token),
    )
    msg_id = msg_resp.json()["id"]

    add_resp = await client.post(
        f"/api/v1/channels/{channel_id}/messages/{msg_id}/reactions/👍",
        headers=auth_headers(token),
    )
    assert add_resp.status_code == 201

    del_resp = await client.delete(
        f"/api/v1/channels/{channel_id}/messages/{msg_id}/reactions/👍",
        headers=auth_headers(token),
    )
    assert del_resp.status_code == 204
