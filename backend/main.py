from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .db.database import init_db
from .api.hosts import router as hosts_router
from .api.docker_api import router as docker_router
from .api.terminal import router as terminal_router
from .api.system import router as system_router
from .api.overview import router as overview_router
from .api.keys import router as keys_router
from .api.compose import router as compose_router

app = FastAPI(title="SSHPanel", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

# Sirve la web app desde el mismo servidor
web_dist = Path(__file__).parent.parent / "web" / "dist"
if web_dist.exists():
    app.mount("/", StaticFiles(directory=str(web_dist), html=True), name="web")


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}
