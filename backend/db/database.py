from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from pathlib import Path

DB_DIR = Path("/app/data") if Path("/app/data").exists() else Path.home() / ".sshpanel"
DB_DIR.mkdir(exist_ok=True)
DATABASE_URL = f"sqlite:///{DB_DIR}/sshpanel.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations():
    """Migraciones manuales para SQLite (no soporta ALTER bien con SQLAlchemy)."""
    insp = inspect(engine)
    existing_cols = {c["name"] for c in insp.get_columns("hosts")}
    migrations = [
        ("sudo_password_encrypted", "ALTER TABLE hosts ADD COLUMN sudo_password_encrypted TEXT"),
    ]
    with engine.begin() as conn:
        for col, sql in migrations:
            if col not in existing_cols:
                conn.execute(text(sql))
