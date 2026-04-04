"""Add mailbox_emails table for non-DMARC emails

Revision ID: 003
Revises: 002
Create Date: 2026-04-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mailbox_emails",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("mailbox_id", sa.Integer, sa.ForeignKey("mailbox_configs.id"), nullable=False),
        sa.Column("message_id", sa.String(512), unique=True, nullable=True),
        sa.Column("from_address", sa.String(512), nullable=True),
        sa.Column("to_address", sa.String(512), nullable=True),
        sa.Column("subject", sa.Text, nullable=True),
        sa.Column("date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("body_text", sa.Text, nullable=True),
        sa.Column("body_html", sa.Text, nullable=True),
        sa.Column("is_read", sa.Boolean, default=False, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_mailbox_emails_mailbox_id", "mailbox_emails", ["mailbox_id"])
    op.create_index("ix_mailbox_emails_date", "mailbox_emails", ["date"])


def downgrade() -> None:
    op.drop_index("ix_mailbox_emails_date")
    op.drop_index("ix_mailbox_emails_mailbox_id")
    op.drop_table("mailbox_emails")
