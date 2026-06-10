import asyncio
import logging
import shlex
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Host
from ..core.ssh import pool
from ..core.system import SystemMonitor
from .hosts import host_to_profile, host_sudo_password

logger = logging.getLogger("sshpanel.system")
router = APIRouter(prefix="/hosts/{host_id}/system", tags=["system"])


async def _get_monitor(host_id: str, db: Session) -> SystemMonitor:
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")
    conn = await pool.get(host_to_profile(host))
    return SystemMonitor(conn)


@router.get("/snapshot")
async def system_snapshot(host_id: str, db: Session = Depends(get_db)):
    """Devuelve un snapshot puntual del sistema remoto."""
    monitor = await _get_monitor(host_id, db)
    try:
        snap = await monitor.snapshot()
        return snap.to_dict()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class KillRequest(BaseModel):
    pid: int
    signal: str = "TERM"  # TERM | KILL | HUP | INT
    sudo: bool = False


_ALLOWED_SIGNALS = {"TERM", "KILL", "HUP", "INT", "QUIT"}


@router.post("/kill")
async def kill_process(host_id: str, req: KillRequest, db: Session = Depends(get_db)):
    """Mata un proceso remoto via `kill -SIG PID`. Si sudo=true, intenta con sudo
    usando la contraseña guardada del host (sudo_password o fallback al password SSH).
    """
    if req.signal not in _ALLOWED_SIGNALS:
        raise HTTPException(status_code=400, detail=f"Signal no permitido: {req.signal}")
    if req.pid <= 1:
        raise HTTPException(status_code=400, detail="PID inválido")

    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")
    conn = await pool.get(host_to_profile(host))

    cmd = f"kill -{req.signal} {req.pid}"
    if req.sudo:
        pwd = host_sudo_password(host)
        if pwd:
            # echo PWD | sudo -S kill ...  — el -S lee password de stdin
            cmd = f"echo {shlex.quote(pwd)} | sudo -S -p '' {cmd}"
        else:
            cmd = f"sudo -n {cmd}"

    try:
        await conn.run(cmd)
        return {"ok": True, "pid": req.pid, "signal": req.signal, "sudo": req.sudo}
    except RuntimeError as e:
        msg = str(e).lower()
        if not req.sudo and ("not permitted" in msg or "permission denied" in msg):
            raise HTTPException(
                status_code=403,
                detail="No tenés permiso para matar ese proceso. Reintentá con sudo.",
            )
        if "no such process" in msg:
            raise HTTPException(status_code=404, detail=f"PID {req.pid} no existe")
        raise HTTPException(status_code=502, detail=str(e))


@router.websocket("/stream")
async def system_stream(host_id: str, websocket: WebSocket, db: Session = Depends(get_db)):
    """Streamea un snapshot cada 2 segundos por WebSocket."""
    await websocket.accept()
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        await websocket.close()
        return

    try:
        conn = await pool.get(host_to_profile(host))
        monitor = SystemMonitor(conn)
        # Primera lectura para inicializar el delta de CPU
        try:
            await monitor.snapshot()
        except Exception:
            pass

        while True:
            try:
                snap = await monitor.snapshot()
                await websocket.send_json(snap.to_dict())
            except Exception as e:
                logger.warning(f"system stream error: {e}")
                await websocket.send_json({"error": str(e)})
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"system websocket cerrado: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
