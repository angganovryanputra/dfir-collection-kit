from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.template import (
    create_template,
    delete_template,
    get_template,
    increment_usage,
    list_templates,
    update_template,
)
from app.models.user import User
from app.schemas.template import IncidentTemplateCreate, IncidentTemplateOut, IncidentTemplateUpdate
from app.services.audit_log_service import safe_record_event

router = APIRouter()


@router.get("/", response_model=list[IncidentTemplateOut])
async def get_templates(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[IncidentTemplateOut]:
    templates = await list_templates(db)
    return [IncidentTemplateOut.model_validate(template) for template in templates]


@router.post(
    "/",
    response_model=IncidentTemplateOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def create_template_endpoint(
    payload: IncidentTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IncidentTemplateOut:
    data = payload.model_dump()
    data["created_by"] = user.username
    data["usage_count"] = 0
    template = await create_template(db, IncidentTemplateCreate(**data))
    await safe_record_event(
        db,
        event_type="template.create",
        actor_type="user",
        actor_id=user.id,
        source="backend",
        action="create template",
        target_type="preset",
        target_id=template.id,
        status="success",
        message="Template created",
        metadata={"name": template.name, "incident_type": template.incident_type},
    )
    return IncidentTemplateOut.model_validate(template)


@router.get("/{template_id}", response_model=IncidentTemplateOut)
async def get_template_endpoint(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> IncidentTemplateOut:
    template = await get_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return IncidentTemplateOut.model_validate(template)


@router.patch(
    "/{template_id}",
    response_model=IncidentTemplateOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def update_template_endpoint(
    template_id: str,
    payload: IncidentTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IncidentTemplateOut:
    data = payload.model_dump(exclude_unset=True)
    data.pop("created_by", None)
    data.pop("usage_count", None)
    template = await update_template(db, template_id, IncidentTemplateUpdate(**data))
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await safe_record_event(
        db,
        event_type="template.update",
        actor_type="user",
        actor_id=user.id,
        source="backend",
        action="update template",
        target_type="preset",
        target_id=template.id,
        status="success",
        message="Template updated",
        metadata=data,
    )
    return IncidentTemplateOut.model_validate(template)


@router.delete(
    "/{template_id}",
    dependencies=[Depends(require_roles("admin"))],
)
async def delete_template_endpoint(template_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    deleted = await delete_template(db, template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")
    await safe_record_event(
        db,
        event_type="template.delete",
        actor_type="user",
        actor_id="system",
        source="backend",
        action="delete template",
        target_type="preset",
        target_id=template_id,
        status="success",
        message="Template deleted",
        metadata={},
    )
    return {"status": "deleted"}


@router.post(
    "/{template_id}/use",
    response_model=IncidentTemplateOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def use_template_endpoint(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IncidentTemplateOut:
    template = await increment_usage(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await safe_record_event(
        db,
        event_type="template.used",
        actor_type="user",
        actor_id=user.id,
        source="backend",
        action="use template",
        target_type="preset",
        target_id=template.id,
        status="success",
        message="Template used",
        metadata={"name": template.name, "usage_count": template.usage_count},
    )
    return IncidentTemplateOut.model_validate(template)
