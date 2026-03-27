from __future__ import annotations

import pyotp
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import CurrentUser, DbDep
from app.models.user import User

router = APIRouter(prefix="/auth/2fa", tags=["2fa"])


class TOTPSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str


class TOTPVerifyRequest(BaseModel):
    code: str


class TOTPDisableRequest(BaseModel):
    code: str


@router.post("/setup", response_model=TOTPSetupResponse)
async def setup_2fa(db: DbDep, current_user: CurrentUser):
    if current_user.is_2fa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is already enabled")

    secret = pyotp.random_base32()
    current_user.totp_secret = secret
    await db.commit()

    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=current_user.email, issuer_name="Nexora")

    return TOTPSetupResponse(secret=secret, provisioning_uri=uri)


@router.post("/verify", status_code=status.HTTP_204_NO_CONTENT)
async def verify_2fa(body: TOTPVerifyRequest, db: DbDep, current_user: CurrentUser):
    if current_user.is_2fa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is already enabled")
    if not current_user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA setup not initiated")

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(body.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid TOTP code")

    current_user.is_2fa_enabled = True
    await db.commit()


@router.post("/disable", status_code=status.HTTP_204_NO_CONTENT)
async def disable_2fa(body: TOTPDisableRequest, db: DbDep, current_user: CurrentUser):
    if not current_user.is_2fa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is not enabled")

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(body.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid TOTP code")

    current_user.is_2fa_enabled = False
    current_user.totp_secret = None
    await db.commit()
