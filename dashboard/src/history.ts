/** Espelha o shape de InMemoryMetricsCollector.snapshot() do @herald/sdk. */
export interface MetricsSnapshot {
  requestsByAgent: Record<string, number>;
  decisionsByResult: Record<string, number>;
  formatsServed: Record<string, number>;
  errorsByAgent: Record<string, number>;
  averageLatencyMs: number;
  sampleCount: number;
}

export interface MetricsHistoryEntry {
  fetchedAt: string;
  data: MetricsSnapshot | null;
  error?: string;
}

/**
 * Ring buffer em memória do histórico de snapshots por Gateway (últimas N amostras,
 * alimentado pelo poller de dashboard/src/server.ts). Não persiste entre restarts —
 * mesma limitação já documentada pro InMemoryMetricsCollector do Gateway.
 */
export class MetricsHistoryStore {
  private buffers = new Map<string, MetricsHistoryEntry[]>();

  constructor(private readonly maxSize: number) {}

  record(gatewayName: string, entry: MetricsHistoryEntry): void {
    const buffer = this.buffers.get(gatewayName) ?? [];
    buffer.push(entry);
    if (buffer.length > this.maxSize) buffer.splice(0, buffer.length - this.maxSize);
    this.buffers.set(gatewayName, buffer);
  }

  snapshot(): Record<string, MetricsHistoryEntry[]> {
    return Object.fromEntries([...this.buffers.entries()].map(([name, buf]) => [name, [...buf]]));
  }
}
