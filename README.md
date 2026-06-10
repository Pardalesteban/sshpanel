<div align="center">
  <img src="images/Logo_nuevo.png" alt="SSHPanel" width="128" height="128" />

  # SSHPanel

  **Open-source alternative to Terminus.** Manage SSH connections and Docker
  containers across multiple servers from a single app — web, desktop, and CLI.

  <sub>Self-hosted · Single binary backend · No accounts needed · Encrypted credentials</sub>
</div>

---

## What it does

- **SSH connection profiles** — save once, reuse forever. Credentials encrypted at rest.
- **Interactive terminal** in the browser/desktop app (xterm.js + WebSocket).
- **Docker management** — list, start/stop/restart containers, live logs, stats streaming with sparklines.
- **Docker Compose** — discover stacks, view services, run `up`/`down`/`restart`/`pull` with live streaming.
- **System monitor** — real-time CPU, RAM, disk, network, top processes (htop-style). Linux + macOS.
- **Multi-host overview** — single dashboard with health of every server at a glance.
- **SSH key management** — generate or paste, install in `authorized_keys` with one click.
- **Encrypted config export/import** — move your panel between machines safely.
- **Command palette** (`⌘K`) — quick navigation, fuzzy search, arbitrary shell exec.

## Installation

Two paths — pick the one that fits your use case.

| | **A. Desktop installer** | **B. Docker Compose** |
|---|---|---|
| **Best for** | Personal use, daily driver | VPS, headless, team-shared |
| **Install** | Download the binary, double-click | `docker-compose up -d` |
| **Backend** | Auto-starts when you open the app | Runs in a container |
| **Updates** | Auto-update inside the app (Fase 6) | `docker-compose pull` |
| **OS support** | Windows, macOS, Linux | Anywhere Docker runs |

### A. Desktop installer

Download the latest build from [Releases](https://github.com/Pardalesteban/sshpanel/releases):

- **Windows** — `sshpanel_x.y.z_x64-setup.exe`
- **macOS** — `sshpanel_x.y.z_aarch64.dmg` (Apple Silicon) or `_x64.dmg` (Intel)
- **Linux** — `sshpanel_x.y.z_amd64.AppImage` or `.deb`

The desktop app bundles the Python backend (PyInstaller sidecar) — there are no
external dependencies to install. Just open it.

On first launch you can optionally:
- Add the `sshpanel` CLI to your `PATH` (so you can run `sshpanel start` from any terminal).
- Auto-start with the OS.

### B. Docker Compose

For VPS or shared environments where you want the panel reachable via browser:

```bash
git clone https://github.com/Pardalesteban/sshpanel
cd sshpanel
docker-compose up -d
# → http://localhost:8080
```

Data persists in a named volume — your hosts survive container rebuilds.

## Quick start

1. Open SSHPanel.
2. Click **+** in the sidebar to add a host (name, IP, user, password or key).
3. Hit **Connect** in the host detail.
4. Use the tabs: **Resumen** · **Sistema** (live metrics) · **Containers** · **Compose** · **Terminal**.

For key-based auth, open the host detail, click the 🔑 button, and either generate a
new ed25519 keypair or paste an existing public key. SSHPanel installs it in
`~/.ssh/authorized_keys` of the remote with the correct permissions and uses it for
future connections.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Clients (any of)                      │
│   Web browser  ·  Tauri desktop app  ·  sshpanel CLI     │
└────────────────────────────┬─────────────────────────────┘
                             │ HTTP + WebSocket
                             ▼
┌──────────────────────────────────────────────────────────┐
│          FastAPI backend  (uvicorn @ :8080)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ SSH pool │ │  Docker  │ │  System  │ │   Keys   │    │
│  │(asyncssh)│ │ (over SSH)│ │  monitor │ │ (ed25519)│    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│       │  SQLite (encrypted passwords, Fernet)            │
└───────┼──────────────────────────────────────────────────┘
        │ async SSH
        ▼
   Remote servers
```

- **Single backend** powers all three clients.
- **SQLite** stores hosts; passwords encrypted with Fernet (key in `~/.sshpanel/.secret_key`).
- **Persistent SSH pool** keeps connections alive across requests.
- **asyncssh** for everything — no subprocess overhead.

## Tech stack

- **Backend**: Python 3.10+, FastAPI, asyncssh, SQLAlchemy, cryptography
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, xterm.js
- **Desktop**: Tauri 2 (Rust + WebView)
- **CLI**: Click + Rich

## Development

```bash
# Install
pip install -e .

# Run with auto-reload (backend + Vite, hot-swappable)
sshpanel dev

# Production daemon
sshpanel start         # background uvicorn
sshpanel status        # check it
sshpanel stop

# Desktop app (dev mode)
sshpanel app

# Build distributable bundle
sshpanel app-build
```

The CLI auto-starts the backend when needed (any command that hits an API).

## Design tokens

The UI uses a curated palette mapped to domains — see
[`web/tailwind.config.js`](web/tailwind.config.js) and
[CLAUDE.md](CLAUDE.md) for the full design system. TL;DR:

- Font: **Geist** (sans + mono)
- Brand: violet `#8b5cf6` (primary), cyan `#22d3ee` (Docker), emerald `#10b981` (running),
  amber `#f59e0b` (warnings), rose `#f43f5e` (errors), indigo `#6366f1` (SSH).

## Roadmap

See [`roadmap.md`](roadmap.md). Fase 4 (advanced features) is complete; current work is on
Fase 5 (open-source ready) and Fase 6 (auto-update).

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
  <sub>Built with care to be the SSH panel I wished existed.</sub>
</div>
