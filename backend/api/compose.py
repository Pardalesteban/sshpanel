"""Docker Compose v2: descubrimiento + acciones sobre proyectos existentes.

Diseño escalable: la primitiva es {project_name, config_files}. Toda acción
del frontend incluye estos dos campos y el backend los pasa al CLI con
`docker compose -p NAME -f FILE1 -f FILE2 <action>`. Agregar nuevas acciones
(pull, scale, restart un solo servicio) = agregar un valor más al enum.
"""
import logging
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from .docker_api import get_docker_manager

logger = logging.getLogger("sshpanel.compose")
router = APIRouter(prefix="/hosts/{host_id}/compose", tags=["compose"])


# Acciones permitidas — whitelist explícita para evitar inyección por el path.
_ALLOWED_ACTIONS = {"up", "down", "restart", "pull", "stop", "start"}
# `extra` va al shell remoto: solo flags/valores simples, nada de ; | & $ ` etc.
_EXTRA_TOKEN_RE = re.compile(r"^[A-Za-z0-9@:.,_=/-]+$")


def _sanitize_extra(extra: str) -> str:
    tokens = extra.split()
    if not all(_EXTRA_TOKEN_RE.match(t) for t in tokens):
        raise ValueError(f"flags extra inválidos: {extra!r}")
    return " ".join(tokens)
# Algunas se benefician de detach para no quedarse colgadas
_DETACH_FOR = {"up", "start", "restart"}


class ComposeActionBody(BaseModel):
    files: list[str]
    extra: Optional[str] = None  # flags adicionales (ej. "--no-deps")


@router.get("/projects")
async def list_projects(host_id: str, db: Session = Depends(get_db)):
    """Proyectos compose conocidos por el daemon (running + parados)."""
    dm = await get_docker_manager(host_id, db)
    try:
        return await dm.compose_ls(all=True)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/projects/{name}/services")
async def project_services(
    host_id: str,
    name: str,
    files: str = "",
    db: Session = Depends(get_db),
):
    """Servicios de un proyecto. `files` = paths separados por `|`."""
    dm = await get_docker_manager(host_id, db)
    file_list = [f for f in files.split("|") if f]
    try:
        return await dm.compose_ps(name, file_list)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/projects/{name}/config")
async def project_config(
    host_id: str,
    name: str,
    files: str = "",
    db: Session = Depends(get_db),
):
    """YAML resuelto del proyecto (post interpolación + merge)."""
    dm = await get_docker_manager(host_id, db)
    file_list = [f for f in files.split("|") if f]
    try:
        yaml = await dm.compose_config(name, file_list)
        return {"yaml": yaml}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.websocket("/projects/{name}/action/{action}")
async def stream_action(
    host_id: str,
    name: str,
    action: str,
    websocket: WebSocket,
    db: Session = Depends(get_db),
):
    """Ejecuta una acción y streamea stdout+stderr.

    El cliente envía un primer JSON `{files: ["path1", ...], extra?: "..."}`
    apenas se abre la conexión. Lo hacemos así (en vez de query string) para
    no pelearnos con paths largos / espaciados en el URL.
    """
    await websocket.accept()

    if action not in _ALLOWED_ACTIONS:
        await websocket.send_text(f"[ERROR] acción no permitida: {action}\r\n")
        await websocket.close()
        return

    try:
        init = await websocket.receive_json()
    except Exception:
        await websocket.send_text("[ERROR] se esperaba JSON con {files: [...]}\r\n")
        await websocket.close()
        return

    files = list(init.get("files") or [])
    try:
        extra = _sanitize_extra((init.get("extra") or "").strip())
    except ValueError as e:
        await websocket.send_text(f"[ERROR] {e}\r\n")
        await websocket.close()
        return
    if action in _DETACH_FOR and "-d" not in extra and "--detach" not in extra:
        extra = (extra + " -d").strip()

    try:
        dm = await get_docker_manager(host_id, db)
        await websocket.send_text(
            f"[+] docker compose -p {name} {action} {extra}\r\n\r\n"
        )
        async for line in dm.compose_action_stream(name, files, action, extra=extra):
            await websocket.send_text(line)
        await websocket.send_text("\r\n[DONE]\r\n")
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(f"\r\n[ERROR] {e}\r\n")
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
