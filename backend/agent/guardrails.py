"""Escribe el settings.json gestionado que blinda a Claude Code.

Garantía central (requisito del usuario): **el agente no puede tocar el código de
SSHPanel.** Se logra por construcción, no por confianza:

  - `cwd` del proceso = un scratch dir por host, fuera del repo (ver runtime.py).
  - `permissions.deny` quita Write/Edit/Bash/etc. locales → no hay herramienta para
    escribir archivos ni correr nada en la máquina local. `deny` siempre gana.
  - La única capacidad de acción es el MCP server `sshpanel`, scopeado al host.
  - Un hook PreToolUse clasifica los comandos remotos y fuerza confirmación en los
    destructivos.
"""
import json
import sys
from pathlib import Path

from .runtime import scratch_for

# repo root = .../sshpanel (backend/agent/guardrails.py -> parents[2])
REPO_ROOT = Path(__file__).resolve().parents[2]
_MCP_SCRIPT = Path(__file__).resolve().parent / "mcp_server.py"
_HOOK_SCRIPT = Path(__file__).resolve().parent / "classify_command.py"


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _launchers(host_id: str) -> tuple[dict, str]:
    """Devuelve (config del mcpServer, comando del hook) según el entorno.

    - Frozen (sidecar PyInstaller): se usa el propio binario con subcomandos
      `mcp` / `classify` (ver sidecar/entrypoint.py).
    - Dev: se ejecutan los scripts por ruta absoluta con el intérprete actual
      (son standalone: no importan el paquete `backend`, así que el cwd/PYTHONPATH
      no importan).
    """
    exe = sys.executable
    if _is_frozen():
        mcp_server = {
            "command": exe,
            "args": ["mcp", "--host-id", host_id],
        }
        hook_cmd = f'"{exe}" classify'
    else:
        mcp_server = {
            "command": exe,
            "args": [str(_MCP_SCRIPT)],
        }
        hook_cmd = f'"{exe}" "{_HOOK_SCRIPT}"'
    return mcp_server, hook_cmd


def write_managed_settings(host_id: str, api_base: str = "http://127.0.0.1:8080") -> Path:
    """Escribe `<scratch>/.claude/settings.json` y devuelve el scratch dir.

    Claude Code se lanza con cwd = scratch dir, así que toma este settings como
    el de proyecto.
    """
    scratch = scratch_for(host_id)
    claude_dir = scratch / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)

    mcp_server, hook_cmd = _launchers(host_id)
    mcp_server["env"] = {
        "SSHPANEL_AGENT_HOST_ID": host_id,
        "SSHPANEL_API": api_base,
    }

    settings = {
        "permissions": {
            # deny SIEMPRE gana → el agente no tiene cómo tocar archivos ni correr
            # nada en la máquina local. Solo actúa vía el MCP sshpanel (remoto).
            "deny": [
                "Write",
                "Edit",
                "MultiEdit",
                "NotebookEdit",
                "Bash",
                "WebFetch",
                "WebSearch",
            ],
            # Lecturas remotas inocuas: sin fricción.
            "allow": [
                "mcp__sshpanel__docker_ps",
                "mcp__sshpanel__system_snapshot",
            ],
            # Acciones que mutan estado: confirmación explícita.
            "ask": [
                "mcp__sshpanel__docker_action",
            ],
        },
        "enableAllProjectMcpServers": True,
        "mcpServers": {
            "sshpanel": mcp_server,
        },
        # run_command no tiene regla estática: el hook decide allow/ask según
        # si el comando es destructivo.
        "hooks": {
            "PreToolUse": [
                {
                    "matcher": "mcp__sshpanel__run_command",
                    "hooks": [{"type": "command", "command": hook_cmd}],
                }
            ]
        },
    }

    settings_path = claude_dir / "settings.json"
    settings_path.write_text(json.dumps(settings, indent=2), encoding="utf-8")

    # También dejamos un .mcp.json por si la versión de Claude prefiere ese archivo
    # para descubrir MCP servers de proyecto.
    mcp_json = {"mcpServers": {"sshpanel": mcp_server}}
    (scratch / ".mcp.json").write_text(json.dumps(mcp_json, indent=2), encoding="utf-8")

    return scratch
