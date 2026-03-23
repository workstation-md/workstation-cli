#!/usr/bin/env node

import { execSync } from "child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const API_URL = process.env.WORKSTATION_API_URL || "https://api.workstation.md";

interface WorkstationInfo {
  id: string;
  host: string;
  port: number;
  web: string;
  expires: number;
}

async function apiRequest(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error: ${res.status} ${text}`);
    process.exit(1);
  }
  return res.json();
}

function findKeyPath(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--key" && args[i + 1]) {
      return args[i + 1];
    }
  }
  // Default: try common key paths
  const home = process.env.HOME || "~";
  const defaults = [
    join(home, ".ssh", "id_ed25519"),
    join(home, ".ssh", "id_rsa"),
  ];
  for (const p of defaults) {
    try {
      readFileSync(p);
      return p;
    } catch {}
  }
  console.error("No SSH private key found. Use --key <path> to specify.");
  process.exit(1);
}

function signWithSSHKey(keyPath: string, data: string): string {
  const tmp = mkdtempSync(join(tmpdir(), "ws-"));
  const dataPath = join(tmp, "data");
  writeFileSync(dataPath, data);

  try {
    execSync(
      `ssh-keygen -Y sign -f "${keyPath}" -n workstation.md "${dataPath}"`,
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    const sigPath = dataPath + ".sig";
    return readFileSync(sigPath, "utf-8");
  } catch (e: any) {
    console.error("Failed to sign with SSH key:", e.stderr?.toString() || e.message);
    process.exit(1);
  }
}

async function create(args: string[]) {
  let pubkey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pubkey" && args[i + 1]) {
      pubkey = args[i + 1];
      i++;
    }
  }

  if (!pubkey) {
    console.error("Usage: workstation create --pubkey <public_key>");
    process.exit(1);
  }

  const info: WorkstationInfo = await apiRequest("/create", {
    method: "POST",
    body: JSON.stringify({ pubkey }),
  });

  console.log(JSON.stringify(info, null, 2));
}

async function destroy(wsId: string) {
  const result = await apiRequest(`/${wsId}`, { method: "DELETE" });
  console.log(JSON.stringify(result, null, 2));
}

async function extend(wsId: string, args: string[]) {
  const keyPath = findKeyPath(args);
  const signature = signWithSSHKey(keyPath, wsId);

  const result = await apiRequest(`/${wsId}/extend`, {
    method: "POST",
    body: JSON.stringify({ signature }),
  });

  console.log(JSON.stringify(result, null, 2));
}

async function list() {
  const items: WorkstationInfo[] = await apiRequest("/list");
  if (items.length === 0) {
    console.log("No active workstations.");
    return;
  }
  for (const ws of items) {
    const ttl = ws.expires - Math.floor(Date.now() / 1000);
    const hours = Math.max(0, Math.floor(ttl / 3600));
    const mins = Math.max(0, Math.floor((ttl % 3600) / 60));
    console.log(`${ws.id}\tssh -p ${ws.port} root@${ws.host}\t${ws.web}\t${hours}h${mins}m remaining`);
  }
}

function usage() {
  console.log(`Usage:
  workstation create --pubkey <public_key>    Create a new workstation (24h TTL)
  workstation <id> destroy                    Destroy a workstation
  workstation <id> extend [--key <path>]      Extend TTL by 24h (proves key ownership)
  workstation list                            List active workstations`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    usage();
    process.exit(0);
  }

  const command = args[0];

  if (command === "create") {
    await create(args.slice(1));
  } else if (command === "list") {
    await list();
  } else if (args.length >= 2 && args[1] === "destroy") {
    await destroy(command);
  } else if (args.length >= 2 && args[1] === "extend") {
    await extend(command, args.slice(2));
  } else {
    usage();
    process.exit(1);
  }
}

main();
