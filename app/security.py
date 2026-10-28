"""Security, password hashing, and JWT token management for SmartSchedule AI 3.0."""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
import jwt
from fastapi import Header, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

security_bearer = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8')[:72], salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8')[:72], hashed_password.encode('utf-8'))
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Generate a signed JWT token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a signed JWT token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except Exception:
        return None

def verify_api_key(x_api_key: Optional[str] = Header(default=None)) -> bool:
    """Verify the backward-compatible X-API-Key header."""
    if not x_api_key:
        return False
    current_key = os.getenv("SMARTSCHEDULE_API_KEY", settings.SMARTSCHEDULE_API_KEY)
    return secrets.compare_digest(x_api_key, current_key)

def get_current_user_or_api_key(
    x_api_key: Optional[str] = Header(default=None),
    auth_cred: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)
) -> dict:
    """
    Unified authentication:
    1. Checks X-API-Key (admin access for automation, UiPath, backward compatibility)
    2. Checks Bearer JWT Token for logged-in users
    3. Raises HTTP 401 if neither is valid.
    """
    # 1. API Key check
    if x_api_key and verify_api_key(x_api_key):
        return {
            "type": "api_key",
            "role": "admin",
            "email": "api-key@smartschedule.local",
            "sub": "api_key"
        }

    # 2. Bearer token check
    if auth_cred and auth_cred.credentials:
        payload = decode_access_token(auth_cred.credentials)
        if payload:
            return {
                "type": "jwt",
                "role": payload.get("role", "customer"),
                "email": payload.get("email"),
                "sub": payload.get("sub"),
                "id": payload.get("id")
            }

    raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key or Bearer Token")

def require_admin(auth_data: dict = Depends(get_current_user_or_api_key)):
    """Enforce admin privileges."""
    if auth_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return auth_data
