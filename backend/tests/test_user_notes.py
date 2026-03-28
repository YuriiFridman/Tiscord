from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, create_test_user


@pytest.mark.asyncio
async def test_get_note_empty(client: AsyncClient):
    token_a, user_a = await create_test_user(client, username="notea1", email="notea1@example.com")
    _, user_b = await create_test_user(client, username="noteb1", email="noteb1@example.com")

    response = await client.get(f"/api/v1/users/{user_b['id']}/notes", headers=auth_headers(token_a))
    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.asyncio
async def test_set_and_get_note(client: AsyncClient):
    token_a, user_a = await create_test_user(client, username="notea2", email="notea2@example.com")
    _, user_b = await create_test_user(client, username="noteb2", email="noteb2@example.com")

    # Set note
    response = await client.put(
        f"/api/v1/users/{user_b['id']}/notes",
        json={"content": "Good friend"},
        headers=auth_headers(token_a),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["content"] == "Good friend"
    assert data["owner_id"] == user_a["id"]
    assert data["target_id"] == user_b["id"]

    # Get note
    response = await client.get(f"/api/v1/users/{user_b['id']}/notes", headers=auth_headers(token_a))
    assert response.status_code == 200
    assert response.json()["content"] == "Good friend"


@pytest.mark.asyncio
async def test_update_existing_note(client: AsyncClient):
    token_a, _ = await create_test_user(client, username="notea3", email="notea3@example.com")
    _, user_b = await create_test_user(client, username="noteb3", email="noteb3@example.com")

    # Create
    await client.put(
        f"/api/v1/users/{user_b['id']}/notes",
        json={"content": "Initial note"},
        headers=auth_headers(token_a),
    )

    # Update
    response = await client.put(
        f"/api/v1/users/{user_b['id']}/notes",
        json={"content": "Updated note"},
        headers=auth_headers(token_a),
    )
    assert response.status_code == 200
    assert response.json()["content"] == "Updated note"


@pytest.mark.asyncio
async def test_delete_note(client: AsyncClient):
    token_a, _ = await create_test_user(client, username="notea4", email="notea4@example.com")
    _, user_b = await create_test_user(client, username="noteb4", email="noteb4@example.com")

    # Create
    await client.put(
        f"/api/v1/users/{user_b['id']}/notes",
        json={"content": "To be deleted"},
        headers=auth_headers(token_a),
    )

    # Delete
    response = await client.delete(f"/api/v1/users/{user_b['id']}/notes", headers=auth_headers(token_a))
    assert response.status_code == 204

    # Verify deleted
    response = await client.get(f"/api/v1/users/{user_b['id']}/notes", headers=auth_headers(token_a))
    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.asyncio
async def test_delete_nonexistent_note(client: AsyncClient):
    token_a, _ = await create_test_user(client, username="notea5", email="notea5@example.com")
    _, user_b = await create_test_user(client, username="noteb5", email="noteb5@example.com")

    response = await client.delete(f"/api/v1/users/{user_b['id']}/notes", headers=auth_headers(token_a))
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_cannot_set_note_on_self(client: AsyncClient):
    token_a, user_a = await create_test_user(client, username="notea6", email="notea6@example.com")

    response = await client.put(
        f"/api/v1/users/{user_a['id']}/notes",
        json={"content": "Self note"},
        headers=auth_headers(token_a),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_note_is_private(client: AsyncClient):
    token_a, user_a = await create_test_user(client, username="notea7", email="notea7@example.com")
    token_b, user_b = await create_test_user(client, username="noteb7", email="noteb7@example.com")

    # A sets note on B
    await client.put(
        f"/api/v1/users/{user_b['id']}/notes",
        json={"content": "Secret note"},
        headers=auth_headers(token_a),
    )

    # B cannot see A's note about B
    response = await client.get(f"/api/v1/users/{user_b['id']}/notes", headers=auth_headers(token_b))
    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.asyncio
async def test_set_note_nonexistent_user(client: AsyncClient):
    token_a, _ = await create_test_user(client, username="notea8", email="notea8@example.com")

    response = await client.put(
        "/api/v1/users/00000000-0000-0000-0000-000000000099/notes",
        json={"content": "Ghost note"},
        headers=auth_headers(token_a),
    )
    assert response.status_code == 404
