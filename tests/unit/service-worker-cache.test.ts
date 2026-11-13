import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

function worker(response: Response) {
  const origin = "https://rankae.test";
  const put = vi.fn().mockResolvedValue(undefined);
  const match = vi.fn().mockResolvedValue(undefined);
  const fetch = vi.fn().mockResolvedValue(response);
  const listeners = new Map<string, (event: unknown) => void>();
  runInNewContext(source, {
    URL,
    self: { location: { origin }, addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener) },
    caches: { match, open: vi.fn().mockResolvedValue({ put }) },
    fetch,
  });
  return { fetch, match, put, async request(path: string, destination: string, mode = "cors") {
    const respondWith = vi.fn();
    const waitUntil = vi.fn();
    listeners.get("fetch")!({ request: { url: origin + path, method: "GET", mode, destination }, respondWith, waitUntil });
    await waitUntil.mock.calls[0]?.[0];
    return respondWith.mock.calls[0]?.[0];
  } };
}

describe("service worker navigation cache", () => {
  it("serves cached versioned assets and stores successful misses", async () => {
    const network = new Response("script");
    const sw = worker(network);
    expect(await sw.request("/_next/static/chunks/app.js", "script")).toBe(network);
    expect(sw.put).toHaveBeenCalledOnce();
    const cached = new Response("cached script");
    sw.match.mockResolvedValue(cached);
    expect(await sw.request("/_next/static/chunks/app.js", "script")).toBe(cached);
    expect(sw.fetch).toHaveBeenCalledOnce();
  });

  it("bypasses private route payloads and leaves no-store responses off disk", async () => {
    const network = new Response("private", { headers: { "Cache-Control": "private, no-store" } });
    const sw = worker(network);
    expect(await sw.request("/app/rankas/id?_rsc=x", "")).toBeUndefined();
    expect(sw.match).not.toHaveBeenCalled();
    expect(await sw.request("/app/rankas/id", "document", "navigate")).toBe(network);
    expect(await sw.request("/_next/static/chunks/app.js", "script")).toBe(network);
    expect(sw.put).not.toHaveBeenCalled();
  });
});
