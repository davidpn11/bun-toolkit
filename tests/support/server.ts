/** A port nothing is listening on right now, for tests that need to know the URL before the server starts. */
export function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port as number;
  probe.stop(true);
  return port;
}

export async function waitForPage(base: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(`${base}/`).catch(() => undefined);
    if (response?.ok) return response.text();
    await Bun.sleep(20);
  }
  throw new Error(`Nothing answered at ${base}`);
}
