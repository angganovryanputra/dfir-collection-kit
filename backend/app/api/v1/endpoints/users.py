from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.user import count_admins, create_user, delete_user, get_user, list_users, update_user
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.audit_log_service import safe_record_event

router = APIRouter()


@router.get("/", response_model=list[UserOut], dependencies=[Depends(require_roles("admin"))])
async def get_users(db: AsyncSession = Depends(get_db)) -> list[UserOut]:
    users = await list_users(db)
    return [UserOut.model_validate(user) for user in users]


@router.get("/me", response_model=UserOut)
async def get_current_user_endpoint(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.post("/", response_model=UserOut, dependencies=[Depends(require_roles("admin"))])
async def create_user_endpoint(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    user = await create_user(db, payload)
    await safe_record_event(
        db,
        event_type="admin_user_created",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="create user",
        target_type="user",
        target_id=user.id,
        status="success",
        message="User created",
        metadata={"username": user.username, "role": user.role},
    )
    return UserOut.model_validate(user)


@router.patch("/{user_id}", response_model=UserOut, dependencies=[Depends(require_roles("admin"))])
async def update_user_endpoint(
    user_id: str,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    target = await get_user(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id and payload.status and payload.status != "active":
        await safe_record_event(
            db,
            event_type="admin.user.update",
            actor_type="user",
            actor_id=current_user.id,
            source="backend",
            action="disable self",
            target_type="user",
            target_id=target.id,
            status="failure",
            message="Blocked self-disable attempt",
            metadata={"reason": "self_disable_blocked"},
        )
        raise HTTPException(status_code=409, detail="Cannot disable current admin user")
    if target.id == current_user.id and payload.role and payload.role != "admin":
        await safe_record_event(
            db,
            event_type="admin.user.update",
            actor_type="user",
            actor_id=current_user.id,
            source="backend",
            action="change role",
            target_type="user",
            target_id=target.id,
            status="failure",
            message="Blocked self role change",
            metadata={"reason": "self_role_change_blocked"},
        )
        raise HTTPException(status_code=409, detail="Cannot change role for current admin user")
    if target.role == "admin" and payload.role and payload.role != "admin":
        if await count_admins(db) <= 1:
            await safe_record_event(
                db,
                event_type="admin.user.update",
                actor_type="user",
                actor_id=current_user.id,
                source="backend",
                action="demote admin",
                target_type="user",
                target_id=target.id,
                status="failure",
                message="Blocked last admin demotion",
                metadata={"reason": "last_admin"},
            )
            raise HTTPException(status_code=409, detail="Cannot demote the last admin")
    role_change = payload.role is not None and payload.role != target.role
    user = await update_user(db, user_id, payload)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await safe_record_event(
        db,
        event_type="admin_user_updated",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="update user",
        target_type="user",
        target_id=user.id,
        status="success",
        message="User updated",
        metadata={"role": user.role, "status": user.status},
    )
    if role_change:
        await safe_record_event(
            db,
            event_type="admin_role_changed",
            actor_type="user",
            actor_id=current_user.id,
            source="backend",
            action="change role",
            target_type="user",
            target_id=user.id,
            status="success",
            message="User role changed",
            metadata={"role": user.role},
        )
    return UserOut.model_validate(user)


@router.delete("/{user_id}", dependencies=[Depends(require_roles("admin"))])
async def delete_user_endpoint(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    target = await get_user(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        await safe_record_event(
            db,
            event_type="admin.user.delete",
            actor_type="user",
            actor_id=current_user.id,
            source="backend",
            action="delete self",
            target_type="user",
            target_id=target.id,
            status="failure",
            message="Blocked self-delete attempt",
            metadata={"reason": "self_delete_blocked"},
        )
        raise HTTPException(status_code=409, detail="Cannot delete current user")
    if target.role == "admin" and await count_admins(db) <= 1:
        await safe_record_event(
            db,
            event_type="admin.user.delete",
            actor_type="user",
            actor_id=current_user.id,
            source="backend",
            action="delete admin",
            target_type="user",
            target_id=target.id,
            status="failure",
            message="Blocked last admin deletion",
            metadata={"reason": "last_admin"},
        )
        raise HTTPException(status_code=409, detail="Cannot delete the last admin")
    deleted = await delete_user(db, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    await safe_record_event(
        db,
        event_type="admin_user_deleted",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="delete user",
        target_type="user",
        target_id=target.id,
        status="success",
        message="User deleted",
        metadata={"username": target.username},
    )
    return {"status": "deleted"}
