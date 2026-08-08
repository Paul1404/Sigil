"""Expand mailbox email header columns

Revision ID: 006
Revises: 005
Create Date: 2026-08-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for column_name in ("message_id", "from_address", "to_address"):
        op.alter_column(
            "mailbox_emails",
            column_name,
            existing_type=sa.String(length=512),
            type_=sa.Text(),
            existing_nullable=True,
        )


def downgrade() -> None:
    for column_name in ("message_id", "from_address", "to_address"):
        op.alter_column(
            "mailbox_emails",
            column_name,
            existing_type=sa.Text(),
            type_=sa.String(length=512),
            existing_nullable=True,
        )
