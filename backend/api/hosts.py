import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from ..db.database import get_db
from ..db.models import Host
from ..core.config import encrypt_payload, decrypt_payload
from ..core.crypto import encrypt, decrypt
from ..core.ssh import SSHProfile, pool

router = APIRouter(prefix="/hosts", tags=["hosts"])


class HostCreate(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str = "root"
    password: Optional[str] = None
    sudo_password: Optional[str] = None
    private_key_path: Optional[str] = None
    tags: str = ""


class HostUpdate(BaseModel):
    """Update parcial — campos None = no tocar, '' (string vacío) = limpiar.
    Para passwords: None = no tocar, '' = limpiar, valor = re-cifrar."""
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    sudo_password: Optional[str] = None
    private_key_path: Optional[str] = None
    tags: Optional[str] = None


class HostOut(BaseModel):
    id: str
    name: str
    host: str
    port: int
    username: str
    tags: str
    connected: bool = False

    class Config:
        from_attributes = True


@router.get("/", response_model=list[HostOut])
def list_hosts(db: Session = Depends(get_db)):
    hosts = db.query(Host).all()
    status = pool.status()
    result = []
    for h in hosts:
        out = HostOut.model_validate(h)
        out.connected = status.get(h.id, False)
        result.append(out)
    return result


@router.post("/", response_model=HostOut)
def create_host(data: HostCreate, db: Session = Depends(get_db)):
    host = Host(
        id=str(uuid.uuid4()),
        **data.model_dump(exclude={"password", "sudo_password"}),
    )
    if data.password:
        host.password_encrypted = encrypt(data.password)
    if data.sudo_password:
        host.sudo_password_encrypted = encrypt(data.sudo_password)
    db.add(host)
    db.commit()
    db.refresh(host)
    return host


@router.put("/{host_id}", response_model=HostOut)
async def update_host(host_id: str, data: HostUpdate, db: Session = Depends(get_db)):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")

    payload = data.model_dump(exclude_unset=True)
    for field in ("name", "host", "port", "username", "private_key_path", "tags"):
        if field in payload and payload[field] is not None:
            setattr(host, field, payload[field])

    # Para passwords: None = no tocar, "" = limpiar, valor = cifrar
    if "password" in payload:
        host.password_encrypted = encrypt(payload["password"]) if payload["password"] else None
    if "sudo_password" in payload:
        host.sudo_password_encrypted = encrypt(payload["sudo_password"]) if payload["sudo_password"] else None

    db.commit()
    db.refresh(host)

    # Si la conexión está abierta, hay que cerrarla para que tome los cambios
    await pool.disconnect(host_id)

    out = HostOut.model_validate(host)
    out.connected = False
    return out


@router.delete("/{host_id}")
async def delete_host(host_id: str, db: Session = Depends(get_db)):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")
    await pool.disconnect(host_id)
    db.delete(host)
    db.commit()
    return {"ok": True}


def host_to_profile(host: Host) -> SSHProfile:
    """Construye un SSHProfile descifrando la password."""
    return SSHProfile(
        id=host.id,
        name=host.name,
        host=host.host,
        port=host.port,
        username=host.username,
        password=decrypt(host.password_encrypted) if host.password_encrypted else None,
        private_key_path=host.private_key_path,
    )


def host_sudo_password(host: Host) -> str:
    """Devuelve la sudo password del host. Si no hay, usa la SSH password."""
    if host.sudo_password_encrypted:
        return decrypt(host.sudo_password_encrypted)
    if host.password_encrypted:
        return decrypt(host.password_encrypted)
    return ""


@router.post("/{host_id}/connect")
async def connect_host(host_id: str, db: Session = Depends(get_db)):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")
    try:
        await pool.get(host_to_profile(host))
        host.last_connected = datetime.now(timezone.utc)
        db.commit()
        return {"ok": True, "connected": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{host_id}/disconnect")
async def disconnect_host(host_id: str, db: Session = Depends(get_db)):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")
    await pool.disconnect(host_id)
    return {"ok": True, "connected": False}


class ExecRequest(BaseModel):
    command: str


@router.post("/{host_id}/exec")
async def exec_command(
    host_id: str, data: ExecRequest, db: Session = Depends(get_db)
):
    """Ejecuta un comando puntual y devuelve su output. No mantiene shell."""
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")
    try:
        conn = await pool.get(host_to_profile(host))
        result = await conn.run_result(data.command)
        return {
            "command": data.command,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_status or 0,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Export / Import ---

class ExportRequest(BaseModel):
    password: str


@router.post("/export")
def export(req: ExportRequest, db: Session = Depends(get_db)):
    """Exporta todos los hosts (con passwords descifradas + recifradas con la
    contraseña del usuario) para que el archivo sea portable entre instancias.
    POST con body JSON — la password nunca viaja en el query string (los query
    params quedan en access logs, historial y proxies)."""
    password = req.password
    hosts = db.query(Host).all()
    payload = {
        "hosts": [
            {
                "id": h.id,
                "name": h.name,
                "host": h.host,
                "port": h.port,
                "username": h.username,
                "password": decrypt(h.password_encrypted) if h.password_encrypted else None,
                "sudo_password": decrypt(h.sudo_password_encrypted) if h.sudo_password_encrypted else None,
                "private_key_path": h.private_key_path,
                "tags": h.tags or "",
            }
            for h in hosts
        ]
    }
    data = encrypt_payload(payload, password)
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=sshpanel-config.enc"},
    )


@router.post("/import")
async def import_cfg(
    password: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Importa hosts desde un archivo cifrado. Hace upsert por id.
    La password viene como form field (no query string) por el mismo motivo
    que en /export."""
    contents = await file.read()
    try:
        config = decrypt_payload(contents, password)
    except Exception:
        raise HTTPException(status_code=400, detail="Archivo inválido o contraseña incorrecta")

    imported = 0
    updated = 0
    for h in config.get("hosts", []):
        existing = db.query(Host).filter(Host.id == h["id"]).first()
        password_enc = encrypt(h["password"]) if h.get("password") else None
        sudo_enc = encrypt(h["sudo_password"]) if h.get("sudo_password") else None

        if existing:
            existing.name = h["name"]
            existing.host = h["host"]
            existing.port = h.get("port", 22)
            existing.username = h.get("username", "root")
            if password_enc is not None:
                existing.password_encrypted = password_enc
            if sudo_enc is not None:
                existing.sudo_password_encrypted = sudo_enc
            existing.private_key_path = h.get("private_key_path")
            existing.tags = h.get("tags", "")
            updated += 1
        else:
            host = Host(
                id=h["id"],
                name=h["name"],
                host=h["host"],
                port=h.get("port", 22),
                username=h.get("username", "root"),
                password_encrypted=password_enc,
                sudo_password_encrypted=sudo_enc,
                private_key_path=h.get("private_key_path"),
                tags=h.get("tags", ""),
            )
            db.add(host)
            imported += 1

    db.commit()
    return {"ok": True, "hosts_imported": imported, "hosts_updated": updated}
