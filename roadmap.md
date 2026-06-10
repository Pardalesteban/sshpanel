# SSHPanel Roadmap

## Fase 1 — Base funcional
- [x] Backend FastAPI con SSH pool persistente
- [x] Docker manager via SSH
- [x] CRUD de hosts con SQLite
- [x] Export/Import de config cifrado
- [x] CLI con Click + Rich
- [x] Comando `sshpanel dev` con auto-reload
- [x] Cifrar passwords en la DB con SECRET_KEY (Fernet + PBKDF2, key en `~/.sshpanel/.secret_key` o env `SECRET_KEY`)

## Fase 2 — Frontend web
- [x] Sistema de diseño definido (Geist + paleta multi-color + gradients)
- [x] Scaffold React + Vite + Tailwind con tokens del design system
- [x] Sidebar con lista de hosts + avatars con gradient identicons
- [x] Página de detalle de host (acciones, info, status badge)
- [x] Modal de agregar host
- [x] Empty state con CTA
- [x] `sshpanel dev` levanta backend + Vite juntos (proxy /api)
- [x] Tabs en HostDetail (Resumen / Containers / Terminal)
- [x] Terminal SSH interactiva en el browser (xterm.js + WebSocket, paleta ANSI curada)
- [x] Botón de desconectar (backend endpoint + UI con hover rose)
- [x] Página de contenedores Docker por host (cards con estado, start/stop/restart)
- [x] Streaming de logs en tiempo real (xterm en read-only, pause/clear, polling cada 4s)
- [x] Command palette global (Cmd+K — navegación, hosts, Docker, sistema, fuzzy search)
- [x] Atajos: Cmd+T (terminal), Cmd+D (Docker), Cmd+K (palette)
- [x] Export/Import desde la UI (modal con cifrado por contraseña)
- [x] Persistencia de tab por host + recordada en localStorage
- [x] Terminales SSH persistentes (todas las abiertas mantienen sesión + scrollback al cambiar de host/tab)
- [x] Resize de terminal SSH (FitAddon + mensaje JSON al backend + asyncssh change_terminal_size)
- [x] Ejecutar comando arbitrario desde el palette (prefix `>`, modal con stdout/stderr/exit code, botón copiar)
- [x] Persistencia de logs de containers (mismo patrón que terminales — 1 log activo por host, sobrevive cambios de tab/host)
- [x] Wizard de instalación de Docker — si el remoto no tiene docker, mostrar card + botón que ejecuta `get.docker.com` via SSH con stream del output en vivo (xterm), con detección de sudo (NOPASSWD / password guardada con fallback a la SSH)
- [x] Campo `sudo_password` opcional en hosts (cifrado, fallback a password SSH si vacío)
- [x] Editar hosts (endpoint PUT, modal reutilizable create/edit, botón lápiz en HostDetail + acción en palette)

## Fase 3 — Desktop app
- [x] Scaffold Tauri v2 wrapeando la web app (`web/src-tauri/`)
- [x] Icono brand (gradiente violet→pink) generado para todos los formatos (ico, icns, PNG sizes)
- [x] **Logo oficial** (`images/Logo.png`) aplicado como appIcon de Tauri (regenerado para todos los tamaños via `tauri icon`: Windows .ico, macOS .icns, Linux PNGs, iOS, Android, tray icon) y favicon de la web (`web/public/favicon.png` + apple-touch-icon)
- [x] Icono en system tray con menú contextual (Mostrar/Ocultar/Salir) + click izq toggle
- [x] Cerrar la ventana minimiza al tray en vez de salir (close prevent)
- [x] Comando `sshpanel app` que levanta backend + Tauri (que a su vez levanta Vite)
- [x] Comando `sshpanel app-build` para compilar el bundle distribuible
- [x] Sidecar de uvicorn: backend Python empaquetado con PyInstaller, lanzado por Tauri al iniciar y killeado al salir, declarado en `externalBin` + capabilities
- [x] Bundle prod autocontenido — `app-build` empaqueta sidecar + frontend + Rust en un solo bundle
- [x] Autostart con el OS — `tauri-plugin-autostart` integrado, checkbox "Iniciar con el sistema" en el tray menu (Windows/macOS/Linux nativo)
- [ ] Probar build distribuible en cada OS (.exe, .dmg, .AppImage)
- [ ] **Wizard de primer arranque (in-app)** — al abrir la app por primera vez muestra un setup con:
  - [ ] Checkbox "Agregar `sshpanel` al PATH" (opcional, deja usar el CLI desde cualquier terminal). Implementado en Tauri Rust, cross-platform:
    - Windows: escribe en `HKCU\Environment\Path` + broadcast `WM_SETTINGCHANGE` (no requiere admin)
    - macOS: symlink en `/usr/local/bin/sshpanel` → binario empaquetado (prompt sudo)
    - Linux: symlink en `~/.local/bin/sshpanel`
  - [ ] Checkbox "Iniciar con el sistema" (ya existe en tray, replicado acá)
  - [ ] Botón "Continuar" guarda decisiones en config persistente y no vuelve a mostrarse
- [ ] Opción "Add to PATH / Remove from PATH" en panel Settings/Acerca de (para revertir o aplicar después)

## Fase 4 — Features avanzados
- [x] **Tab "Sistema" por host** — sparklines en tiempo real de CPU / RAM / swap / disco / network I/O, load average, uptime, paleta multi-color del design system, WebSocket cada 2s, samples persistentes al cambiar tab/host (mismo patrón que terminales)
- [x] **Detección automática de OS** — Linux (`/proc/*`) y macOS (`vm_stat` + `sysctl` + `netstat -ib`). Badge OS en el header del SystemPanel.
- [x] **Process list** estilo htop — sort por CPU, filter por user/command, color por threshold
- [x] **Latencia SSH** — RTT del snapshot, pill en el header de Sistema + mini-dot en sidebar (verde < 50ms, amber < 200ms, rosa más) via store global ligero
- [x] Atajo `Cmd+S` para abrir tab Sistema del host activo
- [x] Dashboard de stats por container — `docker stats` streaming via WebSocket (cada 2s, parser de unidades), sparklines CPU + MEM inline en cada ContainerCard con la paleta del design system
- [x] Ctrl+C / Ctrl+V en terminales — copia si hay selección, si no manda SIGINT (mismo comportamiento que PowerShell/Windows Terminal sobre SSH); en logs siempre copia
- [x] Gestión de Docker Compose por host (descubrimiento + acciones) — `docker compose ls` para listar stacks existentes, `compose ps` con `-f` por archivo para servicios y puertos, `compose config` para ver YAML resuelto. Acciones up/down/restart/pull/start/stop via WebSocket con streaming en xterm. Tab "Compose" en HostDetail con expand inline por stack y drawer modal para el log de la acción. Backend whitelist explícita de acciones (`_ALLOWED_ACTIONS`). Pendiente para una iteración futura: subir/editar YAML desde la UI.
- [x] Upload de SSH keys via UI — modal con tabs Generar/Pegar. "Generar" crea par ed25519 con `cryptography`, guarda la privada en `~/.sshpanel/keys/{host_id}.key` (chmod 0600), la asocia al host (`private_key_path`) y desconecta del pool para que reconecte con key-auth. "Pegar" valida formato OpenSSH y la appendea al `authorized_keys` del remoto con `mkdir -p $HOME/.ssh + chmod 700 + grep -qF` (idempotente, sin duplicados). Status del host (sin clave / clave local / en uso) con fingerprint SHA256 al abrir el modal.
- [x] Tags y búsqueda de hosts — campo Tags en AddHostModal (CSV), input de filtro en Sidebar (nombre / host / usuario / tags), prefijo `#tag` para match exacto, pills clickeables debajo de cada host que filtran al instante
- [x] Multi-host view — endpoint `GET /api/overview` con fan-out async + timeout por host (5s, configurable) que devuelve snapshot consolidado (CPU/MEM/latency/uptime/containers/OS) sin que un host caído tire la respuesta. `OverviewPanel` con grid responsive de cards data-driven (agregar métrica = agregar item al array), border-l con color por health (rose si error, amber si saturado, emerald si ok), click navega al detalle. Botón "Overview" en sidebar + atajo `⌘H`.
- [x] Action en process list: kill — botón skull en cada fila (visible al hover), confirmación inline ✓/✗, escalado a sudo automático si el server devuelve 403 (usa la sudo_password guardada del host), señales TERM/KILL/HUP/INT permitidas en backend

## Fase 5 — Open source ready
- [x] README completo con tabla comparativa de instalación, features, arquitectura, tech stack, dev setup (screenshots pendientes — cuando haya UI estable las capturamos)
- [x] `docker-compose.yml` de producción endurecido — `SECRET_KEY` requerido (falla si no está en `.env`), healthcheck contra `/api/health`, volumen separado para `~/.sshpanel` (claves SSH generadas in-app sobreviven al rebuild), port/TZ configurables vía `.env`, Dockerfile multi-stage que también buildea el frontend, `.dockerignore`
- [x] LICENSE (MIT), CHANGELOG.md (Keep a Changelog), `.gitignore`, `.env.example`
- [x] GitHub Actions para build automático (CI) — `.github/workflows/ci.yml`: typecheck + build frontend, smoke test del backend (imports), build sin push de la imagen Docker. Corre en cada push/PR a main.
- [x] Releases en GitHub con binarios — `.github/workflows/release.yml` dispara al taggear `v*.*.*`: matriz Win/Mac/Linux que corre `sshpanel app-build` (sidecar PyInstaller + tauri build), publica artifacts (.exe, .msi, .dmg, .AppImage, .deb), buildea y pushea imagen Docker multi-arch (amd64+arm64) a `ghcr.io`, crea Release con notas extraídas automáticamente del `CHANGELOG.md` de esa versión.
- [x] **Dos vías de instalación documentadas en el README** con tabla comparativa:
  - **A. Instalador desktop** (recomendado para uso individual): bajás el binario de Releases → doble-click → backend arranca solo cuando abrís la app
  - **B. Docker Compose** (recomendado para VPS / headless): `curl get.sshpanel.app | sh` o `docker-compose up -d` → accedés vía http://localhost:8080
- [x] **Script de instalación Docker** (`scripts/install.sh`, POSIX sh) que:
  - [x] Detecta docker + compose; si falta docker, ofrece instalarlo via `get.docker.com`
  - [x] Pide directorio (default `/opt/sshpanel`; cae a `~/sshpanel` si no hay sudo)
  - [x] Descarga el `docker-compose.yml` del repo
  - [x] Genera `SECRET_KEY` (openssl o /dev/urandom como fallback) en `.env` con chmod 600
  - [x] `docker compose up -d` + espera al healthcheck
  - [x] Pregunta interactivo: "¿Agregar `sshpanel` al PATH?" → si acepta, dropea wrapper en `/usr/local/bin/sshpanel` con subcomandos `start/stop/restart/status/logs/upgrade/shell` que operan sobre el directorio de instalación

## Fase 6 — Auto-update (final final)
- [x] **Tauri updater configurado** — plugins `tauri-plugin-updater` + `tauri-plugin-process` en `Cargo.toml`, capabilities `updater:default` + `process:allow-restart`. `tauri.conf.json` con `createUpdaterArtifacts: true` y endpoint apuntando a `releases/latest/download/latest.json` de GitHub.
- [x] **Chequeo automático al arranque** — `updater.init()` en `App.tsx` con debounce de 2s + poll cada 6h. Detecta automáticamente si está corriendo en Tauri vs browser puro (no-op en browser).
- [x] **UI de actualización completa** dentro de la app:
  - [x] `AboutPanel.tsx` — modal con logo + versión actual (vía `getVersion()` con fallback a `VITE_APP_VERSION` del `package.json`), changelog viewer que fetch + parsea `CHANGELOG.md` del repo, link a GitHub
  - [x] `UpdateBanner.tsx` — top de la app cuando hay update disponible/descargando/lista, dismissable, botones contextuales por estado
  - [x] Botón **"Restart to update"** verde prominente en ambos lugares cuando `stage === "ready"`, llama `relaunch()`
  - [x] Estados completos: idle / checking / uptodate / available / downloading (con progress bar) / ready / error
  - [x] Botón **"Buscar actualizaciones"** manual en el footer del AboutPanel
  - [x] Item "Acerca de" en el footer del Sidebar para abrir el panel
- [x] **Firma + Servidor de metadatos**:
  - [x] Par de claves minisign generado (`~/.tauri/sshpanel.key` + `.pub`) con password fuerte
  - [x] Clave pública pegada en `tauri.conf.json` → `plugins.updater.pubkey`
  - [x] Step de build en `release.yml` lee `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` de secrets — Tauri firma automáticamente si están presentes (degrada graciosamente a build sin firma si no)
  - [x] Artifact globs incluyen `*.sig` (firmas) para los formatos updater-capable
  - [x] Step `Generate latest.json` arma el feed del updater desde los artifacts: lee cada `.sig`, mapea filename → key de plataforma (`darwin-*`, `linux-x86_64`, `windows-x86_64`), incluye URL de Release y notas del CHANGELOG. Publicado como asset del Release → URL `releases/latest/download/latest.json` queda fija para el endpoint del cliente.
  - [ ] **Pegar 2 secrets en GitHub** (acción del user — instrucciones impresas tras commit)
