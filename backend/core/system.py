"""Monitor de recursos del sistema remoto.

Detecta el OS al primer snapshot (Linux vs Darwin/macOS) y usa el
comando apropiado para cada uno. Linux usa /proc/* (rapido y exacto),
macOS usa vm_stat/sysctl/netstat (también rápidos).
"""
import re
import time
from dataclasses import dataclass, field, asdict
from typing import Optional
from .ssh import SSHConnection


# ----- Linux: lee /proc/* -----

SNAPSHOT_LINUX = r"""
echo '#CPU'
cat /proc/stat 2>/dev/null | head -1 || true
echo '#MEM'
cat /proc/meminfo 2>/dev/null | head -8 || true
echo '#LOAD'
cat /proc/loadavg 2>/dev/null || uptime
echo '#UPTIME'
cat /proc/uptime 2>/dev/null || true
echo '#DISK'
df -k 2>/dev/null | awk 'NR>1 && $1 ~ /^\// {print $1, $2, $3, $4, $6}'
echo '#NET'
cat /proc/net/dev 2>/dev/null | awk 'NR>2 {print $1, $2, $10}'
echo '#PROC'
ps -eo pid,user,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -16
echo '#END'
"""


# ----- macOS: vm_stat + sysctl + netstat -----

SNAPSHOT_MACOS = r"""
echo '#CPU'
top -l 1 -n 0 -s 0 2>/dev/null | grep -E '^CPU usage' || true
echo '#MEM'
sysctl -n hw.memsize 2>/dev/null
sysctl -n vm.swapusage 2>/dev/null
vm_stat 2>/dev/null
echo '#LOAD'
sysctl -n vm.loadavg 2>/dev/null
echo '#UPTIME'
sysctl -n kern.boottime 2>/dev/null
date +%s
echo '#DISK'
df -k 2>/dev/null | awk 'NR>1 && $1 ~ /^\// {print $1, $2, $3, $4, $NF}'
echo '#NET'
netstat -ibn 2>/dev/null | awk 'NR>1 && $1 !~ /^lo/ && $4 !~ /Link/ {print $1, $7, $10}' | sort -u
echo '#PROC'
ps -axo pid,user,pcpu,pmem,comm 2>/dev/null | sort -k3 -nr | head -16
echo '#END'
"""


@dataclass
class DiskUsage:
    device: str
    mount: str
    total_kb: int
    used_kb: int
    available_kb: int
    percent: float


@dataclass
class NetInterface:
    name: str
    rx_bytes: int
    tx_bytes: int


@dataclass
class ProcessInfo:
    pid: int
    user: str
    cpu_percent: float
    mem_percent: float
    command: str


@dataclass
class SystemSnapshot:
    timestamp: float
    os: str = "Unknown"
    cpu_percent: float = 0.0
    mem_used_bytes: int = 0
    mem_total_bytes: int = 0
    swap_used_bytes: int = 0
    swap_total_bytes: int = 0
    load_avg: tuple[float, float, float] = (0.0, 0.0, 0.0)
    uptime_seconds: int = 0
    disks: list[DiskUsage] = field(default_factory=list)
    net: list[NetInterface] = field(default_factory=list)
    top_processes: list[ProcessInfo] = field(default_factory=list)
    latency_ms: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


class SystemMonitor:
    """Captura snapshots periódicos. Soporta Linux y macOS."""

    def __init__(self, conn: SSHConnection):
        self.conn = conn
        self._os: Optional[str] = None  # "Linux" | "Darwin" | "Unknown"
        # Linux: para calcular CPU% por delta entre dos lecturas de /proc/stat
        self._last_cpu: Optional[tuple[int, int]] = None
        # macOS: page size por defecto
        self._mac_page_size: int = 16384

    async def snapshot(self) -> SystemSnapshot:
        if self._os is None:
            await self._detect_os()

        t0 = time.perf_counter()
        script = SNAPSHOT_MACOS if self._os == "Darwin" else SNAPSHOT_LINUX
        output = await self.conn.run(f"bash -c {_quote(script)}")
        latency_ms = (time.perf_counter() - t0) * 1000

        snap = SystemSnapshot(timestamp=time.time(), os=self._os or "Unknown", latency_ms=latency_ms)
        if self._os == "Darwin":
            self._parse_macos(output, snap)
        else:
            self._parse_linux(output, snap)
        return snap

    async def _detect_os(self):
        try:
            out = await self.conn.run("uname -s")
            self._os = out.strip() or "Linux"
        except Exception:
            self._os = "Linux"
        # En Mac también cacheamos el page size real (puede ser 4K o 16K)
        if self._os == "Darwin":
            try:
                out = await self.conn.run("sysctl -n hw.pagesize")
                self._mac_page_size = int(out.strip())
            except Exception:
                self._mac_page_size = 16384

    # ---------- Linux parser ----------

    def _parse_linux(self, output: str, snap: SystemSnapshot):
        sections = _split_sections(output)

        # CPU (delta entre lecturas para %)
        cpu_line = sections.get("CPU", "").strip()
        if cpu_line.startswith("cpu"):
            parts = cpu_line.split()
            if len(parts) >= 5:
                user_t = int(parts[1])
                nice_t = int(parts[2])
                sys_t = int(parts[3])
                idle_t = int(parts[4])
                iowait = int(parts[5]) if len(parts) > 5 else 0
                irq = int(parts[6]) if len(parts) > 6 else 0
                softirq = int(parts[7]) if len(parts) > 7 else 0
                idle_total = idle_t + iowait
                non_idle = user_t + nice_t + sys_t + irq + softirq
                total = idle_total + non_idle
                if self._last_cpu is not None:
                    prev_total, prev_idle = self._last_cpu
                    dt = total - prev_total
                    di = idle_total - prev_idle
                    if dt > 0:
                        snap.cpu_percent = max(0.0, min(100.0, 100.0 * (dt - di) / dt))
                self._last_cpu = (total, idle_total)

        # MEM
        mem_avail = None
        swap_free = None
        for line in sections.get("MEM", "").splitlines():
            m = re.match(r"^(\w+):\s+(\d+)\s+kB", line)
            if not m:
                continue
            key, kb = m.group(1), int(m.group(2)) * 1024
            if key == "MemTotal":
                snap.mem_total_bytes = kb
            elif key == "MemAvailable":
                mem_avail = kb
            elif key == "SwapTotal":
                snap.swap_total_bytes = kb
            elif key == "SwapFree":
                swap_free = kb
        if mem_avail is not None:
            snap.mem_used_bytes = max(0, snap.mem_total_bytes - mem_avail)
        if swap_free is not None:
            snap.swap_used_bytes = max(0, snap.swap_total_bytes - swap_free)

        # LOAD
        m = re.match(r"([\d.]+)\s+([\d.]+)\s+([\d.]+)", sections.get("LOAD", "").strip())
        if m:
            snap.load_avg = (float(m.group(1)), float(m.group(2)), float(m.group(3)))

        # UPTIME
        up = sections.get("UPTIME", "").strip().split()
        if up:
            try:
                snap.uptime_seconds = int(float(up[0]))
            except ValueError:
                pass

        self._parse_disk(sections.get("DISK", ""), snap)
        self._parse_net(sections.get("NET", ""), snap, strip_colon=True)
        self._parse_proc(sections.get("PROC", ""), snap)

    # ---------- macOS parser ----------

    def _parse_macos(self, output: str, snap: SystemSnapshot):
        sections = _split_sections(output)

        # CPU — output como: "CPU usage: 5.23% user, 3.45% sys, 91.32% idle"
        m = re.search(
            r"([\d.]+)%\s*user.*?([\d.]+)%\s*sys.*?([\d.]+)%\s*idle",
            sections.get("CPU", ""),
        )
        if m:
            user = float(m.group(1))
            sysp = float(m.group(2))
            snap.cpu_percent = max(0.0, min(100.0, user + sysp))

        # MEM — orden: línea 1=memsize bytes, línea 2=vm.swapusage, resto=vm_stat
        mem_lines = sections.get("MEM", "").strip().splitlines()
        if mem_lines:
            try:
                snap.mem_total_bytes = int(mem_lines[0].strip())
            except ValueError:
                pass

        # Swap: "total = 2048.00M  used = 256.00M  free = 1792.00M  (encrypted)"
        swap_text = "\n".join(mem_lines[1:3])
        sm = re.search(r"total\s*=\s*([\d.]+)([KMG])", swap_text)
        if sm:
            snap.swap_total_bytes = int(_parse_size(sm.group(1), sm.group(2)))
        sm = re.search(r"used\s*=\s*([\d.]+)([KMG])", swap_text)
        if sm:
            snap.swap_used_bytes = int(_parse_size(sm.group(1), sm.group(2)))

        # vm_stat: páginas — calculamos used = (active + wired + compressed) * page_size
        page = self._mac_page_size
        active = wired = compressed = 0
        for line in mem_lines:
            line = line.strip()
            m = re.match(r"^Pages active:\s+(\d+)\.?", line)
            if m:
                active = int(m.group(1))
                continue
            m = re.match(r"^Pages wired down:\s+(\d+)\.?", line)
            if m:
                wired = int(m.group(1))
                continue
            m = re.match(r"^Pages occupied by compressor:\s+(\d+)\.?", line)
            if m:
                compressed = int(m.group(1))
                continue
        if snap.mem_total_bytes > 0:
            snap.mem_used_bytes = (active + wired + compressed) * page

        # LOAD: sysctl -n vm.loadavg devuelve "{ 2.49 2.61 2.54 }"
        m = re.search(r"([\d.]+)\s+([\d.]+)\s+([\d.]+)", sections.get("LOAD", ""))
        if m:
            snap.load_avg = (float(m.group(1)), float(m.group(2)), float(m.group(3)))

        # UPTIME: línea 1 = "{ sec = N, usec = ... }", línea 2 = epoch actual
        up_text = sections.get("UPTIME", "").strip().splitlines()
        boot_sec = None
        m = re.search(r"sec\s*=\s*(\d+)", up_text[0] if up_text else "")
        if m:
            boot_sec = int(m.group(1))
        if boot_sec and len(up_text) >= 2:
            try:
                now = int(up_text[1].strip())
                snap.uptime_seconds = max(0, now - boot_sec)
            except ValueError:
                pass

        self._parse_disk(sections.get("DISK", ""), snap)
        self._parse_net(sections.get("NET", ""), snap, strip_colon=False)
        self._parse_proc(sections.get("PROC", ""), snap)

    # ---------- Comunes (df, ps con flags compatibles, net del awk) ----------

    def _parse_disk(self, text: str, snap: SystemSnapshot):
        for line in text.splitlines():
            parts = line.strip().split(None, 4)
            if len(parts) < 5:
                continue
            device, total, used, avail, mount = parts
            try:
                total_kb = int(total)
                used_kb = int(used)
                avail_kb = int(avail)
                pct = 100.0 * used_kb / total_kb if total_kb else 0.0
                snap.disks.append(
                    DiskUsage(device, mount, total_kb, used_kb, avail_kb, pct)
                )
            except ValueError:
                continue

    def _parse_net(self, text: str, snap: SystemSnapshot, *, strip_colon: bool):
        seen = set()
        for line in text.splitlines():
            parts = line.strip().split()
            if len(parts) < 3:
                continue
            name = parts[0].rstrip(":") if strip_colon else parts[0]
            if name in ("lo", "lo0") or name in seen:
                continue
            try:
                snap.net.append(NetInterface(name, int(parts[1]), int(parts[2])))
                seen.add(name)
            except ValueError:
                continue

    def _parse_proc(self, text: str, snap: SystemSnapshot):
        for line in text.splitlines()[1:]:  # skip header
            parts = line.strip().split(None, 4)
            if len(parts) < 5:
                continue
            try:
                snap.top_processes.append(
                    ProcessInfo(
                        pid=int(parts[0]),
                        user=parts[1],
                        cpu_percent=float(parts[2]),
                        mem_percent=float(parts[3]),
                        command=parts[4],
                    )
                )
            except ValueError:
                continue


# ---------- helpers ----------

def _split_sections(output: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    current = None
    buffer: list[str] = []
    for line in output.splitlines():
        if line.startswith("#"):
            if current is not None:
                sections[current] = "\n".join(buffer)
            current = line[1:].strip()
            buffer = []
        elif current is not None:
            buffer.append(line)
    if current is not None and current != "END":
        sections[current] = "\n".join(buffer)
    return sections


def _quote(s: str) -> str:
    return "'" + s.replace("'", "'\\''") + "'"


def _parse_size(value: str, unit: str) -> float:
    multipliers = {"K": 1024, "M": 1024**2, "G": 1024**3, "T": 1024**4}
    return float(value) * multipliers.get(unit.upper(), 1)
