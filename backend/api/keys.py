"""Endpoints de gestión de claves SSH por host.

Flujo "instalar clave":
1. Si `generate=true`: se genera ed25519 localmente y se guarda en
   ~/.sshpanel/keys/{host_id}.{key,pub}. La privada queda con chmod 600.
2. La clave pública (generada o pegada) se appendea a
   ~/.ssh/authorized_keys del remoto, creando el dir con permisos correctos
   y evitando duplicados (`grep -qF`).
3. Si se generó: `host.private_key_path` se setea apuntando a la privada local
   → próximas conexiones usan key-auth en vez de password.
"""
import logging
import shlex
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Host
from ..core.ssh import pool
from ..core.keys import (
    generate_ed25519,
    write_keypair,
    delete_keypair,
    read_public_key,
    get_paths,
    fingerprint_sha256,
)
from .hosts import host_to_profile

logger = logging.getLogger("sshpanel.keys")
router = APIRouter(prefix="/hosts/{host_id}/keys", tags=["keys"])


class InstallKeyRequest(BaseModel):
    # Una de las dos: si generate=true se ignora public_key.
    generate: bool = False
    public_key: Optional[str] = None
    comment: str = "sshpanel"


# Script idempotente: setea permisos correctos, no duplica entradas.
# Lee la pública desde stdin (evita line-quoting hell).
_INSTALL_SCRIPT = r"""
set -e
KEY=$(cat)
if [ -z "$KEY" ]; then
    echo "[ERROR] clave pública vacía" >&2
    exit 1
fi
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
if grep -qF "$KEY" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
    echo "[OK] ya estaba instalada"
else
    echo "$KEY" >> "$HOME/.ssh/authorized_keys"
    echo "[OK] instalada"
fi
"""


@router.get("/status")
async def key_status(host_id: str, db: Session = Depends(get_db)):
    """Estado de la clave para este host: si hay una guardada localmente
    y si el host la usa actualmente."""
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")

    priv_path, _ = get_paths(host_id)
    public = read_public_key(host_id)
    return {
        "has_local_key": priv_path.exists(),
        "public_key": public,
        "fingerprint": fingerprint_sha256(public) if public else None,
        "in_use_by_host": bool(host.private_key_path)
        and host.private_key_path == str(priv_path),
    }


@router.post("/install")
async def install_key(
    host_id: str,
    req: InstallKeyRequest,
    db: Session = Depends(get_db),
):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")

    generated = False
    public_key: Optional[str] = None

    if req.generate:
        priv_bytes, public_key = generate_ed25519(req.comment or "sshpanel")
        priv_path, _ = write_keypair(host_id, priv_bytes, public_key)
        generated = True
    else:
        if not req.public_key or not req.public_key.strip():
            raise HTTPException(
                status_code=400,
                detail="Hay que generar una clave o pegar una pública.",
            )
        public_key = req.public_key.strip()
        # Validación mínima: formato OpenSSH (algo tipo `ssh-ed25519 AAAA...`)
        if not any(
            public_key.startswith(prefix)
            for prefix in ("ssh-ed25519", "ssh-rsa", "ssh-dss", "ecdsa-")
        ):
            raise HTTPException(
                status_code=400,
                detail="Formato no reconocido. Esperaba `ssh-ed25519 AAAA... [comentario]`.",
            )

    # Instala en el remoto
    try:
        conn = await pool.get(host_to_profile(host))
        # Pasamos la pública por stdin para evitar issues de escape
        cmd = f"bash -c {shlex.quote(_INSTALL_SCRIPT)}"
        result = await conn._conn.run(cmd, input=public_key + "\n", check=False)
        output = (result.stdout or "") + (result.stderr or "")
        if result.exit_status not in (0, None):
            raise HTTPException(
                status_code=502,
                detail=f"Falló la instalación en el remoto: {output.strip() or 'exit ' + str(result.exit_status)}",
            )
    except HTTPException:
        raise
    except Exception as e:
        # Si veníamos de generar pero no pudimos instalar, dejamos la clave
        # local — el usuario puede reintentar sin regenerar.
        logger.warning(f"install key failed for host {host_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))

    # Si la generamos, asociamos la clave al host para próximas conexiones
    if generated:
        priv_path, _ = get_paths(host_id)
        host.private_key_path = str(priv_path)
        db.commit()
        # Forzamos reconexión la próxima vez (la pooled connection todavía
        # usa password; al cerrarla, la nueva tomará el key)
        try:
            await pool.disconnect(host_id)
        except Exception:
            pass

    return {
        "ok": True,
        "generated": generated,
        "public_key": public_key,
        "fingerprint": fingerprint_sha256(public_key),
        "message": (output or "").strip() if 'output' in locals() else "",
    }


@router.delete("/local")
async def delete_local_key(host_id: str, db: Session = Depends(get_db)):
    """Borra la clave local guardada para este host (no toca el remoto).
    Si el host la estaba usando, queda sin private_key_path."""
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")

    priv_path, _ = get_paths(host_id)
    existed = delete_keypair(host_id)
    if host.private_key_path == str(priv_path):
        host.private_key_path = None
        db.commit()
        try:
            await pool.disconnect(host_id)
        except Exception:
            pass
    return {"ok": True, "deleted": existed}
