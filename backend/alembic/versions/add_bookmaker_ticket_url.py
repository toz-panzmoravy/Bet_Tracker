"""add bookmaker_ticket_url to tickets (link to ticket at bookmaker)

Revision ID: add_bookmaker_ticket_url
Revises: add_market_type_normalized_name
Create Date: 2026-03-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_bookmaker_ticket_url"
down_revision: Union[str, None] = "add_market_type_normalized_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("bookmaker_ticket_url", sa.String(1000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tickets", "bookmaker_ticket_url")
