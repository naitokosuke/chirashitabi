import { defineQuery, useMutation, useQuery, useQueryCache } from "@pinia/colada";

import { roomKeys } from "../sync/keys";
import { useSync } from "../sync/useSync";

import { useWorker } from "./useWorker";

/**
 * The room's booklet as a public page (docs/auth-and-security.md): whether it is up and where,
 * and, for the owner, putting it up (at a new link each time) and taking it down. Publishing is
 * budgeted, so neither is ever retried by the library. Defined once for the app (defineQuery).
 */
export const usePublication = defineQuery(() => {
  const sync = useSync();
  const worker = useWorker();
  const queryCache = useQueryCache();
  const api = () => {
    if (worker.api === null) throw new Error("No Worker is connected");
    return worker.api;
  };

  const publication = useQuery({
    key: () => roomKeys.publication(sync.room),
    query: () => api().publication(),
    enabled: () => worker.api !== null,
  });

  return {
    publication,
    /** Puts it up in `lang`, at a new link; the answer is the page, or the budget's refusal */
    publish: useMutation({
      mutation: (lang: "ja" | "en") => api().publish(lang),
      onSuccess: (answer) => {
        if (answer.ok) queryCache.setQueryData(roomKeys.publication(sync.room), answer.value);
      },
    }),
    withdraw: useMutation({
      mutation: () => api().withdraw(),
      onSuccess: () => queryCache.setQueryData(roomKeys.publication(sync.room), null),
    }),
  };
});
