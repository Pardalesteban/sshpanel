"""PTY local cross-platform para correr Claude Code con una TTY real.

Claude Code necesita una terminal interactiva (TUI). Abstraemos un pseudo-terminal:
  - Windows: pywinpty (ConPTY).
  - Unix:    stdlib `pty` + `subprocess` (sin dependencias extra).

La API es async-friendly: las llamadas bloqueantes corren en el executor del loop,
para integrarse con el WebSocket igual que `backend/api/terminal.py` hace con asyncssh.
"""
import asyncio
import os
import platform
from typing import Optional

IS_WINDOWS = platform.system() == "Windows"


class PtyProcess:
    """Wrapper unificado sobre un PTY local con un proceso hijo adentro."""

    def __init__(self):
        self._loop = asyncio.get_event_loop()
        self._closed = False
        # Backend Windows
        self._win = None
        # Backend Unix
        self._master_fd: Optional[int] = None
        self._proc = None

    # --- Construcción ---

    @classmethod
    async def spawn(
        cls,
        argv: list[str],
        cwd: Optional[str] = None,
        env: Optional[dict] = None,
        cols: int = 120,
        rows: int = 32,
    ) -> "PtyProcess":
        self = cls()
        full_env = {**os.environ, **(env or {})}
        if IS_WINDOWS:
            self._spawn_windows(argv, cwd, full_env, cols, rows)
        else:
            self._spawn_unix(argv, cwd, full_env, cols, rows)
        return self

    def _spawn_windows(self, argv, cwd, env, cols, rows):
        from winpty import PtyProcess as WinPty  # pywinpty

        # winpty espera un comando como string (o lista). Pasamos la lista.
        self._win = WinPty.spawn(
            argv,
            cwd=cwd,
            env=env,
            dimensions=(rows, cols),
        )

    def _spawn_unix(self, argv, cwd, env, cols, rows):
        import pty
        import subprocess

        master_fd, slave_fd = pty.openpty()
        self._set_winsize_unix(master_fd, cols, rows)
        self._proc = subprocess.Popen(
            argv,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=cwd,
            env=env,
            close_fds=True,
            start_new_session=True,
        )
        os.close(slave_fd)
        self._master_fd = master_fd

    # --- I/O ---

    async def read(self) -> Optional[str]:
        """Lee un chunk del PTY. Devuelve None en EOF."""
        if self._closed:
            return None
        if IS_WINDOWS:
            return await self._loop.run_in_executor(None, self._read_windows)
        return await self._loop.run_in_executor(None, self._read_unix)

    def _read_windows(self) -> Optional[str]:
        try:
            data = self._win.read(4096)  # str
            if data == "":
                return None
            return data
        except EOFError:
            return None
        except Exception:
            return None

    def _read_unix(self) -> Optional[str]:
        try:
            data = os.read(self._master_fd, 4096)
            if not data:
                return None
            return data.decode("utf-8", errors="replace")
        except (OSError, ValueError):
            return None

    def write(self, data: str):
        if self._closed:
            return
        try:
            if IS_WINDOWS:
                self._win.write(data)
            else:
                os.write(self._master_fd, data.encode("utf-8", errors="replace"))
        except Exception:
            pass

    def resize(self, cols: int, rows: int):
        if self._closed:
            return
        try:
            if IS_WINDOWS:
                self._win.setwinsize(rows, cols)
            else:
                self._set_winsize_unix(self._master_fd, cols, rows)
        except Exception:
            pass

    @staticmethod
    def _set_winsize_unix(fd: int, cols: int, rows: int):
        import fcntl
        import struct
        import termios

        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

    # --- Cierre ---

    def close(self):
        if self._closed:
            return
        self._closed = True
        try:
            if IS_WINDOWS:
                if self._win is not None and self._win.isalive():
                    self._win.terminate(force=True)
            else:
                if self._proc is not None and self._proc.poll() is None:
                    self._proc.terminate()
                if self._master_fd is not None:
                    os.close(self._master_fd)
        except Exception:
            pass
