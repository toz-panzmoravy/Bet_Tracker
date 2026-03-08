"""merge multiple heads (add_bookmaker_ticket_url + add_ai_analysis_status)

Revision ID: merge_heads
Revises: add_bookmaker_ticket_url, add_ai_analysis_status
Create Date: 2026-03-06

"""
from typing import Sequence, Union

from alembic import op


revision: str = "merge_heads"
down_revision: Union[str, None] = ("add_bookmaker_ticket_url", "add_ai_analysis_status")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
