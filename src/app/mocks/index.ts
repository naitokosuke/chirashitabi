import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

/**
 * Answer `/api` and the room's socket in the page (handlers.ts), so the app runs the code it
 * runs against the Worker. Call before anything asks: the service worker has to be in place.
 */
export async function startMocks() {
  await setupWorker(...handlers).start({ onUnhandledRequest: "bypass", quiet: true });
}
