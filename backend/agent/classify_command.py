"""Hook PreToolUse — clasifica el comando que Claude quiere correr en el host.

Lo invoca Claude Code antes de cada uso de `mcp__sshpanel__run_command`, pasando
JSON por stdin. Devolvemos una decisión de permiso por stdout:

  - comando destructivo / importante  -> "ask"   (fuerza confirmación del usuario)
  - comando de lectura / inocuo        -> "allow" (corre sin fricción)

Es la red de seguridad extra del requisito "siempre con confirmación de cosas
importantes". Es **standalone** a propósito (solo stdlib): se ejecuta por ruta
absoluta o como subcomando del sidecar, sin depender del paquete `backend`.
"""
import json
import re
import sys

# Patrones que consideramos "importantes" → requieren confirmación.
# Curados para cubrir lo destructivo sin volver insoportable la lectura.
_DANGEROUS = [
    r"\brm\b",
    r"\brmdir\b",
    r"\bdd\b",
    r"\bmkfs\b",
    r"\bfdisk\b",
    r"\bparted\b",
    r"\bmount\b",
    r"\bumount\b",
    r"\bshutdown\b",
    r"\breboot\b",
    r"\bhalt\b",
    r"\bpoweroff\b",
    r"\binit\s+[06]\b",
    r"\bkill\b",
    r"\bpkill\b",
    r"\bkillall\b",
    r"\bsystemctl\s+(stop|restart|disable|mask|kill|reload)",
    r"\bservice\s+\S+\s+(stop|restart)",
    r"\bdocker\s+(rm|rmi|kill|stop|down|prune)",
    r"\bdocker\s+system\s+prune",
    r"\bdocker\s+compose\s+(down|rm|stop)",
    r"\b(apt|apt-get|yum|dnf|apk|pacman|zypper)\b.*\b(install|remove|purge|upgrade|update)",
    r"\b(pip|pip3|npm|pnpm|yarn|cargo|gem)\s+(install|uninstall|remove|add)",
    r"\buseradd\b|\buserdel\b|\busermod\b|\bgroupadd\b",
    r"\bpasswd\b",
    r"\bchmod\s+-R\b|\bchown\s+-R\b",
    r"\bchmod\b|\bchown\b",
    r"\bmv\b",
    r"\btruncate\b",
    r"\btee\b",
    r"\bcrontab\b",
    r"\biptables\b|\bufw\b|\bnft\b",
    r"\bgit\s+(reset|clean|checkout\s+--|push\s+-f|push\s+--force)",
    r"\bln\s+-s",
    r">\s*/",          # redirección sobreescribiendo una ruta absoluta
    r"\bcurl\b.*\|\s*(sh|bash)",
    r"\bwget\b.*\|\s*(sh|bash)",
]

_DANGEROUS_RE = re.compile("|".join(_DANGEROUS), re.IGNORECASE)


def is_dangerous(command: str) -> bool:
    if not command:
        return False
    return bool(_DANGEROUS_RE.search(command))


def _decision(command: str) -> dict:
    if is_dangerous(command):
        return {
            "permissionDecision": "ask",
            "permissionDecisionReason": (
                "Comando potencialmente destructivo o que modifica el sistema — "
                "se pide confirmación."
            ),
        }
    return {
        "permissionDecision": "allow",
        "permissionDecisionReason": "Comando de lectura/inocuo — permitido automáticamente.",
    }


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        # Sin input parseable, no decidimos nada: dejamos seguir el flujo normal.
        sys.exit(0)

    tool_input = payload.get("tool_input") or {}
    command = tool_input.get("command", "") if isinstance(tool_input, dict) else ""

    decision = _decision(command)
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            **decision,
        }
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
