# Changelog

All notable changes to SSHPanel are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and the project follows
[Semantic Versioning](https://semver.org/).

This file is the source of truth consumed by the in-app update viewer (Fase 6).

## [Unreleased]

_Nothing yet — open a discussion or issue if you have ideas._

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
