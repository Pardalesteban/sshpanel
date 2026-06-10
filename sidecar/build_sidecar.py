"""Empaqueta el backend FastAPI como un binario standalone para Tauri.

Genera `sshpanel-backend-{target_triple}.exe` (o sin extensión en Unix) en
`web/src-tauri/binaries/` — Tauri lo recoge automáticamente como sidecar.
"""
import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_TAURI = ROOT / "web" / "src-tauri"
BINARIES_DIR = WEB_TAURI / "binaries"


def target_triple() -> str:
    """Devuelve el target triple de Rust para nombrar el binario."""
    try:
        out = subprocess.check_output(
            ["rustc", "-vV"], text=True, stderr=subprocess.STDOUT
        )
        for line in out.splitlines():
            if line.startswith("host:"):
                return line.split(":", 1)[1].strip()
    except Exception:
        pass
    # Fallback
    system = platform.system()
    machine = platform.machine()
    if system == "Windows":
        return "x86_64-pc-windows-msvc"
    if system == "Darwin":
        return "aarch64-apple-darwin" if machine == "arm64" else "x86_64-apple-darwin"
    return "x86_64-unknown-linux-gnu"


def main():
    BINARIES_DIR.mkdir(parents=True, exist_ok=True)
    triple = target_triple()
    print(f"[*] Target triple: {triple}")

    print("[*] Empaquetando backend con PyInstaller…")
    subprocess.run(
        [
            sys.executable, "-m", "PyInstaller",
            "--onefile",
            "--noconfirm",
            "--clean",
            "--name", "sshpanel-backend",
            "--distpath", str(BINARIES_DIR),
            "--workpath", str(WEB_TAURI / "build_work"),
            "--specpath", str(WEB_TAURI / "build_work"),
            # Imports que PyInstaller no detecta solo
            "--hidden-import", "uvicorn.logging",
            "--hidden-import", "uvicorn.loops.auto",
            "--hidden-import", "uvicorn.loops.asyncio",
            "--hidden-import", "uvicorn.protocols.http.auto",
            "--hidden-import", "uvicorn.protocols.http.h11_impl",
            "--hidden-import", "uvicorn.protocols.websockets.auto",
            "--hidden-import", "uvicorn.protocols.websockets.websockets_impl",
            "--hidden-import", "uvicorn.lifespan.on",
            "--collect-submodules", "asyncssh",
            str(ROOT / "sidecar" / "entrypoint.py"),
        ],
        cwd=str(ROOT),
        check=True,
    )

    # PyInstaller deja `sshpanel-backend.exe` — lo renombramos al formato
    # que Tauri espera para sidecars: <name>-<target-triple><ext>
    ext = ".exe" if platform.system() == "Windows" else ""
    src = BINARIES_DIR / f"sshpanel-backend{ext}"
    dst = BINARIES_DIR / f"sshpanel-backend-{triple}{ext}"
    if src.exists():
        if dst.exists():
            dst.unlink()
        src.rename(dst)
        print(f"[OK] Sidecar listo: {dst}")
    else:
        print(f"[!] No se encontró {src}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
