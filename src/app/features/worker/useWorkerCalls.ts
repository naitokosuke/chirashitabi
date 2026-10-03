import type { Temporal } from "temporal-polyfill-lite";

import { useMutation } from "@pinia/colada";

import type { Scheduled } from "../notes/types";

import { useWorker } from "./useWorker";

/**
 * The Worker's calls as mutations, for their pending and error states. They are paid calls
 * (docs/auth-and-security.md), so none is ever retried by the library: trying again is a tap.
 */

function api() {
  const worker = useWorker();
  return () => {
    if (worker.api === null) throw new Error("No Worker is connected");
    return worker.api;
  };
}

/** A member's draft of a day: an order, times and an intro */
export function useDraftDay() {
  const get = api();
  return useMutation({
    mutation: ({ date, notes }: { date: Temporal.PlainDate; notes: Scheduled[] }) =>
      get().draftDay(date, notes),
  });
}

/** Publishes the booklet as a static page */
export function useExportBooklet() {
  const get = api();
  return useMutation({ mutation: () => get().exportBooklet() });
}
