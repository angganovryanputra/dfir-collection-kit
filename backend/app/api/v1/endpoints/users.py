from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_roles
from app.crud.user import create_user, delete_user, list_users, update_user
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter()


@router.get("/", response_model=list[UserOut], dependencies=[Depends(require_roles("admin"))])
async def get_users(db: AsyncSession = Depends(get_db)) -> list[UserOut]:
    users = await list_users(db)
    return [UserOut.model_validate(user) for user in users]


@router.post("/", response_model=UserOut, dependencies=[Depends(require_roles("admin"))])
async def create_user_endpoint(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> UserOut:
    user = await create_user(db, payload)
    return UserOut.model_validate(user)


@router.patch("/{user_id}", response_model=UserOut, dependencies=[Depends(require_roles("admin"))])
async def update_user_endpoint(
    user_id: str, payload: UserUpdate, db: AsyncSession = Depends(get_db)
) -> UserOut:
    user = await update_user(db, user_id, payload)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut.model_validate(user)


@router.delete("/{user_id}", dependencies=[Depends(require_roles("admin"))])
async def delete_user_endpoint(user_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    deleted = await delete_user(db, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "deleted"}
