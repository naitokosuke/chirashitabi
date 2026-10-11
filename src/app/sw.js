/**
 * The app's service worker, so the booklet opens on the trip with the connection gone: the room
 * itself is kept on the device (features/sync/persist.ts), and this keeps the files that draw it.
 * The build (vite.config.ts) writes it out as /sw.js with SHELL set to every file it emitted.
 * Registered only against the Worker (main.ts); with the mocks, MSW's worker holds the scope.
 */

/** The page and every file the build emitted, filled in by the build */
const SHELL = self.__SHELL__;
const CACHE = `shell-${self.__VERSION__}`;
/** A room's pictures, by their id: a picture never changes, so one fetched once is good for good */
const PICTURES = "pictures";
const PICTURE = /^\/api\/rooms\/[0-9a-f-]{36}\/images\/[0-9a-f-]{36}$/;
/**
 * How long a page waits on the network before the kept one is drawn: a poor connection on the
 * trip should not hold the booklet, while a good one still reaches Access, whose expired session
 * answers with its login page
 */
const PATIENCE = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("shell-") && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate") event.respondWith(page(req));
  else if (PICTURE.test(url.pathname)) event.respondWith(picture(req));
  // the API is the room's, live; the socket's handshake never comes here
  else if (!url.pathname.startsWith("/api/")) event.respondWith(file(req));
});

/** Every URL is the one page (the router reads it): the network's, or the kept one when it is slow or gone */
async function page(req) {
  const network = fetch(req);
  const kept = new Promise((resolve) => setTimeout(resolve, PATIENCE)).then(() =>
    caches.match("/"),
  );
  try {
    return await Promise.race([network, kept.then((r) => r ?? network)]);
  } catch {
    return (await caches.match("/")) ?? Response.error();
  }
}

/**
 * The build's files carry their hash in their name: a kept one is the one. Whatever it varied on
 * (the page's module script asks with an Origin, the install did not), it is the same file.
 */
async function file(req) {
  return (await caches.match(req, { ignoreVary: true })) ?? fetch(req);
}

async function picture(req) {
  const cache = await caches.open(PICTURES);
  const kept = await cache.match(req);
  if (kept !== undefined) return kept;
  const res = await fetch(req);
  // only a picture the room gave: not Access's way to its login, nor a refusal
  if (res.ok && res.type === "basic") await cache.put(req, res.clone());
  return res;
}
