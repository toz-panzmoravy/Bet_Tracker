"""add new sports (Florbal, Darts, Rugby, Handball, Lacros, Baseball, NFL)

Revision ID: add_new_sports
Revises: add_app_settings_bankroll
Create Date: 2026-02-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "add_new_sports"
down_revision: Union[str, None] = "add_app_settings_bankroll"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_SPORTS = [
    ("Florbal", "🏑"),
    ("Darts", "🎯"),
    ("Rugby", "🏉"),
    ("Handball", "🤾"),
    ("Lacros", "🥍"),
    ("Baseball", "⚾"),
    ("NFL", "🏈"),
]


def upgrade() -> None:
    conn = op.get_bind()
    for name, icon in NEW_SPORTS:
        if conn.dialect.name == "postgresql":
            conn.execute(
                text(
                    "INSERT INTO sports (name, icon) VALUES (:name, :icon) "
                    "ON CONFLICT (name) DO NOTHING"
                ),
                {"name": name, "icon": icon},
            )
        else:
            conn.execute(
                text("INSERT OR IGNORE INTO sports (name, icon) VALUES (:name, :icon)"),
                {"name": name, "icon": icon},
            )


def downgrade() -> None:
    conn = op.get_bind()
    for name, _ in NEW_SPORTS:
        conn.execute(text("DELETE FROM sports WHERE name = :name"), {"name": name})
