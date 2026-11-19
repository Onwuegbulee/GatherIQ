"""Add superadmin fields, church status and activity logs

Revision ID: 002_super_admin_portal
Revises: 001_initial_schema
Create Date: 2026-11-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '002_super_admin_portal'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use batch_alter_table for SQLite compatibility
    with op.batch_alter_table('churches') as batch_op:
        batch_op.add_column(sa.Column('email', sa.String(length=320), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('phone', sa.String(length=64), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'))

    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('church_id', existing_type=sa.Uuid(), nullable=True)
        batch_op.add_column(sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default='0'))

    # Activity logs table
    op.create_table(
        'activity_logs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.Column('user_email', sa.String(length=320), nullable=False, server_default=''),
        sa.Column('church_id', sa.Uuid(), nullable=True),
        sa.Column('action', sa.String(length=120), nullable=False),
        sa.Column('target_type', sa.String(length=64), nullable=False, server_default=''),
        sa.Column('target_id', sa.String(length=120), nullable=False, server_default=''),
        sa.Column('details', sa.Text(), nullable=False, server_default=''),
        sa.Column('ip_address', sa.String(length=64), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['church_id'], ['churches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('activity_logs')
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('must_change_password')
        batch_op.alter_column('church_id', existing_type=sa.Uuid(), nullable=False)

    with op.batch_alter_table('churches') as batch_op:
        batch_op.drop_column('is_active')
        batch_op.drop_column('phone')
        batch_op.drop_column('email')
