# Changelog

All notable changes to SSHPanel are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and the project follows
[Semantic Versioning](https://semver.org/).

This file is the source of truth consumed by the in-app update viewer (Fase 6).

## [Unreleased]

_Nothing yet — open a discussion or issue if you have ideas._

## [0.2.1] — 2026-06-10

### Fixed

- **Desktop app could not reach its own backend** — API and WebSocket URLs
  were relative, which inside Tauri resolved against the asset protocol
  (`tauri.localhost`) instead of the Python sidecar; every request got
  `index.html` back ("Unexpected token '<' … is not valid JSON"). The web
  client now detects Tauri and targets `127.0.0.1:8080` explicitly —
  terminals, Docker, system stats, compose, export/import all work in the
  desktop app.
- The macOS updater artifact is now published as `darwin-aarch64`
  (macos-latest runners are Apple Silicon); it was wrongly listed as
  `darwin-x86_64`, which would hand Intel Macs an ARM binary.
- **No more error banner on app start when the update feed is unusable** —
  automatic update checks now fail silently (console only), and a feed
  without binaries for the current platform (unsigned release) is treated
  as "no update available" instead of an error. Manual checks from the
  About panel still surface real errors.
- The release workflow no longer publishes an empty `latest.json` when
  bundles are unsigned — installed apps treat the missing feed gracefully.

## [0.2.0] — 2026-06-10

### Added

- **Test connection** button in the add/edit host modal — verifies SSH
  credentials (10s timeout) and shows the remote `uname` before saving.
  When editing, stored credentials are used as fallback for empty fields.
- **OS-aware keyboard shortcut labels** — the UI now shows `Ctrl+K` on
  Windows/Linux and `⌘K` on macOS (shortcuts always accepted both).
- **Escape closes every modal** — add/edit host, export/import, exec result,
  SSH keys, about panel. Modals running a remote install ignore Escape while
  the operation is in progress.
- Autofocus on the first field when opening the host modal.

### Security

- **Restricted CORS** — the API no longer allows any browser origin (`*`).
  Default whitelist covers the Tauri desktop app, the Vite dev server and
  `localhost:8080`; extra origins via `SSHPANEL_CORS_ORIGINS` env var.
- **Shell-quoting of remote command parameters** — container IDs, image names
  and compose file paths are now escaped before being interpolated into the
  remote shell; compose `extra` flags are validated against a character
  whitelist. Closes a command-injection vector through the API.
- **Passwords no longer travel in query strings** — `/hosts/export` is now a
  POST with a JSON body and `/hosts/import` takes the password as a form
  field (query params end up in access logs and browser history).

### Fixed

- **Release pipeline** — the GitHub Release job failed because
  `download-artifact` also tried to download the `.dockerbuild` build-record
  artifact uploaded by `docker/build-push-action`. Artifacts are now filtered
  with `pattern: desktop-*` and the build record is no longer uploaded.
- Concurrent requests to the same host no longer open duplicate SSH
  connections (per-host lock in the pool).
- `last_connected` is now actually updated when a host connects.

### Changed

- FastAPI startup migrated from the deprecated `@app.on_event` to the
  lifespan API; app version now comes from package metadata (single source).

## [0.1.0] — 2026-06-10

First public release. Everything from Fases 1–6 of the roadmap is included.

### Core

- **SSH connection profiles** with Fernet-encrypted credentials at rest.
- **Interactive terminal** in the browser/desktop app (xterm.js + WebSocket).
  Persistent sessions across tab/host switches.
- **Ctrl+C / Ctrl+V** in terminals — copy on selection, SIGINT on empty
  (matches Windows Terminal behavior over SSH).
- **Command palette** (`⌘K`) — fuzzy navigation, hosts, Docker, arbitrary
  shell exec with stdout/stderr/exit code.

### Docker

- Container management — list, start/stop/restart, live logs streaming.
- **Live container stats** — sparklines of CPU/MEM per container, updated every 2s.
- **Docker Compose panel** — discovery via `docker compose ls`, services view,
  YAML config viewer, and streamed `up`/`down`/`restart`/`pull` actions per stack.
- **Docker install wizard** — if the remote has no Docker, runs `get.docker.com`
  over SSH with live output streaming and sudo detection.

### System monitor (Linux + macOS)

- **System tab** with sparklines for CPU / RAM / swap / disk / network I/O,
  load average, uptime.
- **Process list** htop-style — sort by CPU, filter by user/command, color by threshold.
- **Kill process** action with sudo escalation when the server returns 403.
- **SSH latency** RTT pill in the header + mini-dot in sidebar (emerald < 50ms,
  amber < 200ms, rose more).

### Multi-host

- **Overview dashboard** (`⌘H`) with CPU, MEM, latency, container counts of every
  server in a single grid. Fan-out async with per-host timeout — a downed host
  never blocks the response.
- **Tags + filtering** for hosts in the sidebar (with `#tag` exact-match prefix).

### SSH keys

- **SSH key management** — generate ed25519 or paste a public key; SSHPanel
  installs it in the remote's `authorized_keys` (idempotent, correct permissions)
  and switches the host to key-based auth.

### Config

- **Encrypted export/import** of the full config — move your panel between
  machines with a password-derived key (PBKDF2 + Fernet AES128).

### Clients

- **Web app** served from the FastAPI backend (React 18 + Vite + Tailwind).
- **Desktop app** (Tauri 2 + Rust) with bundled PyInstaller backend sidecar —
  the backend auto-starts when you open the app, no extra setup.
- **System tray** menu (Show / Hide / Autostart with OS / Quit).
- **CLI** (`sshpanel`) with Click + Rich — `dev`, `start/stop/status`, `app`,
  `app-build`, `install/uninstall`.

### Auto-update (Tauri)

- Boot check with 2s debounce + poll every 6h. No-op in browser mode.
- **About panel** with current version + changelog viewer (parses this file).
- **Update banner** with prominent **"Restart to update"** CTA when ready.
- Signed updates via minisign — clients verify each download against the
  embedded public key before applying.

### Infrastructure

- Multi-stage `Dockerfile` builds the frontend inside the image (pnpm pinned).
- `docker-compose.yml` hardened for production: required `SECRET_KEY`,
  healthcheck, persistent volume for SSH keys, configurable port + timezone.
- `scripts/install.sh` interactive installer for the Docker path with optional
  `sshpanel` CLI wrapper in `/usr/local/bin`.
- GitHub Actions: CI on PRs (typecheck + Docker build), multi-OS desktop
  bundles + multi-arch Docker image on tag pushes, automated Releases.
