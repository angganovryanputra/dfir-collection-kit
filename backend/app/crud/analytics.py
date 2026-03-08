from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics import AttackChain, IOCIndicator, IOCMatch, YaraMatch


# ── Attack Chain ──────────────────────────────────────────────────────────────


async def list_attack_chains(
    db: AsyncSession, incident_id: str
) -> list[AttackChain]:
    result = await db.execute(
        select(AttackChain)
        .where(AttackChain.incident_id == incident_id)
        .order_by(AttackChain.window_start.nullslast())
    )
    return list(result.scalars().all())


# ── IOC Indicators ────────────────────────────────────────────────────────────


async def create_ioc_indicator(
    db: AsyncSession,
    ioc_type: str,
    value: str,
    description: str | None,
    source: str | None,
    severity: str,
    created_by: str,
) -> IOCIndicator:
    ind = IOCIndicator(
        id=str(uuid.uuid4()),
        ioc_type=ioc_type.lower(),
        value=value.lower(),
        description=description,
        source=source,
        severity=severity,
        created_by=created_by,
    )
    db.add(ind)
    await db.flush()
    return ind


async def list_ioc_indicators(
    db: AsyncSession,
    ioc_type: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[IOCIndicator], int]:
    stmt = select(IOCIndicator)
    count_stmt = select(func.count()).select_from(IOCIndicator)
    if ioc_type:
        stmt = stmt.where(IOCIndicator.ioc_type == ioc_type.lower())
        count_stmt = count_stmt.where(IOCIndicator.ioc_type == ioc_type.lower())
    stmt = stmt.order_by(IOCIndicator.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    count_result = await db.execute(count_stmt)
    return list(result.scalars().all()), int(count_result.scalar() or 0)


async def delete_ioc_indicator(db: AsyncSession, indicator_id: str) -> bool:
    from sqlalchemy import delete

    result = await db.execute(
        delete(IOCIndicator).where(IOCIndicator.id == indicator_id)
    )
    await db.flush()
    return result.rowcount > 0


# ── IOC Matches ───────────────────────────────────────────────────────────────


async def list_ioc_matches(
    db: AsyncSession,
    incident_id: str,
    ioc_type: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[IOCMatch], int]:
    stmt = select(IOCMatch).where(IOCMatch.incident_id == incident_id)
    count_stmt = select(func.count()).select_from(IOCMatch).where(
        IOCMatch.incident_id == incident_id
    )
    if ioc_type:
        stmt = stmt.where(IOCMatch.ioc_type == ioc_type.lower())
        count_stmt = count_stmt.where(IOCMatch.ioc_type == ioc_type.lower())
    stmt = stmt.order_by(IOCMatch.detected_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    count_result = await db.execute(count_stmt)
    return list(result.scalars().all()), int(count_result.scalar() or 0)


# ── YARA Matches ──────────────────────────────────────────────────────────────


async def list_yara_matches(
    db: AsyncSession,
    incident_id: str,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[YaraMatch], int]:
    stmt = (
        select(YaraMatch)
        .where(YaraMatch.incident_id == incident_id)
        .order_by(YaraMatch.detected_at.desc())
        .limit(limit)
        .offset(offset)
    )
    count_stmt = select(func.count()).select_from(YaraMatch).where(
        YaraMatch.incident_id == incident_id
    )
    result = await db.execute(stmt)
    count_result = await db.execute(count_stmt)
    return list(result.scalars().all()), int(count_result.scalar() or 0)
