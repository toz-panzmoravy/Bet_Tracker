"""add live tracking and webhook fields (Ticket + AppSettings)

Revision ID: add_live_webhook
Revises: add_new_sports
Create Date: 2026-02-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_live_webhook"
down_revision: Union[str, None] = "add_ticket_parent_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("live_match_url", sa.String(500), nullable=True))
    op.add_column("tickets", sa.Column("tipsport_match_id", sa.String(50), nullable=True))
    op.add_column("tickets", sa.Column("last_live_at", sa.DateTime(), nullable=True))
    op.add_column("tickets", sa.Column("last_live_snapshot", sa.JSON(), nullable=True))

    op.add_column("app_settings", sa.Column("webhook_url", sa.String(500), nullable=True))
    op.add_column("app_settings", sa.Column("telegram_bot_token", sa.String(200), nullable=True))
    op.add_column("app_settings", sa.Column("telegram_chat_id", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("tickets", "last_live_snapshot")
    op.drop_column("tickets", "last_live_at")
    op.drop_column("tickets", "tipsport_match_id")
    op.drop_column("tickets", "live_match_url")

    op.drop_column("app_settings", "telegram_chat_id")
    op.drop_column("app_settings", "telegram_bot_token")
    op.drop_column("app_settings", "webhook_url")
