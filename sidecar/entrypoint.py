"""Entry point del backend cuando corre como sidecar de Tauri.

Tauri spawn-ea este binario al iniciar y lo mata al cerrar la app.
El backend lee el puerto del env var SSHPANEL_PORT (default 8080).

IMPORTANTE: el import de `backend.main` tiene que ser directo (no el string
"backend.main:app" de uvicorn) — PyInstaller solo bundlea lo que puede ver
en el grafo de imports estático. Con el string, el .exe compilaba pero moría
al arrancar con ModuleNotFoundError: No module named 'backend'.
"""
import os

import uvicorn

from backend.main import app


def main():
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


if __name__ == "__main__":
    main()
