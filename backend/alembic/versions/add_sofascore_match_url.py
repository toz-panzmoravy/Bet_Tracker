"""add sofascore_match_url to tickets

Revision ID: add_sofascore_match_url
Revises: merge_heads
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_sofascore_match_url"
down_revision: Union[str, None] = "merge_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("sofascore_match_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("tickets", "sofascore_match_url")
