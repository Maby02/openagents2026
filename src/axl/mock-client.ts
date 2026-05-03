import type { TopologyResponse } from "./client.ts";

interface InboxEntry {
  from: string;
  body: Buffer;
}

// Process-local message broker that mimics enough of AXL's wire semantics for
// `sibyl demo` to run a virtual mesh in one process. Every node has a single
// inbox; sendTo enqueues into the recipient's inbox; recv dequeues from this
// node's inbox. Same single-consumer guarantee as real AXL's /recv.
export class InMemoryBroker {
  private readonly inboxes = new Map<string, InboxEntry[]>();

  enqueue(to: string, from: string, body: Buffer | string): void {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const arr = this.inboxes.get(to);
    if (arr) arr.push({ from, body: buf });
    else this.inboxes.set(to, [{ from, body: buf }]);
  }

  dequeue(self: string): InboxEntry | null {
    return this.inboxes.get(self)?.shift() ?? null;
  }
}

export interface MockAxlClientOptions {
  selfPubkey: string;
  peers: string[];        // peers exposed via /topology
  broker: InMemoryBroker;
}

// Drop-in stand-in for AxlClient with the methods GossipNode actually uses
// (getTopology, recv, sendTo). Field shapes match so it satisfies AxlClient
// structurally — GossipNode accepts it without a wider interface refactor.
export class MockAxlClient {
  public readonly apiPort: number = 0;
  public readonly host: string = "mock";

  constructor(private readonly opts: MockAxlClientOptions) {}

  async getTopology(_timeoutMs?: number): Promise<TopologyResponse> {
    return {
      our_public_key: this.opts.selfPubkey,
      our_ipv6: "200:mock::1",
      peers: [...this.opts.peers],
      tree: [],
    };
  }

  async ping(_timeoutMs?: number): Promise<boolean> {
    return true;
  }

  async recv(_timeoutMs?: number): Promise<{ from: string; body: Buffer } | null> {
    return this.opts.broker.dequeue(this.opts.selfPubkey);
  }

  async sendTo(peerIdHex: string, body: Buffer | string, _timeoutMs?: number): Promise<void> {
    if (peerIdHex === this.opts.selfPubkey) return;
    this.opts.broker.enqueue(peerIdHex, this.opts.selfPubkey, body);
  }
}
