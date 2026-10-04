import type { Temporal } from "temporal-polyfill-lite";

import { defineQuery, useMutation } from "@pinia/colada";

import type { Scheduled } from "../notes/types";

import { useWorker } from "./useWorker";

/**
 * The Worker's calls as mutations, for their pending and error states. They are paid calls
 * (docs/auth-and-security.md), so none is ever retried by the library: trying again is a tap.
 * Defined once for the app (defineQuery).
 */
export const useWorkerCalls = defineQuery(() => {
  const worker = useWorker();
  const api = () => {
    if (worker.api === null) throw new Error("No Worker is connected");
    return worker.api;
  };

  return {
    /** A member's draft of a day: an order, times and an intro */
    draftDay: useMutation({
      mutation: ({ date, notes }: { date: Temporal.PlainDate; notes: Scheduled[] }) =>
        api().draftDay(date, notes),
    }),
    /** Publishes the booklet as a static page */
    exportBooklet: useMutation({
      mutation: () => {
        const publish = api().exportBooklet;
        if (publish === null) throw new Error("The Worker cannot publish yet");
        return publish();
      },
    }),
    /** The room's agent leaves a few ideas on the desk around `at` */
    suggest: useMutation({
      mutation: (at: { x: number; y: number }) => api().suggest(at),
    }),
  };
});
