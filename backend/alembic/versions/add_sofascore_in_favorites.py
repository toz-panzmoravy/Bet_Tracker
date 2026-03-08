"""add sofascore_in_favorites to tickets

Revision ID: add_sofascore_in_favorites
Revises: add_sofascore_match_url
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_sofascore_in_favorites"
down_revision: Union[str, None] = "add_sofascore_match_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("sofascore_in_favorites", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("tickets", "sofascore_in_favorites")
