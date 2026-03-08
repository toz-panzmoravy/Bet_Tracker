"""import order + newly imported mark

Revision ID: add_import_order_and_new_mark
Revises: merge_heads
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_import_order_and_new_mark"
down_revision: Union[str, None] = "merge_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("import_batch_id", sa.String(64), nullable=True))
    op.add_column("tickets", sa.Column("import_batch_index", sa.Integer(), nullable=True))
    op.add_column("tickets", sa.Column("is_newly_imported", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("tickets", "is_newly_imported")
    op.drop_column("tickets", "import_batch_index")
    op.drop_column("tickets", "import_batch_id")
