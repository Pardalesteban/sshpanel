/**
 * Store muy chico para compartir la latencia más reciente por host
 * entre el SystemPanel (productor) y el Sidebar (consumidor).
 * Sin Redux ni context — solo un Map + listeners.
 */
type Listener = (latencies: Map<string, number>) => void;

const latencies = new Map<string, number>();
const listeners = new Set<Listener>();

export function setLatency(hostId: string, ms: number) {
  latencies.set(hostId, ms);
  listeners.forEach((l) => l(new Map(latencies)));
}

export function clearLatency(hostId: string) {
  if (latencies.delete(hostId)) {
    listeners.forEach((l) => l(new Map(latencies)));
  }
}

export function subscribeLatencies(l: Listener): () => void {
  listeners.add(l);
  l(new Map(latencies));
  return () => listeners.delete(l);
}
