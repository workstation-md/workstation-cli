#!/usr/bin/env node

const API_URL = process.env.WORKSTATION_API_URL || "https://api.workstation.md";

interface WorkstationInfo {
  id: string;
  host: string;
  port: number;
  web: string;
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

async function list() {
  const items: WorkstationInfo[] = await apiRequest("/list");
  if (items.length === 0) {
    console.log("No active workstations.");
    return;
  }
  for (const ws of items) {
    console.log(`${ws.id}\tssh -p ${ws.port} root@${ws.host}\t${ws.web}`);
  }
}

function usage() {
  console.log(`Usage:
  workstation create --pubkey <public_key>    Create a new workstation
  workstation <id> destroy                    Destroy a workstation
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
  } else {
    usage();
    process.exit(1);
  }
}

main();
