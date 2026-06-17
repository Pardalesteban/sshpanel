"""Servidor MCP de SSHPanel — el ÚNICO canal por el que Claude Code puede actuar.

Claude no recibe Bash/Write/Edit locales (ver `guardrails.py`); su única forma de
"hacer cosas" son estas tools, que están **scopeadas a un host fijo** (el del env
`SSHPANEL_AGENT_HOST_ID`) y que delegan en el REST local de SSHPanel — reutilizando
el SSHPool y toda la lógica ya existente (exec, docker, system). Cero credenciales
SSH acá: solo HTTP a 127.0.0.1.

Se ejecuta por stdio, lanzado por Claude Code según la config en el settings.json
gestionado. En producción el binario sidecar lo arranca con `sshpanel-backend mcp
--host-id <id>` (ver sidecar/entrypoint.py).
"""
import os
import sys

import httpx

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:  # pragma: no cover
    sys.stderr.write(
        "El paquete 'mcp' no está instalado. Instalá las deps del backend "
        "(pip install -e .) para usar el agente.\n"
    )
    raise

HOST_ID = os.environ.get("SSHPANEL_AGENT_HOST_ID", "").strip()
API_BASE = os.environ.get("SSHPANEL_API", "http://127.0.0.1:8080").rstrip("/") + "/api"

mcp = FastMCP("sshpanel")


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=API_BASE, timeout=120)


def _require_host() -> str:
    if not HOST_ID:
        raise RuntimeError(
            "SSHPANEL_AGENT_HOST_ID no está seteado — el MCP server no sabe sobre "
            "qué host operar."
        )
    return HOST_ID


@mcp.tool()
async def run_command(command: str) -> dict:
    """Ejecuta un comando de shell en el host SSH remoto y devuelve stdout,
    stderr y exit code. Es el canal principal para operar en el servidor.

    Los comandos destructivos (rm, dd, mkfs, shutdown, systemctl, docker rm,
    redirecciones, etc.) requieren confirmación del usuario antes de correr.
    """
    host = _require_host()
    async with _client() as c:
        r = await c.post(f"/hosts/{host}/exec", json={"command": command})
        r.raise_for_status()
        return r.json()


@mcp.tool()
async def docker_ps(all: bool = False) -> list:
    """Lista los contenedores Docker del host. all=True incluye los detenidos."""
    host = _require_host()
    async with _client() as c:
        r = await c.get(f"/hosts/{host}/docker/containers", params={"all": all})
        r.raise_for_status()
        return r.json()


@mcp.tool()
async def docker_action(container: str, action: str) -> dict:
    """Inicia, detiene o reinicia un contenedor. action ∈ {start, stop, restart}.
    Requiere confirmación del usuario.
    """
    host = _require_host()
    if action not in ("start", "stop", "restart"):
        raise ValueError("action debe ser start, stop o restart")
    async with _client() as c:
        r = await c.post(f"/hosts/{host}/docker/containers/{container}/{action}")
        r.raise_for_status()
        return r.json()


@mcp.tool()
async def system_snapshot() -> dict:
    """Snapshot del sistema remoto: CPU, memoria, disco, red, uptime, top procesos."""
    host = _require_host()
    async with _client() as c:
        r = await c.get(f"/hosts/{host}/system/snapshot")
        r.raise_for_status()
        return r.json()


def main():
    mcp.run()


if __name__ == "__main__":
    main()
