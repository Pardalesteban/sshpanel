"""API del agente IA (Claude Code integrado).

  GET  /agent/status            → ¿instalado? ¿de dónde? ¿logueado?
  WS   /agent/install           → corre el instalador oficial y streamea su salida
  WS   /hosts/{id}/agent/       → Claude Code real en un PTY local, scopeado al host

El blindaje (no puede tocar el código de la app) lo dan el scratch dir + el
settings.json gestionado (ver backend/agent/guardrails.py). Acá solo se orquesta.
"""
import asyncio
import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Host
from ..agent import runtime
from ..agent.guardrails import write_managed_settings
from ..agent.pty_bridge import PtyProcess

logger = logging.getLogger("sshpanel.agent")
router = APIRouter(tags=["agent"])


@router.get("/agent/status")
def agent_status():
    return runtime.status()


@router.websocket("/agent/install")
async def agent_install(websocket: WebSocket):
    """Instala Claude Code (si no está ya) y streamea el progreso como texto."""
    await websocket.accept()
    try:
        async for chunk in runtime.install_stream():
            await websocket.send_text(chunk)
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


@router.websocket("/hosts/{host_id}/agent/")
async def agent_terminal(host_id: str, websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()

    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        await websocket.send_text("[ERROR] Host no encontrado\r\n")
        await websocket.close()
        return

    binpath = runtime.resolve_claude_bin()
    if binpath is None:
        await websocket.send_text(
            "[ERROR] Claude Code no está instalado. Usá el botón 'Descargar Claude Code'.\r\n"
        )
        await websocket.close()
        return

    # Prepara el sandbox: scratch dir aislado + settings.json con los guardrails.
    scratch = write_managed_settings(host_id)
    logger.info(f"agent: lanzando claude para host_id={host_id} en {scratch}")

    pty = None
    output_task = None
    try:
        pty = await PtyProcess.spawn(
            runtime.launch_argv(binpath),
            cwd=str(scratch),
            cols=120,
            rows=32,
        )

        async def forward_output():
            try:
                while True:
                    data = await pty.read()
                    if data is None:
                        break
                    await websocket.send_text(data)
            except Exception:
                pass
            finally:
                try:
                    await websocket.send_text("\r\n[Sesión del agente finalizada]\r\n")
                except Exception:
                    pass

        output_task = asyncio.create_task(forward_output())

        while True:
            data = await websocket.receive_text()
            # Mensajes de control (resize) vienen como JSON — mismo protocolo que terminal.py
            if data.startswith("{") and '"type"' in data:
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "resize":
                        pty.resize(int(msg.get("cols", 120)), int(msg.get("rows", 32)))
                        continue
                except (json.JSONDecodeError, ValueError):
                    pass
            pty.write(data)

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
        if pty:
            pty.close()
        try:
            await websocket.close()
        except Exception:
            pass
