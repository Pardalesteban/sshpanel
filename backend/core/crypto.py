import os
import base64
from pathlib import Path
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

KEY_FILE = Path.home() / ".sshpanel" / ".secret_key"
SALT = b"sshpanel-static-salt-v1"  # ok: la entropy viene del SECRET_KEY


def _load_or_create_secret() -> str:
    env = os.getenv("SECRET_KEY")
    if env:
        return env
    KEY_FILE.parent.mkdir(exist_ok=True)
    if KEY_FILE.exists():
        return KEY_FILE.read_text().strip()
    # Generar uno nuevo si no se proveyó
    secret = base64.urlsafe_b64encode(os.urandom(32)).decode()
    KEY_FILE.write_text(secret)
    try:
        os.chmod(KEY_FILE, 0o600)
    except OSError:
        pass  # Windows no soporta chmod igual
    return secret


def _get_fernet() -> Fernet:
    secret = _load_or_create_secret()
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=SALT,
        iterations=200000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(secret.encode()))
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    return _get_fernet().decrypt(ciphertext.encode()).decode()
