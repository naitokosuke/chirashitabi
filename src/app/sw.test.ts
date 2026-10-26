import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

const ORIGIN = "https://chirashitabi.test";
const SOURCE = readFileSync(new URL("./sw.js", import.meta.url), "utf8");

/** The browser's caches as a service worker sees them: listed, and searched, in the order made */
function cacheStorage() {
  const all = new Map<string, Map<string, string>>();
  const path = (req: string | { url: string }) =>
    new URL(typeof req === "string" ? req : req.url, ORIGIN).pathname;
  const cache = (files: Map<string, string>) => ({
    match: async (req: string | { url: string }) => {
      const body = files.get(path(req));
      return body === undefined ? undefined : new Response(body);
    },
    put: async (req: string | { url: string }, res: Response) => {
      files.set(path(req), await res.text());
    },
    addAll: async (urls: string[]) => {
      for (const url of urls) files.set(url, await (await fetchFromNetwork(url)).text());
    },
    keys: async () => [...files.keys()],
    delete: async (req: string) => files.delete(path(req)),
  });
  return {
    all,
    open: async (name: string) => {
      if (!all.has(name)) all.set(name, new Map());
      return cache(all.get(name)!);
    },
    keys: async () => [...all.keys()],
    delete: async (name: string) => all.delete(name),
    match: async (req: string | { url: string }) => {
      for (const files of all.values()) {
        const found = await cache(files).match(req);
        if (found !== undefined) return found;
      }
      return undefined;
    },
  };
}

/** What the network answers, as the build named `version` deployed it */
let deployed = "";
let fetchFromNetwork: (req: string | { url: string }) => Promise<Response>;

/** One build's worker, its install and activation run */
async function worker(caches: ReturnType<typeof cacheStorage>, version: string, shell: string[]) {
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const code = SOURCE.replace("self.__SHELL__", JSON.stringify(shell)).replace(
    "self.__VERSION__",
    JSON.stringify(version),
  );
  // the worker's own globals, as a browser gives them; the network and the clock are looked up
  // on each call, so a test may swap them (fake timers) after the worker started
  runInNewContext(code, {
    self,
    caches,
    fetch: (req: string | { url: string }) => fetchFromNetwork(req),
    setTimeout: (run: () => void, ms: number) => setTimeout(run, ms),
    Response,
    URL,
  });
  for (const type of ["install", "activate"]) {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  }
  return async (pathname: string, mode = "no-cors") => {
    let answer: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: { url: `${ORIGIN}${pathname}`, method: "GET", mode },
      respondWith: (p: Promise<Response>) => (answer = p),
      waitUntil: () => {},
    });
    return answer;
  };
}

const SHELL_A = ["/", "/assets/index-aaaa.js", "/assets/map-aaaa.js", "/theme.js"];
const SHELL_B = ["/", "/assets/index-bbbb.js", "/assets/map-bbbb.js", "/theme.js"];

/** Build a, then build b deployed and its worker taking over */
async function secondBuild() {
  const caches = cacheStorage();
  deployed = "a";
  await worker(caches, "a", SHELL_A);
  deployed = "b";
  const request = await worker(caches, "b", SHELL_B);
  return { caches, request };
}

beforeEach(() => {
  fetchFromNetwork = async (req) =>
    new Response(
      `${deployed}:${new URL(typeof req === "string" ? req : req.url, ORIGIN).pathname}`,
    );
});
afterEach(() => vi.useRealTimers());

describe("after a new build takes over", () => {
  test("the previous build's cache is kept beside the new one", async () => {
    const { caches } = await secondBuild();
    expect([...caches.all.keys()]).toEqual(["shell-a", "shell-b"]);
  });

  test("the page with the network gone is the new build's", async () => {
    const { request } = await secondBuild();
    fetchFromNetwork = () => Promise.reject(new TypeError("offline"));
    expect(await (await request("/rooms", "navigate"))?.text()).toBe("b:/");
  });

  test("the page on a slow network is the new build's", async () => {
    const { request } = await secondBuild();
    vi.useFakeTimers();
    fetchFromNetwork = () => new Promise(() => {});
    const answer = request("/", "navigate");
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await answer)?.text()).toBe("b:/");
  });

  test("a file without a hash in its name is the new build's", async () => {
    const { request } = await secondBuild();
    expect(await (await request("/theme.js"))?.text()).toBe("b:/theme.js");
  });

  test("a chunk only the previous build has still comes from its cache, for a tab running it", async () => {
    const { request } = await secondBuild();
    fetchFromNetwork = () => Promise.reject(new TypeError("offline"));
    expect(await (await request("/assets/map-aaaa.js"))?.text()).toBe("a:/assets/map-aaaa.js");
  });
});
