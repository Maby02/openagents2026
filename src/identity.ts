import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { promises as fs } from "node:fs";

export interface Identity {
  privateKey: KeyObject;
  publicKey: KeyObject;
  // 64-char hex of the raw 32-byte ed25519 public key (matches AXL's identity format).
  publicKeyHex: string;
}

// AXL identity format: ed25519 PKCS#8 PEM, exactly what `openssl genpkey -algorithm ed25519` produces.
export async function generateAndSaveKey(pemPath: string): Promise<void> {
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }) as string;
  await fs.writeFile(pemPath, pem, { mode: 0o600 });
}

export async function loadIdentity(pemPath: string): Promise<Identity> {
  const pem = await fs.readFile(pemPath, "utf8");
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error(`expected ed25519 key, got ${privateKey.asymmetricKeyType}`);
  }
  const publicKey = createPublicKey(privateKey);
  return { privateKey, publicKey, publicKeyHex: rawPublicKeyHex(publicKey) };
}

export function publicKeyFromHex(hex: string): KeyObject {
  if (hex.length !== 64) {
    throw new Error(`expected 64-char hex pubkey, got ${hex.length} chars`);
  }
  // Build a minimal SPKI DER for an ed25519 public key:
  //   30 2a 30 05 06 03 2b 65 70 03 21 00 <32-byte raw key>
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  const der = Buffer.concat([prefix, Buffer.from(hex, "hex")]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

export function signMessage(privateKey: KeyObject, message: Buffer | string): string {
  const buf = Buffer.isBuffer(message) ? message : Buffer.from(message, "utf8");
  return sign(null, buf, privateKey).toString("hex");
}

export function verifyMessage(
  publicKey: KeyObject,
  message: Buffer | string,
  sigHex: string,
): boolean {
  const buf = Buffer.isBuffer(message) ? message : Buffer.from(message, "utf8");
  try {
    return verify(null, buf, publicKey, Buffer.from(sigHex, "hex"));
  } catch {
    return false;
  }
}

// The DER SPKI for an ed25519 public key is 12 bytes of header + 32 bytes of raw key.
function rawPublicKeyHex(publicKey: KeyObject): string {
  const der = publicKey.export({ format: "der", type: "spki" });
  if (der.length < 32) {
    throw new Error("public key DER shorter than 32 bytes");
  }
  return der.subarray(der.length - 32).toString("hex");
}
