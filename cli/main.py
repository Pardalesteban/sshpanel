import os
import sys
import time
import signal
import subprocess
import platform
import httpx
import click
from pathlib import Path
from rich.console import Console
from rich.table import Table

console = Console()
DEFAULT_PORT = 8080
API_URL = f"http://localhost:{DEFAULT_PORT}/api"
PID_FILE = Path.home() / ".sshpanel" / "server.pid"


# --- Helpers de servidor ---

def _is_server_running(port: int = DEFAULT_PORT) -> bool:
    try:
        httpx.get(f"http://localhost:{port}/api/health", timeout=2)
        return True
    except Exception:
        return False


def _start_server_background(port: int = DEFAULT_PORT):
    PID_FILE.parent.mkdir(exist_ok=True)
    cmd = [
        sys.executable, "-m", "uvicorn",
        "backend.main:app",
        "--host", "0.0.0.0",
        "--port", str(port),
    ]
    root = Path(__file__).parent.parent
    proc = subprocess.Popen(
        cmd,
        cwd=str(root),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    PID_FILE.write_text(str(proc.pid))
    # Esperar a que levante (máx 10 seg)
    for _ in range(20):
        time.sleep(0.5)
        if _is_server_running(port):
            return
    raise RuntimeError("El servidor no respondió a tiempo")


def _stop_server():
    if not PID_FILE.exists():
        return False
    pid = int(PID_FILE.read_text().strip())
    try:
        if platform.system() == "Windows":
            subprocess.call(["taskkill", "/F", "/PID", str(pid)], stdout=subprocess.DEVNULL)
        else:
            os.kill(pid, signal.SIGTERM)
        PID_FILE.unlink(missing_ok=True)
        return True
    except ProcessLookupError:
        PID_FILE.unlink(missing_ok=True)
        return False


def _api(method: str, path: str, **kwargs):
    with httpx.Client(base_url=API_URL) as client:
        response = getattr(client, method)(path, **kwargs)
        response.raise_for_status()
        return response.json()


def _ensure_server():
    if not _is_server_running():
        console.print("[yellow]Servidor no activo, iniciando...[/]")
        _start_server_background()
        console.print(f"[green]Servidor listo en http://localhost:{DEFAULT_PORT}[/]")


# --- CLI principal ---

@click.group()
def cli():
    """SSHPanel — gestión de SSH y Docker desde la terminal."""
    pass


@cli.command()
@click.option("--port", default=DEFAULT_PORT, help="Puerto del servidor")
def start(port):
    """Iniciar el servidor en background."""
    if _is_server_running(port):
        console.print(f"[green]Ya está corriendo en http://localhost:{port}[/]")
        return
    console.print("Iniciando servidor...")
    _start_server_background(port)
    console.print(f"[green]Servidor iniciado en http://localhost:{port}[/]")


@cli.command()
def stop():
    """Detener el servidor."""
    if _stop_server():
        console.print("[green]Servidor detenido[/]")
    else:
        console.print("[yellow]No había servidor corriendo[/]")


@cli.command()
def status():
    """Ver el estado del servidor."""
    if _is_server_running():
        info = _api("get", "/health")
        console.print(f"[green]Corriendo[/] — versión {info['version']} en http://localhost:{DEFAULT_PORT}")
    else:
        console.print("[red]No está corriendo[/]")


@cli.command()
@click.option("--port", default=DEFAULT_PORT)
@click.option("--no-web", is_flag=True, help="Solo backend, sin frontend Vite")
def dev(port, no_web):
    """Iniciar backend + frontend en modo desarrollo (auto-reload)."""
    root = Path(__file__).parent.parent
    web_dir = root / "web"
    has_web = (web_dir / "package.json").exists() and not no_web

    console.print("[cyan]Modo desarrollo — auto-reload activo[/]")
    console.print(f"API:  http://localhost:{port}/api")
    console.print(f"Docs: http://localhost:{port}/docs")
    if has_web:
        console.print("Web:  http://localhost:5173")
    console.print("[dim]Ctrl+C para detener[/]\n")

    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app",
         "--reload", "--host", "0.0.0.0", "--port", str(port)],
        cwd=str(root),
    )

    web = None
    if has_web:
        npm = "npm.cmd" if platform.system() == "Windows" else "npm"
        try:
            web = subprocess.Popen([npm, "run", "dev"], cwd=str(web_dir))
        except FileNotFoundError:
            console.print("[yellow]npm no encontrado — corriendo solo el backend[/]")

    try:
        backend.wait()
    except KeyboardInterrupt:
        pass
    finally:
        if web:
            web.terminate()
        backend.terminate()


@cli.command()
@click.option("--port", default=DEFAULT_PORT)
def app(port):
    """Levantar SSHPanel como app desktop (Tauri + Vite + backend)."""
    root = Path(__file__).parent.parent
    web_dir = root / "web"
    if not (web_dir / "src-tauri").exists():
        console.print("[red]Falta src-tauri/. Reinstalar dependencias web.[/]")
        sys.exit(1)

    console.print("[cyan]Iniciando SSHPanel como app desktop…[/]")
    console.print(f"API:     http://localhost:{port}/api")
    console.print("[dim]Cerrar la ventana minimiza al system tray.[/]\n")

    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app",
         "--host", "0.0.0.0", "--port", str(port)],
        cwd=str(root),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Esperar a que el backend esté listo (máx 10s)
    for _ in range(20):
        time.sleep(0.5)
        if _is_server_running(port):
            break

    pnpm = "pnpm.cmd" if platform.system() == "Windows" else "pnpm"
    try:
        # tauri dev también levanta Vite (beforeDevCommand)
        subprocess.run([pnpm, "tauri:dev"], cwd=str(web_dir))
    except FileNotFoundError:
        console.print("[red]pnpm no encontrado. Instalalo: npm i -g pnpm[/]")
    finally:
        backend.terminate()


@cli.command("app-build")
def app_build():
    """Compilar el .exe / .dmg / .AppImage distribuible (con sidecar)."""
    root = Path(__file__).parent.parent
    web_dir = root / "web"

    # 1. Empaquetar backend Python como binario standalone
    console.print("[cyan][1/2] Empaquetando backend como sidecar…[/]")
    try:
        subprocess.run(
            [sys.executable, str(root / "sidecar" / "build_sidecar.py")],
            cwd=str(root),
            check=True,
        )
    except subprocess.CalledProcessError:
        console.print("[red]Falló el empaquetado del sidecar.[/]")
        return

    # 2. Compilar Tauri con el override que activa el sidecar
    console.print("[cyan][2/2] Compilando bundle desktop (puede tardar 5-15 min)…[/]")
    pnpm = "pnpm.cmd" if platform.system() == "Windows" else "pnpm"
    try:
        subprocess.run(
            [pnpm, "tauri", "build", "--config", "src-tauri/tauri.bundle.json"],
            cwd=str(web_dir),
            check=True,
        )
        console.print(
            f"[green]Listo. Buscá el bundle en "
            f"{web_dir / 'src-tauri/target/release/bundle'}[/]"
        )
    except subprocess.CalledProcessError:
        console.print("[red]Compilación falló — revisá el output.[/]")


@cli.command("install")
def install_service():
    """[DEPRECATED] Autostart se maneja desde la app Tauri (tray → 'Iniciar con el sistema').

    Este comando registraba uvicorn como servicio del SO, pero ya no aplica
    con el modelo desktop. Si usás `sshpanel app`, abrila y activá el
    checkbox 'Iniciar con el sistema' en el menú del tray icon.
    """
    console.print(
        "[yellow]Con la app desktop, el autostart se controla desde el tray icon:[/]\n"
        "  1. Click derecho en el ícono SSHPanel del system tray\n"
        "  2. Tildá 'Iniciar con el sistema'\n\n"
        "[dim]Comando legacy (autostart de uvicorn como servicio):[/]"
    )
    system = platform.system()
    if system == "Windows":
        _install_windows()
    elif system == "Darwin":
        _install_macos()
    else:
        _install_linux()


@cli.command("uninstall")
def uninstall_service():
    """Remover SSHPanel del inicio del sistema."""
    system = platform.system()
    if system == "Windows":
        subprocess.call(["schtasks", "/Delete", "/TN", "SSHPanel", "/F"])
    elif system == "Darwin":
        plist = Path.home() / "Library/LaunchAgents/com.sshpanel.plist"
        subprocess.call(["launchctl", "unload", str(plist)])
        plist.unlink(missing_ok=True)
    else:
        service = Path("/etc/systemd/system/sshpanel.service")
        subprocess.call(["systemctl", "disable", "--now", "sshpanel"])
        service.unlink(missing_ok=True)
    console.print("[green]SSHPanel removido del inicio del sistema[/]")


def _install_windows():
    exe = sys.executable
    script = str(Path(__file__).resolve())
    subprocess.call([
        "schtasks", "/Create", "/F",
        "/TN", "SSHPanel",
        "/TR", f'"{exe}" "{script}" start',
        "/SC", "ONLOGON",
        "/RL", "HIGHEST",
    ])
    console.print("[green]SSHPanel configurado para iniciar al iniciar sesión en Windows[/]")


def _install_macos():
    exe = sys.executable
    script = str(Path(__file__).resolve())
    plist_dir = Path.home() / "Library/LaunchAgents"
    plist_dir.mkdir(exist_ok=True)
    plist = plist_dir / "com.sshpanel.plist"
    plist.write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.sshpanel</string>
    <key>ProgramArguments</key>
    <array><string>{exe}</string><string>{script}</string><string>start</string></array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
</dict>
</plist>""")
    subprocess.call(["launchctl", "load", str(plist)])
    console.print("[green]SSHPanel configurado para iniciar con macOS[/]")


def _install_linux():
    exe = sys.executable
    script = str(Path(__file__).resolve())
    service = Path("/etc/systemd/system/sshpanel.service")
    service.write_text(f"""[Unit]
Description=SSHPanel Server
After=network.target

[Service]
ExecStart={exe} {script} start
Restart=always
User={os.getenv("USER", "root")}

[Install]
WantedBy=multi-user.target
""")
    subprocess.call(["systemctl", "daemon-reload"])
    subprocess.call(["systemctl", "enable", "--now", "sshpanel"])
    console.print("[green]SSHPanel configurado como servicio systemd[/]")


# --- Hosts ---

@cli.group()
def hosts():
    """Gestionar hosts SSH."""
    pass


@hosts.command("list")
def hosts_list():
    _ensure_server()
    data = _api("get", "/hosts/")
    table = Table(title="Hosts SSH")
    table.add_column("ID", style="dim")
    table.add_column("Nombre", style="cyan")
    table.add_column("Host")
    table.add_column("Puerto")
    table.add_column("Usuario")
    table.add_column("Estado")
    for h in data:
        status = "[green]conectado[/]" if h["connected"] else "[red]desconectado[/]"
        table.add_row(h["id"][:8], h["name"], h["host"], str(h["port"]), h["username"], status)
    console.print(table)


@hosts.command("add")
@click.option("--name", prompt="Nombre")
@click.option("--host", prompt="Host/IP")
@click.option("--port", default=22, prompt="Puerto")
@click.option("--username", default="root", prompt="Usuario")
@click.option("--password", default=None, help="Contraseña SSH")
@click.option("--key", default=None, help="Ruta a clave privada")
def hosts_add(name, host, port, username, password, key):
    _ensure_server()
    result = _api("post", "/hosts/", json={
        "name": name, "host": host, "port": port,
        "username": username, "password": password, "private_key_path": key,
    })
    console.print(f"[green]Host '{result['name']}' agregado con ID {result['id'][:8]}[/]")


@hosts.command("connect")
@click.argument("host_id")
def hosts_connect(host_id):
    _ensure_server()
    result = _api("post", f"/hosts/{host_id}/connect")
    if result["connected"]:
        console.print("[green]Conectado exitosamente[/]")


# --- Docker ---

@cli.group()
def docker():
    """Gestionar contenedores Docker."""
    pass


@docker.command("ps")
@click.argument("host_id")
@click.option("--all", "-a", is_flag=True)
def docker_ps(host_id, all):
    _ensure_server()
    containers = _api("get", f"/hosts/{host_id}/docker/containers", params={"all": all})
    table = Table(title=f"Contenedores — {host_id[:8]}")
    table.add_column("ID", style="dim")
    table.add_column("Imagen", style="cyan")
    table.add_column("Nombre")
    table.add_column("Estado")
    table.add_column("Puertos")
    for c in containers:
        table.add_row(c.get("ID", "")[:12], c.get("Image", ""), c.get("Names", ""), c.get("Status", ""), c.get("Ports", ""))
    console.print(table)


@docker.command("start")
@click.argument("host_id")
@click.argument("container_id")
def docker_start(host_id, container_id):
    _ensure_server()
    result = _api("post", f"/hosts/{host_id}/docker/containers/{container_id}/start")
    console.print(result["output"])


@docker.command("stop")
@click.argument("host_id")
@click.argument("container_id")
def docker_stop(host_id, container_id):
    _ensure_server()
    result = _api("post", f"/hosts/{host_id}/docker/containers/{container_id}/stop")
    console.print(result["output"])


# --- Config ---

@cli.group()
def config():
    """Exportar e importar configuración."""
    pass


@config.command("export")
@click.option("--password", prompt=True, hide_input=True)
@click.option("--output", default="sshpanel-config.enc")
def config_export(password, output):
    _ensure_server()
    response = httpx.post(f"{API_URL}/hosts/export", json={"password": password})
    response.raise_for_status()
    with open(output, "wb") as f:
        f.write(response.content)
    console.print(f"[green]Config exportada a {output}[/]")


@config.command("import")
@click.argument("file_path")
@click.option("--password", prompt=True, hide_input=True)
def config_import(file_path, password):
    _ensure_server()
    with open(file_path, "rb") as f:
        result = _api("post", "/hosts/import", data={"password": password}, files={"file": f})
    console.print(f"[green]{result['hosts_imported']} hosts importados[/]")


if __name__ == "__main__":
    cli()
