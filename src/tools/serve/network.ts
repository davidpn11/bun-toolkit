import { networkInterfaces } from "node:os";
import { isLoopback } from "../../shared/serve.ts";

const WILDCARDS = new Set(["0.0.0.0", "::"]);

export function networkUrls(host: string, port: number): string[] {
  if (isLoopback(host)) return [];
  if (!WILDCARDS.has(host)) return [url(host, port)];
  return lanAddresses().map((address) => url(address, port));
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((info) => info !== undefined && info.family === "IPv4" && !info.internal)
    .map((info) => (info as { address: string }).address);
}

function url(host: string, port: number): string {
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}/`;
}
