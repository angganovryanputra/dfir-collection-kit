from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.template import create_template, delete_template, get_template, list_templates, update_template
from app.models.user import User
from app.schemas.template import IncidentTemplateCreate, IncidentTemplateOut, IncidentTemplateUpdate

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
    payload: IncidentTemplateCreate, db: AsyncSession = Depends(get_db)
) -> IncidentTemplateOut:
    template = await create_template(db, payload)
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
    template_id: str, payload: IncidentTemplateUpdate, db: AsyncSession = Depends(get_db)
) -> IncidentTemplateOut:
    template = await update_template(db, template_id, payload)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return IncidentTemplateOut.model_validate(template)


@router.delete(
    "/{template_id}",
    dependencies=[Depends(require_roles("admin"))],
)
async def delete_template_endpoint(template_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    deleted = await delete_template(db, template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "deleted"}
