import axios, { AxiosError } from "axios";

export interface TopologyResponse {
  our_public_key: string;
  our_ipv6: string;
  peers: unknown[];
  tree: unknown[];
}

export class AxlClient {
  constructor(public readonly apiPort: number, public readonly host = "127.0.0.1") {}

  private get baseUrl(): string {
    return `http://${this.host}:${this.apiPort}`;
  }

  async getTopology(timeoutMs = 1500): Promise<TopologyResponse> {
    const res = await axios.get<TopologyResponse>(`${this.baseUrl}/topology`, { timeout: timeoutMs });
    return res.data;
  }

  async ping(timeoutMs = 800): Promise<boolean> {
    try {
      await this.getTopology(timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  // GET /recv — single-consumer FIFO inbox. Returns null when nothing is
  // waiting. Real AXL returns 204 (No Content) for an empty inbox; the test
  // fake returns 200 with empty body. We accept both. Throws on connection
  // failure so the caller can backoff. Only the gossip layer should call this;
  // never call from anywhere else or the two consumers will fight over messages.
  async recv(timeoutMs = 5000): Promise<{ from: string; body: Buffer } | null> {
    try {
      const res = await axios.get(`${this.baseUrl}/recv`, {
        timeout: timeoutMs,
        responseType: "arraybuffer",
        validateStatus: (s) => s === 200 || s === 204,
      });
      if (res.status === 204) return null;
      const buf = Buffer.from(res.data as ArrayBuffer);
      if (buf.length === 0) return null;
      const from = res.headers["x-from-peer-id"];
      if (typeof from !== "string" || from.length !== 64) return null;
      return { from, body: buf };
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.code === "ECONNREFUSED") {
        throw new Error(`AXL node not reachable at ${this.baseUrl}`);
      }
      throw err;
    }
  }

  // Fire-and-forget message to a peer. AXL returns no body from the remote side.
  // 502 from /send means the peer is known but the Yggdrasil route isn't ready
  // yet (common during the first few seconds after a fresh handshake), so we
  // retry with backoff up to ~3.5s before giving up.
  async sendTo(peerIdHex: string, body: Buffer | string, timeoutMs = 5000): Promise<void> {
    if (peerIdHex.length !== 64) {
      throw new Error(`expected 64-char hex peer id, got ${peerIdHex.length} chars`);
    }
    const backoffsMs = [0, 250, 750, 1500];
    let lastErr: Error | null = null;
    for (const delay of backoffsMs) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      try {
        await axios.post(`${this.baseUrl}/send`, body, {
          headers: {
            "X-Destination-Peer-Id": peerIdHex,
            "Content-Type": "application/octet-stream",
          },
          timeout: timeoutMs,
          transformRequest: [(d) => d],
        });
        return;
      } catch (err) {
        const ax = err as AxiosError;
        if (ax.code === "ECONNREFUSED") {
          throw new Error(`AXL node not reachable at ${this.baseUrl} — is it running?`);
        }
        // Retry on 502 (route not ready) and 5xx (transient backend errors).
        const status = ax.response?.status;
        if (status && status >= 400 && status < 500 && status !== 502) {
          throw err; // permanent client error — don't retry
        }
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastErr ?? new Error("sendTo failed after retries");
  }
}
