from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbDep
from app.models.social import FriendRequest, FriendStatus
from app.schemas.social import FriendRequestCreate, FriendRequestOut
from app.ws.events import WSEvent
from app.ws.manager import manager

router = APIRouter(tags=["social"])


@router.get("/friends", response_model=list[FriendRequestOut])
async def list_friends(db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(FriendRequest)
        .where(
            FriendRequest.status == FriendStatus.accepted,
            or_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == current_user.id),
        )
        .options(selectinload(FriendRequest.sender), selectinload(FriendRequest.receiver))
    )
    return [FriendRequestOut.model_validate(r) for r in result.scalars().all()]


@router.get("/friends/requests", response_model=list[FriendRequestOut])
async def list_friend_requests(db: DbDep, current_user: CurrentUser):
    """Return both incoming and outgoing pending friend requests for the current user."""
    result = await db.execute(
        select(FriendRequest)
        .where(
            FriendRequest.status == FriendStatus.pending,
            or_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == current_user.id),
        )
        .options(selectinload(FriendRequest.sender), selectinload(FriendRequest.receiver))
    )
    return [FriendRequestOut.model_validate(r) for r in result.scalars().all()]


@router.post("/friends/requests", response_model=FriendRequestOut, status_code=status.HTTP_201_CREATED)
async def send_friend_request(body: FriendRequestCreate, db: DbDep, current_user: CurrentUser):
    if body.receiver_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot send friend request to yourself")

    existing = await db.execute(
        select(FriendRequest).where(
            or_(
                (FriendRequest.sender_id == current_user.id) & (FriendRequest.receiver_id == body.receiver_id),
                (FriendRequest.sender_id == body.receiver_id) & (FriendRequest.receiver_id == current_user.id),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Friend request already exists")

    req = FriendRequest(sender_id=current_user.id, receiver_id=body.receiver_id)
    db.add(req)
    await db.commit()
    await db.refresh(req)

    result = await db.execute(
        select(FriendRequest)
        .where(FriendRequest.id == req.id)
        .options(selectinload(FriendRequest.sender), selectinload(FriendRequest.receiver))
    )
    req = result.scalar_one()

    payload = FriendRequestOut.model_validate(req).model_dump(mode="json")
    await manager.send_to_user(body.receiver_id, WSEvent.FRIEND_REQUEST_CREATE, payload)

    return FriendRequestOut.model_validate(req)


@router.patch("/friends/requests/{request_id}", response_model=FriendRequestOut)
async def respond_to_friend_request(request_id: uuid.UUID, body: dict, db: DbDep, current_user: CurrentUser):
    action = body.get("action")
    if action not in ("accept", "reject"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="action must be 'accept' or 'reject'")

    result = await db.execute(
        select(FriendRequest)
        .where(FriendRequest.id == request_id, FriendRequest.receiver_id == current_user.id, FriendRequest.status == FriendStatus.pending)
        .options(selectinload(FriendRequest.sender), selectinload(FriendRequest.receiver))
    )
    req = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend request not found")

    if action == "accept":
        req.status = FriendStatus.accepted
    else:
        rejected_payload = FriendRequestOut.model_validate(req)
        await db.delete(req)
        await db.commit()
        return rejected_payload

    await db.commit()
    result = await db.execute(
        select(FriendRequest)
        .where(FriendRequest.id == request_id)
        .options(selectinload(FriendRequest.sender), selectinload(FriendRequest.receiver))
    )
    req = result.scalar_one()
    payload = FriendRequestOut.model_validate(req).model_dump(mode="json")
    await manager.send_to_user(req.sender_id, WSEvent.FRIEND_REQUEST_UPDATE, payload)

    return FriendRequestOut.model_validate(req)


@router.delete("/friends/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_friend(user_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(FriendRequest).where(
            FriendRequest.status == FriendStatus.accepted,
            or_(
                (FriendRequest.sender_id == current_user.id) & (FriendRequest.receiver_id == user_id),
                (FriendRequest.sender_id == user_id) & (FriendRequest.receiver_id == current_user.id),
            ),
        )
    )
    req = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend not found")
    await db.delete(req)
    await db.commit()


@router.post("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def block_user(user_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot block yourself")

    result = await db.execute(
        select(FriendRequest).where(
            or_(
                (FriendRequest.sender_id == current_user.id) & (FriendRequest.receiver_id == user_id),
                (FriendRequest.sender_id == user_id) & (FriendRequest.receiver_id == current_user.id),
            )
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.sender_id = current_user.id
        existing.receiver_id = user_id
        existing.status = FriendStatus.blocked
    else:
        block = FriendRequest(sender_id=current_user.id, receiver_id=user_id, status=FriendStatus.blocked)
        db.add(block)
    await db.commit()


@router.delete("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_user(user_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(FriendRequest).where(
            FriendRequest.sender_id == current_user.id,
            FriendRequest.receiver_id == user_id,
            FriendRequest.status == FriendStatus.blocked,
        )
    )
    req = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    await db.delete(req)
    await db.commit()


@router.get("/users/blocked", response_model=list[FriendRequestOut])
async def list_blocked(db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(FriendRequest)
        .where(FriendRequest.sender_id == current_user.id, FriendRequest.status == FriendStatus.blocked)
        .options(selectinload(FriendRequest.sender), selectinload(FriendRequest.receiver))
    )
    return [FriendRequestOut.model_validate(r) for r in result.scalars().all()]
