/** A JSON object (not an array), whose fields are still to be checked one by one */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
