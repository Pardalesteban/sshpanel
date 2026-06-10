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

## Cómo sacar una nueva versión

El proceso de release está completamente automatizado por GitHub Actions
(`.github/workflows/release.yml`). Dispara al pushear un tag `v*.*.*`.

### Checklist para una release nueva (ej. v0.2.0)

1. **Bumpear la versión en los 3 archivos** — tienen que coincidir o el updater rompe:
   - `web/package.json` → `"version": "0.2.0"`
   - `web/src-tauri/tauri.conf.json` → `"version": "0.2.0"`
   - `web/src-tauri/Cargo.toml` → `version = "0.2.0"`

2. **Actualizar `CHANGELOG.md`** — agregá una sección al tope con el formato:
   ```markdown
   ## [0.2.0] — YYYY-MM-DD

   ### Added
   - ...
   ### Fixed
   - ...
   ```
   El job `Extract changelog for this version` del workflow busca exactamente
   `## [0.2.0]` con un `awk`. Si no encuentra la sección, el release sale con
   notas auto-generadas por GitHub (peor experiencia).

3. **Commit + tag + push**:
   ```bash
   git add -A
   git commit -m "chore: release v0.2.0"
   git tag -a v0.2.0 -m "SSHPanel v0.2.0"
   git push && git push --tags
   ```

4. **Mirar Actions** (`https://github.com/Pardalesteban/sshpanel/actions`) —
   tarda ~15-25 min en correr todo:
   - 3 jobs `Desktop (ubuntu/macos/windows-latest)` — buildean los bundles
     desktop usando `sshpanel app-build` (PyInstaller sidecar + tauri build).
   - 1 job `Docker image (multi-arch)` — buildea amd64+arm64 y pushea a
     `ghcr.io/pardalesteban/sshpanel`.
   - 1 job final `GitHub Release` — junta todo, arma `latest.json` para el
     updater, crea el GitHub Release con los assets.

5. **Verificar el Release** — `https://github.com/Pardalesteban/sshpanel/releases/tag/v0.2.0`
   debe tener:
   - `.exe`, `.msi`, `.dmg`, `.AppImage`, `.deb` + sus `.sig` correspondientes
   - `latest.json` (el feed que consume el auto-updater de la app instalada)

### Bumpear versión rápido

No hay un script automatizado todavía — si lo hay en el futuro, debería:
- Tomar `sshpanel release X.Y.Z` como input.
- Editar los 3 archivos de versión con regex.
- Abrir el editor en `CHANGELOG.md` para que el user pegue notas.
- Hacer commit + tag + push automáticamente.

### Auto-update (Fase 6) — claves de firma

Para que los clientes instalados puedan recibir updates firmadas:

- La **clave pública** está embebida en `tauri.conf.json` →
  `plugins.updater.pubkey`. **No la cambies sin coordinar** — si la cambiás,
  todos los usuarios con una versión vieja no podrán recibir más updates
  automáticas (van a tener que reinstalar a mano una vez).
- La **clave privada + password** están guardadas como secrets de GitHub:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- También están guardadas localmente en `~/.tauri/sshpanel.key` (privada) y
  `~/.tauri/sshpanel.key.pub` (pública).
- Si la clave se pierde, regenerar con
  `cd web && npx tauri signer generate -w ~/.tauri/sshpanel.key`, pegar la
  nueva pública en `tauri.conf.json` y actualizar los secrets de GitHub.

### Errores conocidos en releases

- **"repository name must be lowercase"** en el job de Docker: el workflow ya
  normaliza `github.repository_owner` a lowercase. Si vuelve a aparecer, es
  que se rompió el step `Compute lowercase image name`.
- **`Artifact download failed after 5 retries`** en el job final: bug
  transient del runner de GitHub. Solución: borrar el tag, recrearlo,
  re-pushear. Pasa raro y se arregla solo al reintentar.
- **`ERR_UNKNOWN_BUILTIN_MODULE` con corepack**: el `Dockerfile` evita
  corepack instalando pnpm con `npm install -g pnpm@10.33.4`. Si actualizás
  pnpm, sincronizá el `packageManager` del `package.json` y el comando del
  Dockerfile.

### Hotfix release (versión patch)

Mismo proceso pero el tag es `vX.Y.(Z+1)`. La sección del CHANGELOG suele
tener sólo `### Fixed`.
