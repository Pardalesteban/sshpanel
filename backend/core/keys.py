"""Gestión de claves SSH locales.

Las claves generadas se guardan en ~/.sshpanel/keys/{host_id}.key (privada)
y .pub (pública). La privada tiene permisos 0600 (asyncssh la rechaza si no).

Diseño escalable: una clave por host_id, pero el path es opaco para el resto
del sistema — podemos cambiar a multi-key por host en el futuro extendiendo
KEYS_DIR / get_paths sin tocar nada más.
"""
from pathlib import Path
from typing import Optional
import os
import hashlib
import base64

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

KEYS_DIR = Path.home() / ".sshpanel" / "keys"


def _ensure_dir() -> Path:
    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(KEYS_DIR, 0o700)
    except OSError:
        pass  # Windows
    return KEYS_DIR


def get_paths(host_id: str) -> tuple[Path, Path]:
    """Devuelve (private_path, public_path) para un host."""
    base = _ensure_dir() / host_id
    return base.with_suffix(".key"), base.with_suffix(".pub")


def generate_ed25519(comment: str = "sshpanel") -> tuple[bytes, str]:
    """Genera un par ed25519 y devuelve (private_pem_openssh, public_openssh).
    El formato OpenSSH es lo que aceptan sshd y asyncssh sin conversión.
    """
    priv = ed25519.Ed25519PrivateKey.generate()
    priv_bytes = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_bytes = priv.public_key().public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH,
    )
    pub_str = pub_bytes.decode("utf-8").strip() + f" {comment}"
    return priv_bytes, pub_str


def write_keypair(host_id: str, priv_bytes: bytes, pub_str: str) -> tuple[Path, Path]:
    """Escribe par de claves con permisos correctos. Retorna paths absolutos."""
    priv_path, pub_path = get_paths(host_id)
    # Atómico: escribir y luego chmod (en orden seguro)
    priv_path.write_bytes(priv_bytes)
    pub_path.write_text(pub_str + "\n", encoding="utf-8")
    try:
        os.chmod(priv_path, 0o600)
        os.chmod(pub_path, 0o644)
    except OSError:
        pass  # Windows ignora chmod POSIX
    return priv_path, pub_path


def delete_keypair(host_id: str) -> bool:
    """Borra el par. Devuelve True si existía."""
    priv_path, pub_path = get_paths(host_id)
    existed = priv_path.exists()
    priv_path.unlink(missing_ok=True)
    pub_path.unlink(missing_ok=True)
    return existed


def read_public_key(host_id: str) -> Optional[str]:
    _, pub_path = get_paths(host_id)
    if pub_path.exists():
        return pub_path.read_text(encoding="utf-8").strip()
    return None


def fingerprint_sha256(public_openssh: str) -> str:
    """Calcula el fingerprint SHA256 estilo OpenSSH (`SHA256:base64...`)."""
    parts = public_openssh.strip().split()
    if len(parts) < 2:
        return ""
    try:
        raw = base64.b64decode(parts[1])
    except Exception:
        return ""
    digest = hashlib.sha256(raw).digest()
    b64 = base64.b64encode(digest).decode("ascii").rstrip("=")
    return f"SHA256:{b64}"
