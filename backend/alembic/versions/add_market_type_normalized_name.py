"""add normalized_name to market_types for canonical bet type names

Revision ID: add_market_type_normalized_name
Revises: add_live_webhook
Create Date: 2026-03-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# pylint: disable=import-error,no-member
from app.utils.market_type_normalization import normalize_market_label


revision: str = "add_market_type_normalized_name"
down_revision: Union[str, None] = "add_live_webhook"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "market_types",
        sa.Column("normalized_name", sa.String(length=120), nullable=True),
    )
    op.create_index(
        "ix_market_types_normalized_name",
        "market_types",
        ["normalized_name"],
        unique=False,
    )

    # Naplnit normalized_name pro existující záznamy pomocí stejné logiky,
    # kterou používá runtime kódu.
    bind = op.get_bind()
    metadata = sa.MetaData()
    market_types = sa.Table(
        "market_types",
        metadata,
        sa.Column("id", sa.Integer),
        sa.Column("name", sa.String(100)),
        sa.Column("normalized_name", sa.String(120)),
    )

    rows = list(bind.execute(sa.select(market_types.c.id, market_types.c.name)))
    for mt_id, name in rows:
        canon = normalize_market_label(name or "")
        bind.execute(
            market_types.update()
            .where(market_types.c.id == mt_id)
            .values(normalized_name=canon)
        )


def downgrade() -> None:
    op.drop_index("ix_market_types_normalized_name", table_name="market_types")
    op.drop_column("market_types", "normalized_name")

