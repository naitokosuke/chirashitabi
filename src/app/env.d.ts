// What the app reads from import.meta.env besides Vite's own
interface ImportMetaEnv {
  /** "false" talks to the Worker; anything else answers `/api` and the socket in the page (mocks/) */
  readonly VITE_MOCK?: string;
}
