"""Encriptación de payloads para export/import portable entre instancias."""
import json
import gzip
import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes


def _derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))


def encrypt_payload(payload: dict, password: str) -> bytes:
    """Cifra cualquier dict y devuelve un archivo descargable."""
    salt = os.urandom(16)
    key = _derive_key(password, salt)
    raw = json.dumps(payload).encode()
    compressed = gzip.compress(raw)
    encrypted = Fernet(key).encrypt(compressed)
    wrapper = {
        "version": 1,
        "salt": base64.b64encode(salt).decode(),
        "data": base64.b64encode(encrypted).decode(),
    }
    return json.dumps(wrapper).encode()


def decrypt_payload(file_bytes: bytes, password: str) -> dict:
    """Descifra un archivo exportado y devuelve el dict original."""
    wrapper = json.loads(file_bytes)
    if wrapper.get("version") != 1:
        raise ValueError("Versión de archivo no soportada")
    salt = base64.b64decode(wrapper["salt"])
    encrypted = base64.b64decode(wrapper["data"])
    key = _derive_key(password, salt)
    compressed = Fernet(key).decrypt(encrypted)
    return json.loads(gzip.decompress(compressed))
