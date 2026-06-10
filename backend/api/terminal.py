import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Host
from ..core.ssh import pool
from .hosts import host_to_profile

logger = logging.getLogger("sshpanel.terminal")
router = APIRouter(prefix="/hosts/{host_id}/terminal", tags=["terminal"])


@router.websocket("/")
async def terminal(host_id: str, websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        logger.warning(f"terminal: host_id={host_id} no encontrado")
        await websocket.send_text("[ERROR] Host no encontrado\r\n")
        await websocket.close()
        return
    logger.info(f"terminal: abriendo shell para host_id={host_id} name={host.name} host={host.host}")

    process = None
    output_task = None
    try:
        conn = await pool.get(host_to_profile(host))
        process = await conn.open_shell()

        async def forward_output():
            try:
                while True:
                    data = await process.stdout.read(4096)
                    if not data:
                        break
                    await websocket.send_text(data)
            except Exception:
                pass

        output_task = asyncio.create_task(forward_output())

        while True:
            data = await websocket.receive_text()
            # Mensajes de control vienen como JSON con clave "type"
            if data.startswith("{") and '"type"' in data:
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "resize":
                        cols = int(msg.get("cols", 120))
                        rows = int(msg.get("rows", 32))
                        process.change_terminal_size(cols, rows)
                        continue
                except (json.JSONDecodeError, ValueError, Exception):
                    pass  # si falla, lo tratamos como input normal
            process.stdin.write(data)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(f"\r\n[ERROR] {e}\r\n")
        except Exception:
            pass
    finally:
        if output_task:
            output_task.cancel()
        if process:
            try:
                process.close()
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
