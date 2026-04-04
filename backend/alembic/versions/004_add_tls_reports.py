"""Add tls_reports table for SMTP TLS-RPT (RFC 8460) reports

Revision ID: 004
Revises: 003
Create Date: 2026-04-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tls_reports",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("mailbox_id", sa.Integer, sa.ForeignKey("mailbox_configs.id"), nullable=False),
        sa.Column("report_id_str", sa.String(512), unique=True, nullable=False),
        sa.Column("org_name", sa.String(255), nullable=True),
        sa.Column("contact_info", sa.String(512), nullable=True),
        sa.Column("date_range_begin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_range_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("policy_type", sa.String(50), nullable=True),
        sa.Column("policy_domain", sa.String(255), nullable=True),
        sa.Column("policy_strings", sa.JSON, nullable=True),
        sa.Column("mx_host", sa.String(255), nullable=True),
        sa.Column("total_success", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("total_failure", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("failure_details_json", sa.JSON, nullable=True),
        sa.Column("email_subject", sa.Text, nullable=True),
        sa.Column("email_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tls_reports_policy_domain", "tls_reports", ["policy_domain"])
    op.create_index("ix_tls_reports_mailbox_id", "tls_reports", ["mailbox_id"])
    op.create_index("ix_tls_reports_date_range_end", "tls_reports", ["date_range_end"])


def downgrade() -> None:
    op.drop_index("ix_tls_reports_date_range_end")
    op.drop_index("ix_tls_reports_mailbox_id")
    op.drop_index("ix_tls_reports_policy_domain")
    op.drop_table("tls_reports")
