from sqlalchemy import text

def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("users"):
        cols = {c["name"] for c in inspector.get_columns("users")}

        # Важно: NOT NULL требует дефолт, иначе упадёт на существующих строках
        if "status" not in cols:
            op.add_column(
                "users",
                sa.Column("status", sa.String(length=20), nullable=False, server_default="online"),
            )
            # (Опционально) убрать server_default после backfill
            op.alter_column("users", "status", server_default=None)

        if "is_2fa_enabled" not in cols:
            op.add_column(
                "users",
                sa.Column("is_2fa_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            )
            op.alter_column("users", "is_2fa_enabled", server_default=None)

        # Аналогично можно добавить custom_status, totp_secret, bio и т.д., если нужно
        return

    # иначе — чистая БД: создаём всё как было
    op.create_table(...)
