from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentUser, DbDep
from app.models.user import User
from app.models.user_note import UserNote
from app.schemas.user_note import UserNoteOut, UserNoteUpdate

router = APIRouter(tags=["user-notes"])


@router.get("/users/{user_id}/notes", response_model=UserNoteOut | None)
async def get_user_note(user_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    """Get the current user's private note about another user."""
    result = await db.execute(
        select(UserNote).where(
            UserNote.owner_id == current_user.id,
            UserNote.target_id == user_id,
        )
    )
    note = result.scalar_one_or_none()
    if note is None:
        return None
    return UserNoteOut.model_validate(note)


@router.put("/users/{user_id}/notes", response_model=UserNoteOut)
async def set_user_note(user_id: uuid.UUID, body: UserNoteUpdate, db: DbDep, current_user: CurrentUser):
    """Create or update the current user's private note about another user."""
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot set a note on yourself")

    # Verify target user exists
    target_result = await db.execute(select(User).where(User.id == user_id))
    if target_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    result = await db.execute(
        select(UserNote).where(
            UserNote.owner_id == current_user.id,
            UserNote.target_id == user_id,
        )
    )
    note = result.scalar_one_or_none()

    if note is None:
        note = UserNote(owner_id=current_user.id, target_id=user_id, content=body.content)
        db.add(note)
    else:
        note.content = body.content

    await db.commit()
    await db.refresh(note)
    return UserNoteOut.model_validate(note)


@router.delete("/users/{user_id}/notes", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_note(user_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    """Delete the current user's private note about another user."""
    result = await db.execute(
        select(UserNote).where(
            UserNote.owner_id == current_user.id,
            UserNote.target_id == user_id,
        )
    )
    note = result.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    await db.delete(note)
    await db.commit()
