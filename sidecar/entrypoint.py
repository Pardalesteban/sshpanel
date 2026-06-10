"""Entry point del backend cuando corre como sidecar de Tauri.

Tauri spawn-ea este binario al iniciar y lo mata al cerrar la app.
El backend lee el puerto del env var SSHPANEL_PORT (default 8080).
"""
import os
import sys
import uvicorn


def main():
    port = int(os.environ.get("SSHPANEL_PORT", "8080"))
    # En sidecar mode escuchamos solo en localhost (más seguro)
    host = os.environ.get("SSHPANEL_HOST", "127.0.0.1")
    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
