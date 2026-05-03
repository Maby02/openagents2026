import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  generateAndSaveKey,
  loadIdentity,
  publicKeyFromHex,
  signMessage,
  verifyMessage,
} from "../src/identity.ts";

const pem = path.join(os.tmpdir(), `sibyl-id-roundtrip-${process.pid}.pem`);
await generateAndSaveKey(pem);
const id = await loadIdentity(pem);
console.log("pubkey hex (64-char):", id.publicKeyHex, "len:", id.publicKeyHex.length);

const msg = "hello from sibyl";
const sig = signMessage(id.privateKey, msg);
console.log("sig hex prefix:", sig.slice(0, 32), "... len:", sig.length);

const ok1 = verifyMessage(id.publicKey, msg, sig);
console.log("verify with own pubkey:           ", ok1);

const pubFromHex = publicKeyFromHex(id.publicKeyHex);
const ok2 = verifyMessage(pubFromHex, msg, sig);
console.log("verify with hex-rebuilt pubkey:   ", ok2);

const ok3 = verifyMessage(id.publicKey, "tampered", sig);
console.log("verify with wrong msg (false ok): ", ok3);

await fs.unlink(pem);

const allGood = ok1 && ok2 && !ok3 && id.publicKeyHex.length === 64 && sig.length === 128;
console.log(allGood ? "\nROUND-TRIP OK" : "\nROUND-TRIP FAILED");
process.exit(allGood ? 0 : 1);
