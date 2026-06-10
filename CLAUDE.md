# SSHPanel

Open-source alternative to Terminus. Lets you manage SSH connections and Docker containers across multiple servers from a single app — available as web, desktop, and CLI.

## What this project is

A self-hosted dashboard for:
- Saving and reusing SSH connection profiles (no re-entering credentials)
- Viewing and managing Docker containers on remote hosts
- Streaming Docker logs in real time
- Running interactive SSH terminals from the browser or desktop app
- Exporting/importing config as an encrypted file (portable across devices)

The user that started this project wants it fully open source, self-hosted via Docker, and accessible via three interfaces: web browser, desktop app (Tauri), and CLI.

## Architecture

```
backend/        FastAPI — core SSH logic, Docker API, REST + WebSocket endpoints
  core/
    ssh.py      SSHProfile dataclass, SSHConnection (asyncssh), SSHPool (persistent connections)
    docker.py   DockerManager — wraps docker CLI commands over SSH
    config.py   Local config file + export/import with PBKDF2+Fernet encryption
  api/
    hosts.py    CRUD for SSH hosts, /export and /import endpoints
    docker_api.py  Docker endpoints + WebSocket log streaming
    terminal.py WebSocket SSH terminal
  db/
    database.py SQLite via SQLAlchemy (file in /app/data or ~/.sshpanel)
    models.py   Host model

cli/main.py     Click + Rich CLI — talks to the backend API
web/            React + Vite + Tailwind frontend
  src/lib/      api.ts (typed fetch wrapper), utils.ts (cn, gradient identicons)
  src/components/  Sidebar, HostDetail, AddHostModal, EmptyState, HostAvatar
  tailwind.config.js  Design tokens (Geist, bg/border/text/brand colors)
desktop/        Tauri desktop app (not yet scaffolded)
pyproject.toml  Installs "sshpanel" as a global CLI command
```

## Key design decisions

- **Single backend** serves all three clients (web/desktop/CLI)
- **SQLite** — no external database needed, data lives in a Docker volume
- **asyncssh** for all SSH operations — async, no subprocess overhead
- **Persistent SSH pool** — connections stay alive while the server is running
- **Config export/import**: PBKDF2HMAC (480k iterations) + Fernet AES128 + gzip, serialized as JSON with version field. Password never stored or transmitted with the file.
- **No user accounts needed** for self-hosted single-user mode
- Tags on hosts are stored as CSV string for simplicity

## Installation (one time)

```bash
pip install -e .
# Registers "sshpanel" as a global command
```

## Running

```bash
# Desarrollo — auto-reload al guardar cualquier .py
sshpanel dev

# Producción — background daemon
sshpanel start
sshpanel stop
sshpanel status

# Iniciar con el sistema operativo (Windows/macOS/Linux)
sshpanel install
sshpanel uninstall
```

## Auto-start behavior

- Any CLI command that needs the server (hosts list, docker ps, etc.) calls `_ensure_server()` which starts the backend automatically if not running.
- PID file at `~/.sshpanel/server.pid`
- `sshpanel dev` uses `subprocess.run` to launch uvicorn --reload (Ctrl+C stops it cleanly)
- `sshpanel start` spawns uvicorn detached with `start_new_session=True`

## Running via Docker

```bash
docker-compose up
# App available at http://localhost:8080
```

## Roadmap

Full roadmap lives in `roadmap.md`. **Keep it updated as work progresses.**

Rules:
- When a task is completed, mark it `[x]` in `roadmap.md`.
- When starting a new task, add it to the appropriate phase if it isn't already there.
- Never leave `roadmap.md` out of sync with the actual state of the project.

Current focus: **Fase 4 con la pieza grande lista** — tab Sistema funcionando (sparklines CPU/RAM/network, discos con bar de progreso por threshold, process list filtrable, latencia con pill + dot en sidebar). El SystemPanel persiste samples al cambiar de tab/host (mismo patrón que terminales). Next: docker stats por container, multi-host view, kill process.

## Design system

Defined directly in `web/tailwind.config.js` + `web/src/index.css`. Key tokens:
- Font: **Geist** (sans + mono) — display, body, UI, code
- Background gradient: subtle violet/cyan radial on dark charcoal `#0c0d10`
- Brand accents (each domain has its color):
  - `violet` (#8b5cf6) primary brand + actions
  - `cyan` (#22d3ee) Docker / containers
  - `emerald` (#10b981) running / connected
  - `amber` (#f59e0b) warnings
  - `rose` (#f43f5e) errors / stopped
  - `indigo` (#6366f1) SSH / network
  - `pink` (#ec4899) decorative pairs with violet
- Host avatars: deterministic 2-color gradient identicons (`hashGradient` in utils.ts)
- Generous radius (sm:6 md:10 lg:14 xl:20) for refined feel
- Glow shadows on hover for primary CTAs (`shadow-glow`)
- Glass effect utility (`.glass`) for modals + command palette

**Rule:** every new screen must use these tokens — never hardcode colors or fonts.
