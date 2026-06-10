from sqlalchemy import Column, String, Integer, Boolean, DateTime
from sqlalchemy.sql import func
from .database import Base


class Host(Base):
    __tablename__ = "hosts"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, default=22)
    username = Column(String, default="root")
    password_encrypted = Column(String, nullable=True)
    sudo_password_encrypted = Column(String, nullable=True)  # opcional, fallback a password
    private_key_path = Column(String, nullable=True)
    tags = Column(String, default="")        # CSV: "prod,docker,vpn"
    created_at = Column(DateTime, server_default=func.now())
    last_connected = Column(DateTime, nullable=True)
