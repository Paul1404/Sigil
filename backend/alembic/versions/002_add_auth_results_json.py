"""Add JSON columns for multiple DKIM/SPF auth results per RFC 7489

Revision ID: 002
Revises: 001
Create Date: 2026-04-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("dmarc_records", sa.Column("dkim_results_json", JSON, nullable=True))
    op.add_column("dmarc_records", sa.Column("spf_results_json", JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("dmarc_records", "spf_results_json")
    op.drop_column("dmarc_records", "dkim_results_json")
