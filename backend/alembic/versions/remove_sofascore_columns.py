"""remove sofascore columns from tickets

Revision ID: remove_sofascore_columns
Revises: add_sofascore_in_favorites
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "remove_sofascore_columns"
down_revision: Union[str, None] = "add_sofascore_in_favorites"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("tickets", "sofascore_in_favorites")
    op.drop_column("tickets", "sofascore_match_url")


def downgrade() -> None:
    op.add_column("tickets", sa.Column("sofascore_match_url", sa.String(500), nullable=True))
    op.add_column("tickets", sa.Column("sofascore_in_favorites", sa.Boolean(), nullable=False, server_default=sa.false()))
