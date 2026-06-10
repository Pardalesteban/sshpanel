# Changelog

All notable changes to SSHPanel are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and the project follows
[Semantic Versioning](https://semver.org/).

This file is the source of truth consumed by the in-app update viewer (Fase 6).

## [Unreleased]

### Added
- **Official logo applied** as Tauri appIcon (all sizes regenerated) and web favicon.
- **Docker Compose panel** — discovery (`docker compose ls`), services view, YAML
  config viewer, and streamed `up`/`down`/`restart`/`pull` actions per stack.
- **SSH key management** — generate or paste a public key; SSHPanel installs it
  in the remote's `authorized_keys` and switches the host to key-based auth.
- **Multi-host overview** — single dashboard with CPU, MEM, latency, container
  counts of every server. Fan-out async with per-host timeout. Shortcut `⌘H`.
- **Kill process** action in the system process list, with sudo escalation
  when the server returns 403.
- **Tags + filtering** for hosts in the sidebar (with `#tag` exact-match prefix).
- **Live container stats** — sparklines of CPU/MEM per container, updated every 2s.
- **Ctrl+C / Ctrl+V** in terminals — copy on selection, SIGINT on empty (matches
  Windows Terminal behavior over SSH).

### Infrastructure
- `Dockerfile` rebuilt as multi-stage (frontend built inside the image).
- `docker-compose.yml` hardened for production: required `SECRET_KEY`, healthcheck,
  persistent volume for generated SSH keys, configurable port and timezone.
- `.dockerignore`, `.gitignore`, `.env.example` added.
- README, LICENSE (MIT), CHANGELOG.

## [0.1.0] — initial baseline

See `roadmap.md` Fase 1–3 for the feature set of the initial cut.
