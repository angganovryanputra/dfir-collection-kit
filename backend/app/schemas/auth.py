from pydantic import BaseModel

from app.schemas.user import RoleEnum


class Token(BaseModel):
    # Browser authentication is delivered in an HttpOnly cookie.  The field is
    # retained as optional for response-schema compatibility, but is never
    # populated by the browser login endpoint.
    access_token: str | None = None
    token_type: str
    user_id: str | None = None
    username: str | None = None
    role: RoleEnum | None = None
    expires_at: str | None = None
    client_ip: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str
    role: str | None = None
