import os
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version as pkg_version
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db.database import init_db
from .api.hosts import router as hosts_router
from .api.docker_api import router as docker_router
from .api.terminal import router as terminal_router
from .api.system import router as system_router
from .api.overview import router as overview_router
from .api.keys import router as keys_router
from .api.compose import router as compose_router

try:
    VERSION = pkg_version("sshpanel")
except PackageNotFoundError:
    # Corriendo sin instalar el paquete (ej. imagen Docker con solo requirements)
    VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="SSHPanel", version=VERSION, lifespan=lifespan)

# La web se sirve same-origin (no necesita CORS). Esta lista cubre el desktop
# (Tauri) y el dev server de Vite. Un "*" acá sería gravísimo: la API no tiene
# auth, así que cualquier página web podría leer hosts y ejecutar comandos.
_DEFAULT_ORIGINS = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
# SSHPANEL_CORS_ORIGINS agrega orígenes extra (coma-separados) a los defaults,
# p. ej. si servís el panel detrás de un dominio propio.
_env_origins = os.getenv("SSHPANEL_CORS_ORIGINS", "")
allow_origins = _DEFAULT_ORIGINS + [
    o.strip() for o in _env_origins.split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hosts_router, prefix="/api")
app.include_router(docker_router, prefix="/api")
app.include_router(terminal_router, prefix="/api")
app.include_router(system_router, prefix="/api")
app.include_router(overview_router, prefix="/api")
app.include_router(keys_router, prefix="/api")
app.include_router(compose_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "version": VERSION}


# Sirve la web app desde el mismo servidor. Montado al final para que /api
# tenga prioridad sobre el catch-all de estáticos.
web_dist = Path(__file__).parent.parent / "web" / "dist"
if web_dist.exists():
    app.mount("/", StaticFiles(directory=str(web_dist), html=True), name="web")
