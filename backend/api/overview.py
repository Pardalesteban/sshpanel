"""Vista multi-host: snapshot consolidado en paralelo.

Diseño escalable:
- Una sola request HTTP del cliente → fan-out async sobre todos los hosts.
- Timeout por host (configurable) — un host caído nunca bloquea la respuesta.
- Cada item es self-contained con campo `error` opcional → el frontend renderiza
  fallos por card sin romper la grid.
- Para agregar métricas en el futuro: extender `summarize_host()`; nada más
  cambia en el frontend salvo el componente de card.
"""
import asyncio
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Host
from ..core.ssh import pool
from ..core.system import SystemMonitor
from ..core.docker import DockerManager
from .hosts import host_to_profile

logger = logging.getLogger("sshpanel.overview")
router = APIRouter(prefix="/overview", tags=["overview"])

# Timeout por host — si una conexión tarda más, se omite ese host y se devuelve error.
PER_HOST_TIMEOUT_S = 5.0


async def summarize_host(host: Host) -> dict:
    """Devuelve un snapshot consolidado de un host: sistema + docker.
    Si algo falla, devuelve `{error: ...}` en el campo correspondiente
    sin tirar la respuesta entera abajo.
    """
    base = {
        "host_id": host.id,
        "name": host.name,
        "host": host.host,
        "username": host.username,
        "connected": False,
        "error": None,
        "os": None,
        "cpu_percent": 0.0,
        "mem_used_bytes": 0,
        "mem_total_bytes": 0,
        "mem_percent": 0.0,
        "load_avg": [0.0, 0.0, 0.0],
        "uptime_seconds": 0,
        "latency_ms": 0.0,
        "docker_available": False,
        "containers_running": 0,
        "containers_total": 0,
    }
    try:
        conn = await pool.get(host_to_profile(host))
        base["connected"] = True

        # Sistema + docker en paralelo dentro del timeout total.
        monitor = SystemMonitor(conn)
        dm = DockerManager(conn)

        async def _system():
            snap = await monitor.snapshot()
            base["os"] = snap.os
            base["cpu_percent"] = snap.cpu_percent
            base["mem_used_bytes"] = snap.mem_used_bytes
            base["mem_total_bytes"] = snap.mem_total_bytes
            base["mem_percent"] = (
                (snap.mem_used_bytes / snap.mem_total_bytes * 100)
                if snap.mem_total_bytes
                else 0.0
            )
            base["load_avg"] = list(snap.load_avg)
            base["uptime_seconds"] = snap.uptime_seconds
            base["latency_ms"] = snap.latency_ms

        async def _docker():
            try:
                running = await dm.list_containers(all=False)
                total = await dm.list_containers(all=True)
                base["docker_available"] = True
                base["containers_running"] = len(running)
                base["containers_total"] = len(total)
            except Exception:
                # Docker no instalado o daemon caído — no es error fatal del host.
                base["docker_available"] = False

        # Ejecuta ambos sin que un fallo de uno tire el otro.
        await asyncio.gather(_system(), _docker(), return_exceptions=False)
    except asyncio.TimeoutError:
        base["error"] = "timeout"
    except Exception as e:
        base["error"] = str(e)
    return base


async def _summarize_with_timeout(host: Host) -> dict:
    try:
        return await asyncio.wait_for(summarize_host(host), timeout=PER_HOST_TIMEOUT_S)
    except asyncio.TimeoutError:
        return {
            "host_id": host.id,
            "name": host.name,
            "host": host.host,
            "username": host.username,
            "connected": False,
            "error": f"timeout > {PER_HOST_TIMEOUT_S:.0f}s",
        }
    except Exception as e:
        logger.warning(f"overview: host {host.id} falló: {e}")
        return {
            "host_id": host.id,
            "name": host.name,
            "host": host.host,
            "username": host.username,
            "connected": False,
            "error": str(e),
        }


@router.get("/")
async def overview(db: Session = Depends(get_db)):
    """Snapshot agregado de todos los hosts. Fan-out paralelo con timeout
    por host — la respuesta llega tan rápido como el host más lento (acotado)."""
    hosts = db.query(Host).all()
    if not hosts:
        return {"hosts": []}
    results = await asyncio.gather(*[_summarize_with_timeout(h) for h in hosts])
    return {"hosts": results}
