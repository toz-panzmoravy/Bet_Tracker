"""add status and error_message to ai_analyses

Revision ID: add_ai_analysis_status
Revises: add_app_settings_bankroll
Create Date: 2026-03-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_ai_analysis_status"
down_revision: Union[str, None] = "add_app_settings_bankroll"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_analyses",
        sa.Column("status", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "ai_analyses",
        sa.Column("error_message", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ai_analyses", "error_message")
    op.drop_column("ai_analyses", "status")

