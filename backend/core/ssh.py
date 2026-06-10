import asyncio
import asyncssh
from typing import AsyncGenerator, Optional
from dataclasses import dataclass, field


@dataclass
class SSHProfile:
    id: str
    name: str
    host: str
    port: int = 22
    username: str = "root"
    password: Optional[str] = None
    private_key_path: Optional[str] = None


class SSHConnection:
    def __init__(self, profile: SSHProfile):
        self.profile = profile
        self._conn: Optional[asyncssh.SSHClientConnection] = None
        self._binary_paths: dict[str, Optional[str]] = {}

    async def connect(self):
        kwargs = {
            "host": self.profile.host,
            "port": self.profile.port,
            "username": self.profile.username,
            "known_hosts": None,
        }
        if self.profile.private_key_path:
            kwargs["client_keys"] = [self.profile.private_key_path]
        elif self.profile.password:
            kwargs["password"] = self.profile.password

        self._conn = await asyncssh.connect(**kwargs)

    async def disconnect(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    @property
    def is_connected(self) -> bool:
        return self._conn is not None and not self._conn.is_closed()

    # Paths comunes donde viven binarios "user-installed" en distros y Mac.
    # Los agregamos al PATH para que comandos como docker/brew/nvm se
    # encuentren aunque el .bash_profile no los exporte (típico en Mac
    # con zsh + Homebrew).
    _EXTRA_PATH = ":".join([
        "/usr/local/bin",
        "/usr/local/sbin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/snap/bin",
        "/usr/sbin",
    ])

    async def run(self, command: str, login_shell: bool = False) -> str:
        if not self.is_connected:
            await self.connect()
        if login_shell:
            escaped = command.replace("'", "'\\''")
            command = (
                f"bash -lc 'export PATH=\"$PATH:{self._EXTRA_PATH}\" && "
                f"{escaped}'"
            )
        result = await self._conn.run(command, check=False)
        if result.exit_status not in (0, None):
            stderr = (result.stderr or "").strip()
            raise RuntimeError(
                stderr or f"comando falló (exit {result.exit_status})"
            )
        return result.stdout

    async def stream(self, command: str) -> AsyncGenerator[str, None]:
        if not self.is_connected:
            await self.connect()
        async with self._conn.create_process(command) as process:
            async for line in process.stdout:
                yield line

    async def find_binary(self, name: str) -> Optional[str]:
        """Busca un binario en el remoto y cachea su path absoluto.

        Prueba en orden: login shell (command -v), zsh (sourcea .zshrc),
        ubicaciones comunes (/usr/bin, /usr/local/bin, /opt/homebrew/bin,
        /snap/bin). Devuelve None si no se encuentra en ninguna.
        """
        if name in self._binary_paths:
            return self._binary_paths[name]

        if not self.is_connected:
            await self.connect()

        candidates = [
            f"bash -lc 'command -v {name}'",
            f"zsh -lc 'command -v {name}' 2>/dev/null",
            f"sh -lc 'command -v {name}'",
        ] + [
            f"test -x {path}/{name} && echo {path}/{name}"
            for path in [
                "/usr/bin",
                "/usr/local/bin",
                "/opt/homebrew/bin",
                "/snap/bin",
                "/usr/sbin",
                "/usr/local/sbin",
            ]
        ]

        for cmd in candidates:
            try:
                result = await self._conn.run(cmd, check=False)
                if result.exit_status == 0 and result.stdout and result.stdout.strip():
                    path = result.stdout.strip().splitlines()[0].strip()
                    self._binary_paths[name] = path
                    return path
            except Exception:
                continue

        # Último recurso: find. Lento pero exhaustivo. Limitamos a 5s.
        try:
            result = await self._conn.run(
                f"timeout 5 find / -maxdepth 6 -name {name} -type f "
                f"-executable 2>/dev/null | head -1",
                check=False,
            )
            if result.exit_status == 0 and result.stdout and result.stdout.strip():
                path = result.stdout.strip().splitlines()[0].strip()
                self._binary_paths[name] = path
                return path
        except Exception:
            pass

        self._binary_paths[name] = None
        return None

    async def open_shell(self):
        if not self.is_connected:
            await self.connect()
        return await self._conn.create_process(
            request_pty=True,
            term_type="xterm-256color",
            term_size=(120, 32),
            encoding="utf-8",
        )


class SSHPool:
    """Mantiene conexiones SSH persistentes por host."""

    def __init__(self):
        self._connections: dict[str, SSHConnection] = {}

    async def get(self, profile: SSHProfile) -> SSHConnection:
        conn = self._connections.get(profile.id)
        if conn and conn.is_connected:
            return conn
        conn = SSHConnection(profile)
        await conn.connect()
        self._connections[profile.id] = conn
        return conn

    async def disconnect(self, profile_id: str):
        conn = self._connections.pop(profile_id, None)
        if conn:
            await conn.disconnect()

    async def disconnect_all(self):
        for conn in self._connections.values():
            await conn.disconnect()
        self._connections.clear()

    def status(self) -> dict[str, bool]:
        return {pid: conn.is_connected for pid, conn in self._connections.items()}


pool = SSHPool()
