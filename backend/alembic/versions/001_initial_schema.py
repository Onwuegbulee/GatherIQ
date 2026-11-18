"""Initial schema migration for GatherIQ

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-11-17 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Churches table
    op.create_table(
        'churches',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('location', sa.String(length=200), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # 2. Users table
    op.create_table(
        'users',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('church_id', sa.Uuid(), nullable=False),
        sa.Column('full_name', sa.String(length=200), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False, server_default='admin'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['church_id'], ['churches.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email', name='uq_users_email'),
    )
    op.create_index('ix_users_church_id', 'users', ['church_id'], unique=False)

    # 3. Church Settings table
    op.create_table(
        'church_settings',
        sa.Column('church_id', sa.Uuid(), nullable=False),
        sa.Column('attendance_target', sa.Integer(), nullable=False, server_default='1300'),
        sa.Column('notify_on_save', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('notify_weekly', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('compact_tables', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['church_id'], ['churches.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('church_id'),
    )

    # 4. Services table
    op.create_table(
        'services',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('church_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['church_id'], ['churches.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('church_id', 'name', name='uq_services_church_name'),
    )
    op.create_index('ix_services_church_id', 'services', ['church_id'], unique=False)

    # 5. Attendance Sessions table
    op.create_table(
        'attendance_sessions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('church_id', sa.Uuid(), nullable=False),
        sa.Column('service_id', sa.Uuid(), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=False),
        sa.Column('service_name_snapshot', sa.String(length=200), nullable=False),
        sa.Column('service_type', sa.String(length=120), nullable=False),
        sa.Column('attendance_date', sa.Date(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('total_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('count_source', sa.String(length=32), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_resumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('accumulated_seconds', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('duration_seconds', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='ready'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['church_id'], ['churches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['service_id'], ['services.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sessions_church_date', 'attendance_sessions', ['church_id', 'attendance_date'], unique=False)
    op.create_index('ix_sessions_church_status', 'attendance_sessions', ['church_id', 'status'], unique=False)
    op.create_index('ix_sessions_church_service', 'attendance_sessions', ['church_id', 'service_id'], unique=False)
    op.create_index('ix_attendance_sessions_created_by', 'attendance_sessions', ['created_by'], unique=False)

    # 6. Refresh Tokens table
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('replaced_by_id', sa.Uuid(), nullable=True),
        sa.Column('remember', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['replaced_by_id'], ['refresh_tokens.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index('ix_refresh_tokens_user_id', 'refresh_tokens', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_table('refresh_tokens')
    op.drop_table('attendance_sessions')
    op.drop_table('services')
    op.drop_table('church_settings')
    op.drop_table('users')
    op.drop_table('churches')
