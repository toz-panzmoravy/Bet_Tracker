"""add parent_id to tickets (AKU subtikety)

Revision ID: add_ticket_parent_id
Revises: add_new_sports
Create Date: 2026-02-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_ticket_parent_id"
down_revision: Union[str, None] = "add_new_sports"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tickets_parent_id",
        "tickets",
        "tickets",
        ["parent_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_tickets_parent_id", "tickets", type_="foreignkey")
    op.drop_column("tickets", "parent_id")
