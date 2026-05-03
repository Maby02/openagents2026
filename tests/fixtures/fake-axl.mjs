#!/usr/bin/env node
// Stand-in for the real AXL `node` binary. Listens on the api_port from the
// supplied -config file and serves enough of the API for our tests:
//   GET  /topology  -> stubbed pubkey + ipv6 + peers from $FAKE_AXL_PEERS_JSON
//   POST /send      -> 204; if the recipient peer is in the local routing table
//                      ($FAKE_AXL_PEER_BRIDGE_JSON), forwards the message to
//                      that peer's fake-axl /inject endpoint
//   POST /inject    -> append to local /recv inbox (test-only, not on real AXL)
//   GET  /recv      -> dequeue and return the next inbound message, or 200
//                      with empty body when the inbox is empty
// Honors SIGTERM/SIGINT cleanly.
//
// Two fake-axl nodes can talk to each other by sharing a peer-bridge config.
// FAKE_AXL_PUBKEY        — this node's identity (64-char hex)
// FAKE_AXL_PEERS_JSON    — JSON array of peer pubkey strings shown in /topology
// FAKE_AXL_PEER_BRIDGE_JSON — JSON object: { "<peer-pubkey>": "http://host:port" }

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const configIdx = args.indexOf("-config");
if (configIdx < 0 || !args[configIdx + 1]) {
  console.error("fake-axl: -config <path> required");
  process.exit(2);
}
const configPath = args[configIdx + 1];

const cfg = JSON.parse(await readFile(configPath, "utf8"));
const apiPort = cfg.api_port ?? 9002;

const FAKE_PUBKEY = process.env.FAKE_AXL_PUBKEY ?? "00".repeat(32);
const FAKE_IPV6 = "200:abcd:1234:5678::1";
const PEERS = JSON.parse(process.env.FAKE_AXL_PEERS_JSON ?? "[]");
const PEER_BRIDGE = JSON.parse(process.env.FAKE_AXL_PEER_BRIDGE_JSON ?? "{}");

// Single-consumer in-memory inbox. Each entry: { from: pubkeyHex, body: Buffer }.
const inbox = [];

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/topology") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      our_public_key: FAKE_PUBKEY,
      our_ipv6: FAKE_IPV6,
      peers: PEERS,
      tree: [],
    }));
    return;
  }

  if (req.method === "POST" && req.url === "/send") {
    const dest = req.headers["x-destination-peer-id"];
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const body = Buffer.concat(chunks);
      const bridge = PEER_BRIDGE[dest];
      if (bridge) {
        // Forward to the peer's /inject so it lands in their /recv queue.
        try {
          await fetch(`${bridge}/inject`, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream", "X-From-Peer-Id": FAKE_PUBKEY },
            body,
          });
        } catch (err) {
          console.error(`fake-axl: bridge to ${dest} failed: ${err.message}`);
        }
      }
      res.statusCode = 204;
      res.end();
    });
    return;
  }

  if (req.method === "POST" && req.url === "/inject") {
    const from = req.headers["x-from-peer-id"];
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      inbox.push({ from: typeof from === "string" ? from : FAKE_PUBKEY, body: Buffer.concat(chunks) });
      res.statusCode = 204;
      res.end();
    });
    return;
  }

  if (req.method === "GET" && req.url === "/recv") {
    const next = inbox.shift();
    if (!next) {
      res.writeHead(200);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "X-From-Peer-Id": next.from,
    });
    res.end(next.body);
    return;
  }

  res.statusCode = 404;
  res.end();
});

server.listen(apiPort, "127.0.0.1", () => {
  console.log(`fake-axl listening on :${apiPort} pubkey=${FAKE_PUBKEY.slice(0, 16)}... peers=${PEERS.length}`);
});

const stop = (sig) => {
  console.error(`fake-axl: got ${sig}, exiting`);
  server.close(() => process.exit(0));
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
