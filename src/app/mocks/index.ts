import { handlers } from "./handlers";

/**
 * Answer `/api` and the room's socket in the page (handlers.ts), so the app runs the code it
 * runs against the Worker. Call before anything asks: the service worker has to be in place.
 */
export async function startMocks() {
  // the network comes from msw's Vite plugin (vite.config.ts), which serves the service worker
  const { network } = await import("virtual:msw");
  network.configure({ handlers, onUnhandledFrame: "bypass", context: { quiet: true } });
  await network.enable();
}
