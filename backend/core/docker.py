import json
import shlex
from typing import AsyncGenerator
from .ssh import SSHConnection

shlex_quote = shlex.quote


class DockerManager:
    """Wrapper de comandos docker via SSH.

    Busca el binario `docker` en el remoto (cache) y usa su path absoluto,
    así no depende del PATH del login shell — funciona en Mac/Homebrew,
    Linux estándar, snap, etc.
    """

    def __init__(self, conn: SSHConnection):
        self.conn = conn

    async def _docker(self) -> str:
        path = await self.conn.find_binary("docker")
        if not path:
            raise RuntimeError("docker: command not found")
        return path

    async def _run(self, command: str) -> str:
        docker = await self._docker()
        # Reemplaza la primera ocurrencia de "docker" por el path absoluto
        command = command.replace("docker", docker, 1)
        return await self.conn.run(command)

    async def list_containers(self, all: bool = False) -> list[dict]:
        flag = "-a" if all else ""
        output = await self._run(
            f"docker ps {flag} --format '{{{{json .}}}}'"
        )
        return [json.loads(line) for line in output.strip().splitlines() if line]

    async def inspect(self, container_id: str) -> dict:
        output = await self._run(f"docker inspect {shlex_quote(container_id)}")
        return json.loads(output)[0]

    async def start(self, container_id: str) -> str:
        return await self._run(f"docker start {shlex_quote(container_id)}")

    async def stop(self, container_id: str) -> str:
        return await self._run(f"docker stop {shlex_quote(container_id)}")

    async def restart(self, container_id: str) -> str:
        return await self._run(f"docker restart {shlex_quote(container_id)}")

    async def remove(self, container_id: str, force: bool = False) -> str:
        flag = "-f" if force else ""
        return await self._run(f"docker rm {flag} {shlex_quote(container_id)}")

    async def _stream(self, command: str) -> AsyncGenerator[str, None]:
        docker = await self._docker()
        command = command.replace("docker", docker, 1)
        async for line in self.conn.stream(command):
            yield line

    async def stream_logs(self, container_id: str, tail: int = 100) -> AsyncGenerator[str, None]:
        async for line in self._stream(
            f"docker logs -f --tail={int(tail)} {shlex_quote(container_id)}"
        ):
            yield line

    async def exec(self, container_id: str, command: str) -> str:
        return await self._run(f"docker exec {shlex_quote(container_id)} {command}")

    async def list_images(self) -> list[dict]:
        output = await self._run("docker images --format '{{json .}}'")
        return [json.loads(line) for line in output.strip().splitlines() if line]

    async def pull(self, image: str) -> AsyncGenerator[str, None]:
        async for line in self._stream(f"docker pull {shlex_quote(image)}"):
            yield line

    async def compose_up(self, path: str, detach: bool = True) -> AsyncGenerator[str, None]:
        flag = "-d" if detach else ""
        async for line in self._stream(
            f"docker compose -f {shlex_quote(path)} up {flag}"
        ):
            yield line

    async def compose_down(self, path: str) -> AsyncGenerator[str, None]:
        async for line in self._stream(
            f"docker compose -f {shlex_quote(path)} down"
        ):
            yield line

    # --- Compose v2 (descubrimiento + acciones genéricas) ---

    async def compose_ls(self, all: bool = True) -> list[dict]:
        """Lista todos los proyectos compose conocidos por el daemon.
        Cada item: {Name, Status, ConfigFiles}.
        """
        flag = "--all" if all else ""
        try:
            output = await self._run(f"docker compose ls {flag} --format json")
        except RuntimeError as e:
            # Compose v1 (legacy) o muy viejo — devolvemos lista vacía
            if "is not a docker command" in str(e).lower() or "unknown command" in str(e).lower():
                return []
            raise
        # En algunas versiones devuelve un JSON array entero, en otras NDJSON
        out = output.strip()
        if not out:
            return []
        if out.startswith("["):
            return json.loads(out)
        return [json.loads(line) for line in out.splitlines() if line.strip()]

    def _files_flags(self, files: list[str]) -> str:
        """Genera la lista de `-f path1 -f path2 ...` para los compose files."""
        return " ".join(f"-f {shlex_quote(f)}" for f in files if f)

    async def compose_ps(self, name: str, files: list[str]) -> list[dict]:
        """Servicios (containers) de un proyecto."""
        flags = self._files_flags(files)
        cmd = f"docker compose -p {shlex_quote(name)} {flags} ps -a --format json"
        output = await self._run(cmd)
        out = output.strip()
        if not out:
            return []
        if out.startswith("["):
            return json.loads(out)
        return [json.loads(line) for line in out.splitlines() if line.strip()]

    async def compose_config(self, name: str, files: list[str]) -> str:
        """YAML resuelto del proyecto (interpolación de env + merges aplicados)."""
        flags = self._files_flags(files)
        return await self._run(
            f"docker compose -p {shlex_quote(name)} {flags} config"
        )

    async def compose_action_stream(
        self,
        name: str,
        files: list[str],
        action: str,  # up | down | restart | pull | stop | start
        extra: str = "",
    ) -> AsyncGenerator[str, None]:
        """Ejecuta una acción de compose con streaming de stdout+stderr.
        El frontend muestra el log en vivo. extra para flags extra (ej. '-d').
        """
        flags = self._files_flags(files)
        cmd = (
            f"docker compose -p {shlex_quote(name)} {flags} {action} {extra} 2>&1"
        )
        async for line in self._stream(cmd):
            yield line

    async def stats(self, container_id: str = "") -> list[dict]:
        target = shlex_quote(container_id) if container_id else "--all"
        output = await self._run(
            f"docker stats {target} --no-stream --format '{{{{json .}}}}'"
        )
        return [json.loads(line) for line in output.strip().splitlines() if line]

    async def stats_parsed(self, container_id: str = "") -> list[dict]:
        """docker stats con campos numéricos parseados — listos para frontend."""
        raw = await self.stats(container_id)
        return [_parse_stat(r) for r in raw]


def _parse_percent(s: str) -> float:
    try:
        return float(s.strip().rstrip("%"))
    except (ValueError, AttributeError):
        return 0.0


_UNITS = {
    "B": 1,
    "KB": 1000, "KIB": 1024,
    "MB": 1000**2, "MIB": 1024**2,
    "GB": 1000**3, "GIB": 1024**3,
    "TB": 1000**4, "TIB": 1024**4,
    "K": 1024, "M": 1024**2, "G": 1024**3, "T": 1024**4,
}


def _parse_bytes(s: str) -> int:
    s = s.strip()
    if not s:
        return 0
    i = 0
    while i < len(s) and (s[i].isdigit() or s[i] in ".-"):
        i += 1
    try:
        num = float(s[:i])
    except ValueError:
        return 0
    unit = s[i:].strip().upper()
    return int(num * _UNITS.get(unit, 1))


def _parse_pair(s: str) -> tuple[int, int]:
    # "1.5MiB / 1.952GiB"  → (used, limit)
    if "/" not in s:
        return 0, 0
    a, b = s.split("/", 1)
    return _parse_bytes(a), _parse_bytes(b)


def _parse_stat(r: dict) -> dict:
    mem_used, mem_limit = _parse_pair(r.get("MemUsage", ""))
    net_rx, net_tx = _parse_pair(r.get("NetIO", ""))
    blk_rx, blk_tx = _parse_pair(r.get("BlockIO", ""))
    try:
        pids = int(r.get("PIDs", "0"))
    except ValueError:
        pids = 0
    return {
        "id": r.get("ID") or r.get("Container", ""),
        "name": r.get("Name", ""),
        "cpu_percent": _parse_percent(r.get("CPUPerc", "0")),
        "mem_percent": _parse_percent(r.get("MemPerc", "0")),
        "mem_used_bytes": mem_used,
        "mem_limit_bytes": mem_limit,
        "net_rx_bytes": net_rx,
        "net_tx_bytes": net_tx,
        "block_rx_bytes": blk_rx,
        "block_tx_bytes": blk_tx,
        "pids": pids,
    }
