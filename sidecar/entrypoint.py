"""Entry point del backend cuando corre como sidecar de Tauri.

Tauri spawn-ea este binario al iniciar y lo mata al cerrar la app.
El backend lee el puerto del env var SSHPANEL_PORT (default 8080).

IMPORTANTE: el import de `backend.main` tiene que ser directo (no el string
"backend.main:app" de uvicorn) — PyInstaller solo bundlea lo que puede ver
en el grafo de imports estático. Con el string, el .exe compilaba pero moría
al arrancar con ModuleNotFoundError: No module named 'backend'.
"""
import os
import sys


def _run_server():
    import uvicorn
    from backend.main import app

    port = int(os.environ.get("SSHPANEL_PORT", "8080"))
    # En sidecar mode escuchamos solo en localhost (más seguro)
    host = os.environ.get("SSHPANEL_HOST", "127.0.0.1")
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
    )


def _run_mcp(argv):
    """Subcomando `mcp --host-id <id>`: arranca el MCP server del agente.

    Claude Code lo invoca con este binario (ver backend/agent/guardrails.py).
    El host-id se propaga por env, que es lo que lee el MCP server.
    """
    if "--host-id" in argv:
        i = argv.index("--host-id")
        if i + 1 < len(argv):
            os.environ["SSHPANEL_AGENT_HOST_ID"] = argv[i + 1]
    from backend.agent import mcp_server

    mcp_server.main()


def _run_classify():
    """Subcomando `classify`: hook PreToolUse que clasifica comandos remotos."""
    from backend.agent import classify_command

    classify_command.main()


def main():
    # Dispatch por primer argumento — así el MISMO binario sidecar sirve para
    # el server, el MCP del agente y el hook clasificador (PyInstaller los bundlea
    # a todos via --collect-submodules backend).
    cmd = sys.argv[1] if len(sys.argv) > 1 else "server"
    if cmd == "mcp":
        _run_mcp(sys.argv[2:])
    elif cmd == "classify":
        _run_classify()
    else:
        _run_server()


if __name__ == "__main__":
    main()
