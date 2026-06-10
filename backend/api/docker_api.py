import asyncio
import logging
import shlex
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session

logger = logging.getLogger("sshpanel.docker")

from ..db.database import get_db
from ..db.models import Host
from ..core.ssh import pool
from ..core.docker import DockerManager
from .hosts import host_to_profile, host_sudo_password

router = APIRouter(prefix="/hosts/{host_id}/docker", tags=["docker"])


def _is_docker_missing(error: str) -> bool:
    """Match estricto de patrones reales de 'docker no está instalado'."""
    e = error.lower()
    return any(
        p in e
        for p in [
            "docker: command not found",
            "command not found: docker",
            "docker: not found",
        ]
    )


async def _docker_actually_missing(conn) -> bool:
    """Busca docker en todas las ubicaciones posibles — fuente de verdad."""
    path = await conn.find_binary("docker")
    return path is None


async def get_docker_manager(host_id: str, db: Session) -> DockerManager:
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")
    conn = await pool.get(host_to_profile(host))
    return DockerManager(conn)


@router.get("/containers")
async def list_containers(host_id: str, all: bool = False, db: Session = Depends(get_db)):
    dm = await get_docker_manager(host_id, db)
    try:
        return await dm.list_containers(all=all)
    except Exception as e:
        msg = str(e)
        logger.warning(f"docker ps falló en host_id={host_id}: {msg!r}")
        # Si el error sugiere "no instalado", verificamos con command -v
        # antes de decidir — evita false positives con errores del daemon.
        if _is_docker_missing(msg):
            really_missing = await _docker_actually_missing(dm.conn)
            logger.info(
                f"  _is_docker_missing=True, _docker_actually_missing={really_missing}"
            )
            if really_missing:
                raise HTTPException(status_code=418, detail=msg)
        raise HTTPException(status_code=502, detail=msg)


@router.post("/containers/{container_id}/start")
async def start(host_id: str, container_id: str, db: Session = Depends(get_db)):
    dm = await get_docker_manager(host_id, db)
    return {"output": await dm.start(container_id)}


@router.post("/containers/{container_id}/stop")
async def stop(host_id: str, container_id: str, db: Session = Depends(get_db)):
    dm = await get_docker_manager(host_id, db)
    return {"output": await dm.stop(container_id)}


@router.post("/containers/{container_id}/restart")
async def restart(host_id: str, container_id: str, db: Session = Depends(get_db)):
    dm = await get_docker_manager(host_id, db)
    return {"output": await dm.restart(container_id)}


@router.get("/containers/{container_id}/stats")
async def stats(host_id: str, container_id: str, db: Session = Depends(get_db)):
    dm = await get_docker_manager(host_id, db)
    return await dm.stats(container_id)


@router.get("/images")
async def list_images(host_id: str, db: Session = Depends(get_db)):
    dm = await get_docker_manager(host_id, db)
    return await dm.list_images()


@router.websocket("/stats/stream")
async def stream_stats(host_id: str, websocket: WebSocket, db: Session = Depends(get_db)):
    """Stream de docker stats por host — cada 2s envía la lista de containers
    con campos numéricos parseados. Si docker no está corriendo, envía error."""
    await websocket.accept()
    try:
        dm = await get_docker_manager(host_id, db)
        while True:
            try:
                stats = await dm.stats_parsed()
                await websocket.send_json({"timestamp": asyncio.get_event_loop().time(), "containers": stats})
            except Exception as e:
                logger.warning(f"docker stats stream error: {e}")
                await websocket.send_json({"error": str(e)})
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"docker stats websocket cerrado: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@router.websocket("/containers/{container_id}/logs")
async def stream_logs(host_id: str, container_id: str, websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    try:
        dm = await get_docker_manager(host_id, db)
        async for line in dm.stream_logs(container_id):
            await websocket.send_text(line)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_text(f"[ERROR] {e}")
        await websocket.close()


# --- Install Docker (script oficial) ---

INSTALL_SCRIPT = r"""
set -e

# Primera línea de stdin = sudo password (puede estar vacía si NOPASSWD)
read -r SUDO_PWD || true

echo '[1/5] Detectando sistema...'
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "    OS: $NAME $VERSION_ID"
fi

if command -v docker >/dev/null 2>&1; then
    echo '[!] Docker ya está instalado.'
    docker --version
    exit 0
fi

echo '[2/5] Validando sudo...'
if sudo -n true 2>/dev/null; then
    echo '    sudo sin password — usando NOPASSWD'
    SUDO='sudo'
elif [ -n "$SUDO_PWD" ]; then
    if echo "$SUDO_PWD" | sudo -S -v 2>/dev/null; then
        echo '    contraseña sudo validada'
        SUDO='sudo'
        unset SUDO_PWD
    else
        echo '[ERROR] Contraseña sudo incorrecta.'
        exit 1
    fi
else
    echo '[ERROR] El usuario necesita contraseña sudo y no se proveyó.'
    exit 1
fi

echo '[3/5] Descargando script oficial (get.docker.com)...'
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh

echo '[4/5] Ejecutando instalador (puede tardar 1-3 minutos)...'
$SUDO sh /tmp/get-docker.sh

echo '[5/5] Agregando usuario al grupo docker...'
$SUDO usermod -aG docker "$USER" || true
rm -f /tmp/get-docker.sh

echo ''
echo 'OK Docker instalado correctamente.'
docker --version
echo ''
echo 'IMPORTANTE: cerrá la conexión SSH y reconectá para que tome el grupo docker.'
"""


@router.websocket("/install")
async def install_docker(
    host_id: str, websocket: WebSocket, db: Session = Depends(get_db)
):
    import asyncssh as _asyncssh

    await websocket.accept()
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        await websocket.send_text("[ERROR] Host no encontrado\r\n")
        await websocket.close()
        return

    try:
        conn = await pool.get(host_to_profile(host))
        sudo_pwd = host_sudo_password(host)
        # Ejecutamos el script con bash -lc para login shell completo.
        # shlex.quote escapa para shell (preserva newlines y comillas reales).
        cmd = f"bash -lc {shlex.quote(INSTALL_SCRIPT)}"
        # stderr=STDOUT para que veas errores en el log inline
        async with conn._conn.create_process(
            cmd, stderr=_asyncssh.STDOUT
        ) as process:
            # Primera línea de stdin = sudo password (la lee `read SUDO_PWD`)
            process.stdin.write(f"{sudo_pwd}\n")
            async for line in process.stdout:
                await websocket.send_text(line)
            exit_code = process.exit_status
            if exit_code == 0:
                # Limpia el cache de paths para re-detectar docker
                conn._binary_paths.pop("docker", None)
                await websocket.send_text("\r\n[DONE]\r\n")
            else:
                await websocket.send_text(
                    f"\r\n[ERROR] La instalación falló (exit {exit_code}).\r\n"
                    f"Mirá el output arriba para ver qué pasó. Causas comunes:\r\n"
                    f"  - sudo requiere password (en SSH no-interactivo no podemos tipearla)\r\n"
                    f"  - no hay conexión a get.docker.com desde el server\r\n"
                    f"  - el SO no es soportado por el script oficial\r\n"
                )
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
