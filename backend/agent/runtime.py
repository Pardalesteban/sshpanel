"""Detección, instalación y resolución del binario de Claude Code.

Regla central (pedido del usuario): **si Claude Code ya está instalado en el
sistema, NO se reinstala.** `resolve_claude_bin()` busca con prioridad antes de
ofrecer la descarga.

El login NO se maneja acá: ocurre dentro del PTY la primera vez (el usuario
escribe `/login` en la terminal del agente y completa el OAuth de su suscripción).
"""
import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import AsyncGenerator, Optional

IS_WINDOWS = platform.system() == "Windows"

# --- Paths gestionados por SSHPanel ---

AGENT_HOME = Path.home() / ".sshpanel" / "agent"
MANAGED_BIN_DIR = AGENT_HOME / "bin"
SCRATCH_DIR = AGENT_HOME / "scratch"

# URLs del instalador oficial de Claude Code. Marcadas como constantes a propósito
# — si Anthropic cambia el endpoint, se toca acá. (Verificar contra la doc vigente
# si la instalación empieza a fallar con 404.)
INSTALL_URL_UNIX = "https://claude.ai/install.sh"
INSTALL_URL_WINDOWS = "https://claude.ai/install.ps1"


def agent_paths() -> dict:
    MANAGED_BIN_DIR.mkdir(parents=True, exist_ok=True)
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    return {"home": AGENT_HOME, "bin": MANAGED_BIN_DIR, "scratch": SCRATCH_DIR}


def scratch_for(host_id: str) -> Path:
    """Directorio de trabajo aislado por host. Claude corre acá (NUNCA en el repo)."""
    d = SCRATCH_DIR / host_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _claude_filename() -> str:
    return "claude.exe" if IS_WINDOWS else "claude"


def _candidate_paths() -> list[Path]:
    """Ubicaciones conocidas del instalador nativo y de npm global, por SO."""
    home = Path.home()
    name = _claude_filename()
    candidates: list[Path] = []

    if IS_WINDOWS:
        local_appdata = os.environ.get("LOCALAPPDATA", str(home / "AppData" / "Local"))
        appdata = os.environ.get("APPDATA", str(home / "AppData" / "Roaming"))
        candidates += [
            home / ".local" / "bin" / name,
            Path(local_appdata) / "Programs" / "claude" / name,
            Path(local_appdata) / "claude" / name,
            # npm global
            Path(appdata) / "npm" / "claude.cmd",
            Path(appdata) / "npm" / "claude.exe",
        ]
    else:
        candidates += [
            home / ".local" / "bin" / name,
            home / ".claude" / "local" / name,
            home / "bin" / name,
            Path("/usr/local/bin") / name,
            Path("/opt/homebrew/bin") / name,
            # npm global típico
            home / ".npm-global" / "bin" / name,
            Path("/usr/local/lib/node_modules/.bin") / name,
        ]

    return candidates


def resolve_claude_bin() -> Optional[Path]:
    """Devuelve la ruta a un Claude Code instalado, o None.

    Prioridad:
      1. PATH global (shutil.which — respeta PATHEXT en Windows).
      2. Instalaciones conocidas (instalador nativo / npm global).
      3. Dir gestionado por SSHPanel (lo que bajó el botón).
    """
    found = shutil.which("claude")
    if found:
        return Path(found)

    for c in _candidate_paths():
        if c.exists():
            return c

    managed = MANAGED_BIN_DIR / _claude_filename()
    if managed.exists():
        return managed

    return None


def launch_argv(binpath: Path) -> list[str]:
    """argv para spawnear Claude Code en el PTY.

    En Windows, los shims de npm son `.cmd`/`.bat` y CreateProcess no los ejecuta
    directo — hay que pasarlos por `cmd /c`. Un `.exe` (instalador nativo) se lanza tal cual.
    """
    if IS_WINDOWS and binpath.suffix.lower() in (".cmd", ".bat"):
        return ["cmd", "/c", str(binpath)]
    return [str(binpath)]


def _detect_logged_in() -> Optional[bool]:
    """Best-effort: detecta si hay una sesión de Claude Code.

    No es 100% fiable cross-plataforma (macOS puede usar Keychain), así que
    devuelve None cuando no puede afirmar nada. La UI solo lo usa como hint; el
    login real ocurre en el PTY.
    """
    claude_dir = Path.home() / ".claude"
    for marker in (".credentials.json", "credentials.json"):
        if (claude_dir / marker).exists():
            return True
    legacy = Path.home() / ".claude.json"
    if legacy.exists():
        try:
            text = legacy.read_text(encoding="utf-8", errors="ignore")
            if "oauthAccount" in text or "accessToken" in text:
                return True
        except Exception:
            pass
    return None


def _version_of(path: Path) -> Optional[str]:
    try:
        out = subprocess.run(
            [str(path), "--version"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if out.returncode == 0:
            return (out.stdout or out.stderr or "").strip() or None
    except Exception:
        pass
    return None


def status() -> dict:
    """Estado del agente para la UI: instalado, de dónde, versión, login."""
    binpath = resolve_claude_bin()
    if binpath is None:
        return {
            "installed": False,
            "source": None,
            "version": None,
            "logged_in": None,
            "path": None,
        }

    managed = MANAGED_BIN_DIR / _claude_filename()
    source = "managed" if binpath == managed else "system"
    return {
        "installed": True,
        "source": source,
        "version": _version_of(binpath),
        "logged_in": _detect_logged_in(),
        "path": str(binpath),
    }


def _install_command() -> list[str]:
    if IS_WINDOWS:
        # PowerShell: descarga y ejecuta el instalador oficial (user-level).
        return [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            f"irm {INSTALL_URL_WINDOWS} | iex",
        ]
    return ["bash", "-c", f"curl -fsSL {INSTALL_URL_UNIX} | bash"]


async def install_stream() -> AsyncGenerator[str, None]:
    """Corre el instalador oficial de Claude Code y streamea su salida línea a
    línea. **Solo se debe invocar si `resolve_claude_bin()` es None** (la API lo
    chequea antes de llamar acá).
    """
    import asyncio

    agent_paths()  # asegura que existan los dirs gestionados

    if resolve_claude_bin() is not None:
        yield "[!] Claude Code ya está instalado — se omite la descarga.\r\n"
        yield "[DONE]\r\n"
        return

    cmd = _install_command()
    yield f"[*] Instalando Claude Code…\r\n"

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
    except FileNotFoundError as e:
        yield f"[ERROR] No se pudo lanzar el instalador: {e}\r\n"
        return

    assert proc.stdout is not None
    async for raw in proc.stdout:
        yield raw.decode("utf-8", errors="replace")

    code = await proc.wait()
    if code == 0 and resolve_claude_bin() is not None:
        yield "\r\n[DONE]\r\n"
    else:
        yield (
            f"\r\n[ERROR] La instalación terminó con código {code} y no se "
            f"detectó el binario.\r\n"
            f"Probá instalarlo a mano: "
            f"{'irm ' + INSTALL_URL_WINDOWS + ' | iex' if IS_WINDOWS else 'curl -fsSL ' + INSTALL_URL_UNIX + ' | bash'}\r\n"
        )
