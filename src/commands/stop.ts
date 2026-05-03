import { execa } from "execa";
import { axlApiPort } from "../config.ts";

// Phase A version: best-effort port-based kill. Phase B will replace this with
// a PID-tracked stop that talks to the supervised AXL subprocess.
export async function runStop(): Promise<void> {
  const port = axlApiPort();
  const result = await execa("lsof", ["-ti", `:${port}`], { reject: false });

  const pids = result.stdout.trim().split(/\s+/).filter(Boolean);
  if (pids.length === 0) {
    console.log(`nothing listening on :${port}.`);
    return;
  }

  for (const pid of pids) {
    const k = await execa("kill", [pid], { reject: false });
    if (k.exitCode === 0) {
      console.log(`killed pid ${pid} (was on :${port})`);
    } else {
      console.error(`failed to kill pid ${pid}: ${k.stderr}`);
    }
  }
}
