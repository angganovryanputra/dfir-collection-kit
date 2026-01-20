from pydantic import BaseModel

from app.schemas.user import RoleEnum


class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: str | None = None
    username: str | None = None
    role: RoleEnum | None = None
    expires_at: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str
    role: str | None = None
