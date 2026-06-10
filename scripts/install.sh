#!/bin/sh
# SSHPanel — Docker installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/pardalesteban/sshpanel/main/scripts/install.sh | sh
#
# What it does:
#   1. Verifies docker + docker compose (offers to install via get.docker.com if missing).
#   2. Picks an install dir (default: /opt/sshpanel; ~/sshpanel if no sudo).
#   3. Fetches docker-compose.yml.
#   4. Generates a SECRET_KEY into .env.
#   5. `docker compose up -d`.
#   6. Optionally installs a `sshpanel` CLI wrapper in /usr/local/bin.
#
# POSIX sh — no bash-isms.

set -e

REPO_RAW="${SSHPANEL_REPO_RAW:-https://raw.githubusercontent.com/pardalesteban/sshpanel/main}"
DEFAULT_DIR="/opt/sshpanel"

# --- pretty printing -------------------------------------------------------

c_reset='\033[0m'
c_bold='\033[1m'
c_violet='\033[35m'
c_cyan='\033[36m'
c_green='\033[32m'
c_yellow='\033[33m'
c_red='\033[31m'

say()  { printf '%b\n' "${c_violet}» ${c_reset}$1"; }
ok()   { printf '%b\n' "${c_green}✓ ${c_reset}$1"; }
warn() { printf '%b\n' "${c_yellow}! ${c_reset}$1"; }
die()  { printf '%b\n' "${c_red}✗ ${c_reset}$1" >&2; exit 1; }
ask()  {
  printf '%b%s%b ' "${c_cyan}?${c_reset} " "$1" ""
  read REPLY
}

require() { command -v "$1" >/dev/null 2>&1 || die "$1 no está instalado y es necesario."; }

# --- prerequisites ---------------------------------------------------------

say "Chequeando dependencias…"
require curl

if ! command -v docker >/dev/null 2>&1; then
  warn "Docker no está instalado."
  ask "¿Instalarlo ahora vía get.docker.com? [s/N]"
  case "$REPLY" in
    s|S|si|y|Y|yes)
      curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
      sh /tmp/get-docker.sh
      rm -f /tmp/get-docker.sh
      ok "Docker instalado."
      ;;
    *)
      die "Instalá Docker manualmente y volvé a correr este script."
      ;;
  esac
fi

if ! docker compose version >/dev/null 2>&1; then
  die "Docker Compose v2 no está disponible. Actualizá Docker a una versión moderna."
fi

ok "Docker + Compose OK."

# --- pick install dir ------------------------------------------------------

if [ -w "$(dirname "$DEFAULT_DIR")" ] 2>/dev/null || [ "$(id -u)" = "0" ]; then
  INSTALL_DIR="$DEFAULT_DIR"
else
  INSTALL_DIR="$HOME/sshpanel"
  warn "Sin permisos para $DEFAULT_DIR — instalando en $INSTALL_DIR"
fi

ask "Directorio de instalación [$INSTALL_DIR]:"
[ -n "$REPLY" ] && INSTALL_DIR="$REPLY"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
ok "Usando $INSTALL_DIR"

# --- fetch compose file ----------------------------------------------------

if [ -f docker-compose.yml ]; then
  warn "Ya hay un docker-compose.yml en $INSTALL_DIR — se reusa."
else
  say "Bajando docker-compose.yml…"
  curl -fsSL "$REPO_RAW/docker-compose.yml" -o docker-compose.yml
  ok "Listo."
fi

# --- generate .env ---------------------------------------------------------

if [ ! -f .env ]; then
  say "Generando SECRET_KEY…"
  if command -v openssl >/dev/null 2>&1; then
    KEY="$(openssl rand -hex 32)"
  else
    KEY="$(head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  cat > .env <<EOF
# Generado por install.sh — NO commitear este archivo.
SECRET_KEY=$KEY
SSHPANEL_PORT=8080
TZ=UTC
EOF
  chmod 600 .env
  ok "SECRET_KEY generada en $INSTALL_DIR/.env (chmod 600)."
else
  warn "Ya existe .env — no se sobreescribe."
fi

# --- launch ----------------------------------------------------------------

say "Levantando SSHPanel…"
docker compose pull 2>/dev/null || true
docker compose up -d

# Esperar healthcheck
i=0
while [ $i -lt 30 ]; do
  if docker compose ps --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

PORT="$(grep -E '^SSHPANEL_PORT=' .env | cut -d= -f2)"
PORT="${PORT:-8080}"
ok "SSHPanel corriendo en http://localhost:$PORT"

# --- optional: PATH wrapper ------------------------------------------------

WRAPPER_TARGET="/usr/local/bin/sshpanel"

printf '\n'
ask "¿Agregar el comando ${c_bold}sshpanel${c_reset} al PATH? Te deja hacer 'sshpanel start/stop/logs' desde cualquier directorio. [s/N]"
case "$REPLY" in
  s|S|si|y|Y|yes)
    TMP_WRAPPER="$(mktemp)"
    cat > "$TMP_WRAPPER" <<EOF
#!/bin/sh
# SSHPanel CLI wrapper — operates against the Docker install at $INSTALL_DIR.
SSHPANEL_DIR="$INSTALL_DIR"
cd "\$SSHPANEL_DIR" || { echo "SSHPanel install dir not found: \$SSHPANEL_DIR" >&2; exit 1; }
case "\$1" in
  start)   docker compose up -d ;;
  stop)    docker compose down ;;
  restart) docker compose restart ;;
  status)  docker compose ps ;;
  logs)    shift; docker compose logs -f "\$@" ;;
  upgrade) docker compose pull && docker compose up -d ;;
  shell)   docker compose exec sshpanel sh ;;
  *)
    cat <<USAGE
SSHPanel — Docker control wrapper

Usage:  sshpanel <command>

Commands:
  start    Start the container in background.
  stop     Stop and remove the container.
  restart  Restart the container.
  status   Show running state.
  logs     Tail logs (Ctrl+C to exit).
  upgrade  Pull latest image and restart.
  shell    Open a shell inside the container.

Install dir: \$SSHPANEL_DIR
USAGE
    ;;
esac
EOF
    chmod +x "$TMP_WRAPPER"
    if [ -w "$(dirname "$WRAPPER_TARGET")" ]; then
      mv "$TMP_WRAPPER" "$WRAPPER_TARGET"
    elif command -v sudo >/dev/null 2>&1; then
      sudo mv "$TMP_WRAPPER" "$WRAPPER_TARGET"
    else
      warn "No puedo escribir en /usr/local/bin sin sudo. Wrapper guardado en $TMP_WRAPPER — movelo a mano."
      WRAPPER_TARGET="$TMP_WRAPPER"
    fi
    ok "Wrapper instalado en $WRAPPER_TARGET. Probá: ${c_bold}sshpanel status${c_reset}"
    ;;
  *)
    say "OK, sin wrapper. Para administrar SSHPanel:  cd $INSTALL_DIR && docker compose ..."
    ;;
esac

printf '\n'
ok "Instalación lista. Abrí ${c_bold}http://localhost:$PORT${c_reset} en tu navegador."
