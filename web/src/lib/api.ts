export interface Host {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  tags: string;
  connected: boolean;
}

export interface HostCreate {
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  sudo_password?: string;
  private_key_path?: string;
  tags?: string;
}

// En el desktop (Tauri) el frontend se sirve desde el protocolo de assets
// (tauri.localhost), así que las URLs relativas NUNCA llegan al sidecar —
// Tauri devuelve index.html como fallback SPA y el JSON.parse explota con
// "Unexpected token '<'". Detectamos Tauri y apuntamos al backend explícito.
// El sidecar escucha en 127.0.0.1:8080 (SSHPANEL_PORT default del entrypoint).
const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const BACKEND = IS_TAURI ? "http://127.0.0.1:8080" : "";

const API = `${BACKEND}/api`;

/** URL absoluta hacia el backend para fetch() fuera del wrapper `request`. */
export function apiUrl(path: string): string {
  return `${BACKEND}${path}`;
}

/** URL de WebSocket hacia el backend. `path` debe empezar con `/api/...`. */
export function wsUrl(path: string): string {
  if (IS_TAURI) return `ws://127.0.0.1:8080${path}`;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

export class APIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.detail ?? message;
    } catch {}
    throw new APIError(message, res.status);
  }
  return res.json();
}

export const api = {
  listHosts: () => request<Host[]>("/hosts/"),
  createHost: (data: HostCreate) =>
    request<Host>("/hosts/", { method: "POST", body: JSON.stringify(data) }),
  updateHost: (id: string, data: Partial<HostCreate>) =>
    request<Host>(`/hosts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteHost: (id: string) =>
    request<{ ok: boolean }>(`/hosts/${id}`, { method: "DELETE" }),
  connectHost: (id: string) =>
    request<{ ok: boolean; connected: boolean }>(`/hosts/${id}/connect`, {
      method: "POST",
    }),
  disconnectHost: (id: string) =>
    request<{ ok: boolean; connected: boolean }>(`/hosts/${id}/disconnect`, {
      method: "POST",
    }),
  testConnection: (data: {
    host: string;
    port: number;
    username: string;
    password?: string;
    private_key_path?: string;
    host_id?: string;
  }) =>
    request<{ ok: boolean; uname?: string | null; error?: string }>(
      "/hosts/test",
      { method: "POST", body: JSON.stringify(data) }
    ),
  execCommand: (id: string, command: string) =>
    request<ExecResult>(`/hosts/${id}/exec`, {
      method: "POST",
      body: JSON.stringify({ command }),
    }),
  health: () => request<{ status: string; version: string }>("/health"),

  // --- Docker ---
  listContainers: (hostId: string, all = false) =>
    request<DockerContainer[]>(
      `/hosts/${hostId}/docker/containers?all=${all}`
    ),
  startContainer: (hostId: string, containerId: string) =>
    request<{ output: string }>(
      `/hosts/${hostId}/docker/containers/${containerId}/start`,
      { method: "POST" }
    ),
  stopContainer: (hostId: string, containerId: string) =>
    request<{ output: string }>(
      `/hosts/${hostId}/docker/containers/${containerId}/stop`,
      { method: "POST" }
    ),
  restartContainer: (hostId: string, containerId: string) =>
    request<{ output: string }>(
      `/hosts/${hostId}/docker/containers/${containerId}/restart`,
      { method: "POST" }
    ),

  // --- Overview (multi-host) ---
  overview: () => request<{ hosts: HostOverview[] }>("/overview/"),

  // --- SSH Keys ---
  keyStatus: (hostId: string) =>
    request<KeyStatus>(`/hosts/${hostId}/keys/status`),
  installKey: (hostId: string, body: { generate?: boolean; public_key?: string; comment?: string }) =>
    request<InstallKeyResult>(`/hosts/${hostId}/keys/install`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteLocalKey: (hostId: string) =>
    request<{ ok: boolean; deleted: boolean }>(`/hosts/${hostId}/keys/local`, {
      method: "DELETE",
    }),

  // --- Compose ---
  composeProjects: (hostId: string) =>
    request<ComposeProject[]>(`/hosts/${hostId}/compose/projects`),
  composeServices: (hostId: string, name: string, files: string[]) =>
    request<ComposeService[]>(
      `/hosts/${hostId}/compose/projects/${encodeURIComponent(name)}/services?files=${encodeURIComponent(files.join("|"))}`
    ),
  composeConfig: (hostId: string, name: string, files: string[]) =>
    request<{ yaml: string }>(
      `/hosts/${hostId}/compose/projects/${encodeURIComponent(name)}/config?files=${encodeURIComponent(files.join("|"))}`
    ),

  // --- System ---
  killProcess: (
    hostId: string,
    pid: number,
    opts: { signal?: "TERM" | "KILL" | "HUP" | "INT"; sudo?: boolean } = {}
  ) =>
    request<{ ok: boolean; pid: number; signal: string; sudo: boolean }>(
      `/hosts/${hostId}/system/kill`,
      {
        method: "POST",
        body: JSON.stringify({
          pid,
          signal: opts.signal ?? "TERM",
          sudo: opts.sudo ?? false,
        }),
      }
    ),
};

export interface DockerContainer {
  ID: string;
  Image: string;
  Names: string;
  State: string;
  Status: string;
  Ports: string;
  CreatedAt?: string;
}

export interface ContainerStats {
  id: string;
  name: string;
  cpu_percent: number;
  mem_percent: number;
  mem_used_bytes: number;
  mem_limit_bytes: number;
  net_rx_bytes: number;
  net_tx_bytes: number;
  block_rx_bytes: number;
  block_tx_bytes: number;
  pids: number;
}

export interface ExecResult {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface DiskUsage {
  device: string;
  mount: string;
  total_kb: number;
  used_kb: number;
  available_kb: number;
  percent: number;
}

export interface NetInterface {
  name: string;
  rx_bytes: number;
  tx_bytes: number;
}

export interface ProcessInfo {
  pid: number;
  user: string;
  cpu_percent: number;
  mem_percent: number;
  command: string;
}

export interface ComposeProject {
  Name: string;
  Status: string;
  ConfigFiles: string;
}

export interface ComposeService {
  Name: string;
  Service?: string;
  Image?: string;
  State?: string;
  Status?: string;
  Health?: string;
  Publishers?: Array<{
    URL?: string;
    TargetPort?: number;
    PublishedPort?: number;
    Protocol?: string;
  }>;
}

export type ComposeAction = "up" | "down" | "restart" | "pull" | "stop" | "start";

export interface KeyStatus {
  has_local_key: boolean;
  public_key: string | null;
  fingerprint: string | null;
  in_use_by_host: boolean;
}

export interface InstallKeyResult {
  ok: boolean;
  generated: boolean;
  public_key: string;
  fingerprint: string;
  message: string;
}

export interface HostOverview {
  host_id: string;
  name: string;
  host: string;
  username: string;
  connected: boolean;
  error: string | null;
  os: string | null;
  cpu_percent: number;
  mem_used_bytes: number;
  mem_total_bytes: number;
  mem_percent: number;
  load_avg: [number, number, number];
  uptime_seconds: number;
  latency_ms: number;
  docker_available: boolean;
  containers_running: number;
  containers_total: number;
}

export interface SystemSnapshot {
  timestamp: number;
  os: string;
  cpu_percent: number;
  mem_used_bytes: number;
  mem_total_bytes: number;
  swap_used_bytes: number;
  swap_total_bytes: number;
  load_avg: [number, number, number];
  uptime_seconds: number;
  disks: DiskUsage[];
  net: NetInterface[];
  top_processes: ProcessInfo[];
  latency_ms: number;
}
