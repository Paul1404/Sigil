"""Initial migration

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mailbox_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("imap_host", sa.String(255), nullable=False),
        sa.Column("imap_port", sa.Integer(), nullable=False, server_default="993"),
        sa.Column("username", sa.String(255), nullable=False),
        sa.Column("encrypted_password", sa.Text(), nullable=False),
        sa.Column(
            "folder", sa.String(255), nullable=False, server_default="INBOX"
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "dmarc_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "mailbox_id",
            sa.Integer(),
            sa.ForeignKey("mailbox_configs.id"),
            nullable=False,
        ),
        sa.Column("org_name", sa.String(255), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("report_id_str", sa.String(255), unique=True, nullable=False),
        sa.Column("domain", sa.String(255), nullable=False, index=True),
        sa.Column("date_range_begin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_range_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("policy_domain", sa.String(255), nullable=True),
        sa.Column("policy_adkim", sa.String(10), nullable=True),
        sa.Column("policy_aspf", sa.String(10), nullable=True),
        sa.Column("policy_p", sa.String(20), nullable=True),
        sa.Column("policy_sp", sa.String(20), nullable=True),
        sa.Column("policy_pct", sa.Integer(), nullable=True),
        sa.Column("email_subject", sa.Text(), nullable=True),
        sa.Column("email_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "dmarc_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "report_id",
            sa.Integer(),
            sa.ForeignKey("dmarc_reports.id"),
            nullable=False,
        ),
        sa.Column("source_ip", sa.String(45), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("disposition", sa.String(20), nullable=True),
        sa.Column("dkim_domain", sa.String(255), nullable=True),
        sa.Column("dkim_result", sa.String(20), nullable=True),
        sa.Column("dkim_alignment", sa.String(20), nullable=True),
        sa.Column("spf_domain", sa.String(255), nullable=True),
        sa.Column("spf_result", sa.String(20), nullable=True),
        sa.Column("spf_alignment", sa.String(20), nullable=True),
        sa.Column("envelope_from", sa.String(255), nullable=True),
        sa.Column("header_from", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("dmarc_records")
    op.drop_table("dmarc_reports")
    op.drop_table("mailbox_configs")
