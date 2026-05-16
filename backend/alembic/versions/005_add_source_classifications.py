"""Add source_classifications table

Lets users mark senders as trusted (legitimate, must align), unauthorized
(known spoofing source, expected to fail), or ignored (misdetected domain
or otherwise excluded from health metrics).

Revision ID: 005
Revises: 004
Create Date: 2026-05-16 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "source_classifications",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("policy_domain", sa.String(255), nullable=False),
        sa.Column("match_type", sa.String(20), nullable=False),
        sa.Column("match_value", sa.String(255), nullable=False),
        sa.Column("classification", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
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
        sa.UniqueConstraint(
            "policy_domain", "match_type", "match_value",
            name="uq_classification_target",
        ),
    )
    op.create_index(
        "ix_source_classifications_policy_domain",
        "source_classifications",
        ["policy_domain"],
    )


def downgrade() -> None:
    op.drop_index("ix_source_classifications_policy_domain")
    op.drop_table("source_classifications")
