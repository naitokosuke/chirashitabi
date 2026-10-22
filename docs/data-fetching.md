# Data fetching

How the app gets its data, and how it is to move onto Pinia Colada.
The plan is staged so that each step ships on its own and the next one can be dropped if it stops paying for itself.
Every step, the later one included, is done; "What there is today" describes the app before them.

## What there is today

Two kinds of traffic, handled in two unrelated ways.

The room is a WebSocket (`useRoom`).
On connect the room sends one `snapshot` (members, trip, notes), then relays every accepted mutation to the other sockets as `mutation`, stamped with `by` and `updatedAt`.
The sender never gets its own mutation back.
A mutation the room refuses comes back as `rejected` with a reason and no id; the client closes the socket and the next snapshot is the truth.
While the socket is down the client queues its own mutations (`pending`) and replays them on top of the next snapshot.
The snapshot is applied into three Pinia stores (`useNotes`, `useTrip`, `useMembers`) whose state is deep reactive, and a mutation is applied by changing their objects in place.

Everything else is HTTP or a promise.
`Rooms.vue` fetches `/api/me` and posts `/api/rooms` by hand, with its own `rooms === null`, `listFailed` and `busy` flags.
`WorkerApi.draftDay` and `exportBooklet` are awaited with no pending or error state at all.

What the user sees of all this is uneven.
"Connecting" and "failed" exist only on the rooms screen; inside a room a reconnect is invisible, and asking for a draft gives no sign that anything is happening.

## Goals

- One vocabulary for asynchronous state across HTTP and the room: pending, loading, error, and when the data was last known good.
- The connection's state visible inside a room.
- A local write shows at once and can be taken back precisely when the room refuses it, instead of throwing the whole state away.
- No regression in what works now: dragging stays smooth, offline edits are still replayed, the mock build still runs without a server.
- Vue's Vapor mode keeps working.

## Non-goals

- Persisting the cache for offline reading of the booklet.
  It is a later step and is listed at the end (done since, without the plugin).
- Normalized entity caching.
  The app has one collection per kind and no entity appears under two keys.
- Replacing every Pinia store in one change.

## What others do

Pinia Colada has no guide for real-time data, so the practices below come mostly from TanStack Query and SWR, whose models it shares, and from collaborative apps.

### Two ways to use a push channel with a query cache

The first is invalidation: the server only says what changed, and the client calls `invalidateQueries` on that key so active queries refetch.
TkDodo recommends it as the default because an event for a query nobody is watching costs nothing ([Using WebSockets with React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query)).
Liveblocks' SWR guide does the same with a broadcast `REVALIDATE` event ([Revalidate API data with SWR](https://liveblocks.io/docs/guides/revalidate-api-data-with-swr)).

The second is patching: the server sends the change itself and the client writes it with `setQueryData` or `setQueriesData`.
TkDodo uses it for frequent small changes to a large dataset and finds it "a bit too dynamic", since an entity under several keys must be patched under each.
RTK Query's streaming updates and Apollo's `subscribeToMore` are the same snapshot-plus-patches model in other libraries ([RTK Query streaming updates](https://redux.js.org/toolkit/rtk-query/usage/streaming-updates), [Hasura with Apollo subscriptions](https://hasura.io/docs/2.0/subscriptions/integrations/apollo-subscriptions/)).

Our room has no HTTP endpoint to refetch from and every mutation already carries the full change, so it is the second model.
Invalidation still has a place: a reconnect is an invalidation of the whole room, answered by the next snapshot.

### Freshness comes from the socket, not from timers

With a socket keeping data current, the advice is `staleTime: Infinity` and no refetch on focus or reconnect (TkDodo, above).
SWR's equivalent is turning its automatic triggers off or using `useSWRImmutable` ([SWR revalidation](https://swr.vercel.app/docs/revalidation)).
Both libraries' "reconnect" means the browser's `online` event, not the socket; SWR's own docs say a socket reconnect has to trigger the resync by hand ([SWR revalidation](https://swr.vercel.app/docs/revalidation), [TanStack network mode](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode)).

### The initial load races the first event

tRPC's subscription docs warn to "set up the event listener before fetching events from your database", or events emitted during the fetch are lost ([tRPC subscriptions](https://trpc.io/docs/server/subscriptions)).
The Supabase discussion on silent disconnects lands on the same rule, plus buffering events during the fetch and deduplicating them against the snapshot ([supabase/discussions#5641](https://github.com/orgs/supabase/discussions/5641)).
RTK Query does the opposite (wait for the data, then listen) and so can drop events in between.

Our snapshot and our mutations travel on the same ordered socket, and the room sends the snapshot as the first message of the connection, so this race does not exist here by construction.
The design keeps it that way: nothing is ever fetched for the room over a second channel.

### Reconnects leave gaps

Every source agrees that events are missed while disconnected and that the fix is a resync after reconnecting: refetch, invalidate, or resume from a last event id ([dev.to, Real-time React](https://dev.to/maximusft/real-time-react-when-the-server-has-something-to-say-44f7), tRPC's `tracked()` above).
Figma downloads a fresh copy, reapplies offline edits on top, then resumes ([How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)).
That is what `useRoom` already does with the snapshot and `pending`, and it stays.
Background tabs and sleeping phones drop sockets silently; Supabase recommends a heartbeat ([handling silent disconnections](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794.md)).

### Optimistic writes and their echo

TanStack's cache recipe is `cancelQueries`, snapshot, `setQueryData` in `onMutate`, restore in `onError`, invalidate in `onSettled` ([TanStack optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)).
Pinia Colada's guide is the same, and only restores when the cache still holds the optimistic value, so a later change is not undone ([Pinia Colada optimistic updates](https://pinia-colada.esm.dev/guide/optimistic-updates.html)).
With several mutations on the same data, invalidating in each `onSettled` flickers; TkDodo invalidates only when the last one settles ([Concurrent optimistic updates](https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query)).

Figma discards incoming changes that conflict with its own unacknowledged property changes, so an older value does not flash over a newer local one (Figma, above).
Our room does not echo the sender, so there is no echo to drop, but a partner's change to a note we are editing can still land before ours is accepted.
Doing what Figma does needs the room to acknowledge mutations, which it does not yet.

### High-frequency updates stay out of the store

The Yjs community's rule is that intermediate states do not belong in the document; commit on release ([Yjs forum](https://discuss.yjs.dev/t/how-to-minimize-yjs-store-size-for-an-editor-like-figma/1838)).
Supabase sends cursors over Broadcast, not Presence, for the same reason ([presence rate limit](https://supabase.com/docs/guides/troubleshooting/realtime-client-presence-rate-limit-reached)).
For us that means a card's position while it is being dragged is not cache data.

### What Pinia Colada gives and asks

The relevant APIs are `useQuery` with `staleTime`, `refetchOnWindowFocus` and `refetchOnReconnect`, `defineQueryOptions` for typed keys, `useMutation` with `onMutate`, `onError` and `onSettled`, and `useQueryCache()` with `setQueryData`, `setQueriesData`, `getQueryData`, `invalidateQueries`, `cancelQueries`, `ensure` and `setEntryState` ([query cache](https://pinia-colada.esm.dev/advanced/query-cache.html)).

The cache is shallow.
Each entry's state is a `shallowRef` and `data` is a `ShallowRef`, so an update must return a new array or object; changing one in place notifies nothing.
That is the opposite of today's stores and is the main cost of moving.

The maintainer's guidance for a realtime source is a small `useRealtimeQuery()` wrapping `useQuery`, whose query function awaits the first message and whose later messages are written with `setQueryData` ([posva/pinia-colada#118](https://github.com/posva/pinia-colada/discussions/118)); in the same thread he notes that with a realtime connection one "can likely go without Pinia Colada".
Writing to the cache without a mutation is fine by him ([#379](https://github.com/posva/pinia-colada/discussions/379)), and an entry can be seeded with its options through `setEntryState(ensure(options), …)` ([#483](https://github.com/posva/pinia-colada/discussions/483)).
Entries created only by `setQueryData` once crashed the retry plugin and the devtools; both are fixed ([#654](https://github.com/posva/pinia-colada/issues/654), [#618](https://github.com/posva/pinia-colada/issues/618)).
A community plugin for Laravel Echo subscribes per cache entry, relaxes `staleTime` while connected and invalidates once on reconnect, which is the shape this design takes ([pinia-colada-plugin-laravel-echo](https://github.com/kirchDev/pinia-colada-plugin-laravel-echo)).

Version 1.4.7 accepts `pinia ^4` and `vue ^3.5.41`.
The maintainer says it works with Vapor because it has nothing to do with templates ([#510](https://github.com/posva/pinia-colada/discussions/510)), and it does here: the first step below ran it under Vapor with no change to it.

## Design

### Layers

The socket, the reducers and the cache are separated so that each can be tested alone and the cache can be dropped without touching the other two.

- `features/sync/socket.ts` is the connection and nothing else: connect, back off and retry, a heartbeat, the queue of mutations sent while down, and a status (`connecting`, `connected`, `reconnecting`, `failed`).
  It is plain TypeScript, takes a `WebSocket` factory so tests can pass a fake, and calls back with each `ServerMessage`.
- `features/notes/apply.ts`, `features/trip/apply.ts` and `features/members/apply.ts` are pure reducers: `(state, mutation) => state`, always returning new objects.
  They are today's `receive` functions, made immutable, and they are the only place that knows what a mutation means.
  The worker can reuse them later.
- `features/sync/keys.ts` names one cache entry per slice of the room, and `features/sync/useRoom.ts` wires socket messages into those entries.
- `useNotes`, `useTrip` and `useMembers` stay as the components' API, but read from the cache and write through it.

### Keys

One key per slice, each under the room's id, so a mutation re-renders only what reads that slice.

```ts
["room", roomId, "notes"];
["room", roomId, "trip"];
["room", roomId, "members"]; // with `me`
```

The HTTP data gets keys of its own.

```ts
["me", "rooms"]; // GET /api/me
```

### The room as queries

Each slice is a `useQuery` whose query function resolves with that slice of the next snapshot.
Until the first snapshot arrives its status is `pending`, which replaces the hand-made "connecting" check; if the socket gives up, the query function rejects and the status is `error`.

```ts
const roomQueryOptions = {
  staleTime: Number.POSITIVE_INFINITY, // the socket keeps it fresh
  gcTime: false, // a room's data is not dropped while the app runs
  refetchOnWindowFocus: false,
  refetchOnReconnect: false, // the socket reconnects and re-snapshots
};
```

Messages are written into the cache as they arrive.

- A `snapshot` replaces all three slices, then the queued mutations are applied on top through the same reducers and sent, as today.
- A `mutation` from another member is `setQueryData(key, (old) => apply(old, mutation, by, updatedAt))` on the slice it concerns.
- On reconnect nothing is invalidated by hand: the room's first message on the new socket is a snapshot, and it replaces everything.

The browser's `online` event calls the socket's reconnect instead of refetching queries.

### Local writes

Until the room acknowledges mutations, a local write is a `setQueryData` through the reducer followed by the socket's `send`, inside the store action that exists today (`store.update`, `store.move` and so on).
There is no `useMutation` here yet, because there is nothing for it to await: the room answers only with `rejected`, which carries no id.
A rejection keeps today's behaviour, closing the socket so the next snapshot is the truth.

### Dragging

A card's position while it is dragged lives in a small local layer (`useDrag`: the note's id and its x and y), which the card renders over its cached position.
Throttled `note:move` messages still go out so the partner sees the card travel, but they do not touch our cache.
On release one `note:move` is written to the cache and sent.
A partner's throttled moves arrive at about 12 a second and are written to the cache as they come; with notes in the tens this is a new array of small objects per message, and it is measured in the first step that moves notes, not assumed.

### Connection state

The socket's status is shown inside the room, not only on the rooms screen.
"Reconnecting" is a quiet chip under the row where tools float at the top, with the time of the last snapshot; "failed" offers to retry.
This comes from the socket, not from a query, because a reconnecting room still has good data to show.

### HTTP and the Worker

These are ordinary queries and mutations.

- The rooms list is `useQuery` on `["me", "rooms"]` with the default `staleTime`, refetched on focus so a room the partner created appears.
- Creating a room is `useMutation`, invalidating `["me", "rooms"]` in `onSettled`.
- `draftDay` is `useMutation`, and the booklet shows its `isLoading` on the "ask for a draft" button.
- The public booklet is `useQuery` (`usePublication`), and putting it up or down `useMutation`.

No mutation retries.
`draftDay` is a paid call, and `docs/auth-and-security.md` bounds what one person can spend; a retry must be the person's tap, never the library's.
The retry plugin is not installed.

### Mock build

The mocks keep seeding data without a server, now with `setQueryData` on the three room keys.
The single-file build has no Worker and so has no socket; its room queries never leave `pending` unless the mocks seed them, so the mocks must seed all three.
(Since replaced: the mocks answer `/api` and the room's socket in the page with MSW, `src/app/mocks/handlers.ts`, so the app seeds nothing itself and runs the code it runs against the Worker; the single-file build is gone, since a page opened from disk cannot register MSW's service worker.)

## Steps

Each step is one pull request and leaves the app working.

### Pinia Colada for HTTP and the Worker

Install `@pinia/colada`, register `PiniaColada`, and move the rooms list, room creation, `draftDay` and `exportBooklet` onto `useQuery` and `useMutation`.
This is where Vapor compatibility is proven in the real app.
The "ask for a draft" button gets its pending state.

Done.
The calls live in `features/rooms/api.ts` (plain `fetch`), `features/rooms/useRooms.ts` and `features/worker/useWorkerCalls.ts`, and Pinia Colada 1.4.6 runs under Vapor with no change to it.
One thing learned: Pinia Colada awaits `onSettled` before a mutation leaves `loading`, so a hook that returns a failing `invalidateQueries` leaves the mutation loading for good.
Follow-up invalidations in mutation hooks are fired, caught and not returned.

### Socket and reducers out of the stores

Extract `features/sync/socket.ts` and the immutable reducers, with tests for the reducers and for the socket against a fake `WebSocket` (backoff, queue and replay, status).
No cache yet and no change in behaviour; the stores call the reducers and assign the result.
This step is worth doing even if the next one is dropped.

Done.
The reducers are `applyToNotes`, `applyToDays` and `applyToMembers` in each feature's `apply.ts`, and the stores now hold their arrays in `shallowRef`s.
Since a note that changes is replaced, nothing may hold a note object across a change: the canvas's menu and the map's open card look their note up by id, and a card under a finger moves with `nudge` (local, every frame) between the throttled `move`s that send it.
`useRoom` keeps only what messages mean; `socket.ts` connects, retries, queues and reports its status.
The heartbeat is not in this step: the room does not answer one yet.
Since added: the client sends `ping` every 20 s and the room answers `pong` without waking (`setWebSocketAutoResponse`); a ping left unanswered by the next one is a drop.
The back-off starts over only after a connection that stayed up 10 s, so a room that keeps closing the socket right after its snapshot is still backed off.

### The room in the cache

Define the three room queries, write socket messages into the cache, and make the stores read and write through it.
Add the drag layer and the connection chip.
Measure a partner's live drag before and after.
If the cache adds cost without making the code clearer, stop here and keep the stores on the reducers from the previous step; the maintainer's own view is that a realtime app may not need the library for its realtime part.

Done, with one change to the design above.
The slices are not `useQuery`s with a query function that waits for a snapshot: nothing ever fetches them, so the socket seeds them with `setQueryData` (as in [#483](https://github.com/posva/pinia-colada/discussions/483)) and the stores read them with `getQueryData` inside a `computed`, which tracks both the cache's map and the entry's state (since replaced by `useQueryState`, below).
Whether a room has arrived is the socket's status, as before, and `useRoom.syncedAt` says when it last did.
The key's room id lives in `useSync`, so the stores do not depend on `useRoom`; a session without a room uses `"local"`.
The stores keep their API, so no view changed except the canvas, whose held card is drawn from a local `held` position and written once on release (`sendMove` sends the throttled positions without touching the cache).
The connection chip shows under the top row while the socket is reconnecting, with the time of the last snapshot; giving up still leaves for the rooms screen.
The browser's `online` event calls the socket's reconnect.

The measurement: one tab in a room of 30 notes, a second socket in the same tab sending 36 `note:move`s over three seconds (a partner's drag), frame intervals recorded with `requestAnimationFrame`, three runs each, dev build.
Before (main) and after both applied all 36 moves with a p95 frame of 17.4–17.7 ms, no frame over 20 ms and no long task; the one outlier run on main (the tab was hidden partway) is left out.
So the cache costs nothing measurable here, and the code is uniform (every slice of every room is a cache entry, read and written the same way), which is why the next step goes ahead.

### Acknowledged mutations

This one needs the Worker.
Every client mutation carries an id; the room answers its sender with `ack` or `rejected` for that id, and relays as now.
Local writes become `useMutation` whose mutation function awaits the ack, with the cache recipe: snapshot in `onMutate`, restore in `onError` only if the cache still holds our value, nothing to invalidate on success.
Incoming changes that conflict with one of our unacknowledged ones are held back until it settles, as Figma does.
A rejection then undoes one change instead of reloading the room.

Done, without `useMutation`.
The snapshot-and-restore recipe undoes the wrong thing when two of our changes to the same note are in flight, which is the case TkDodo's concurrent-updates post works around; a ledger does not have the problem (`features/sync/ledger.ts`).
It keeps what the room has confirmed and our changes it has not answered, each with its `cid`, and the cache shows the confirmed state with ours applied on top, in order.
A member's change is applied to the confirmed state, so it lands under ours: that is the Figma rule without a separate hold-back.
An ack moves ours into the confirmed state at the room's `updatedAt`; a rejection drops that one change, a toast says so, and everything else stays.
After a reconnect the snapshot replaces the confirmed state and every unanswered change is sent again; each is safe to apply twice, and one the room had already applied comes back rejected (`duplicate id`, `no such note`) and is dropped, leaving what the snapshot says.
So nothing waits on a timer: the open question about how long to hold back is answered by the next ack, rejection or snapshot.

On the wire, a client mutation may carry `cid` beside its fields; the room answers its sender `{ type: "ack", cid, updatedAt }` or `{ type: "rejected", reason, cid }`, relays as before, and treats a mutation without a `cid` (a card's position mid-drag) as before.
A rejection without a `cid` (a message it could not read) still makes the client resync.
The socket no longer queues: the ledger is what is sent again.
It sends the ledger's unanswered changes, each once per connection and oldest first, at half the room's rate limit (100 in 10 s); one refused as `too many messages` stays in the ledger and goes again once the window has passed.
Stores commit through `useSync().commit`; only the room writes the cache.
The mocks hand their state to `useRoom().offline`, where a commit is confirmed at once (since replaced by MSW, under "Mock build" above).

### Later

`@pinia/colada-plugin-cache-persister` for reading the booklet offline on the trip, restricted to the room keys.

Done, without the plugin (`features/sync/persist.ts`).
The plugin needs `@pinia/colada` 1.4.7, which the repository's release-age rule does not install yet; and it keeps the cache only, so the changes made offline and not yet answered would be lost when the app closes, and it cannot revive Temporal values.
So the room keeps its own: per room in `localStorage`, who this device is, what the room last confirmed and the ledger's unanswered changes, written as the wire's JSON a moment after each change and when the page is hidden, and read back with the wire's revive functions.
Opening a kept room shows it at once, before the socket answers; the app counts a room with kept data as open even while connecting or unreachable, and the connection chip says it is connecting, or offline with a retry, and as of when.
What was written offline is signed by this device's member, survives closing the app, and is sent once the room is back.
The kept format has a version; a newer version's save is neither read nor overwritten, an older one is read for what still parses, and a note, member or unanswered change that does not parse is left out while the rest is kept.
A full storage lets the other rooms' saves go and tries again; still full, the room's own save goes too, so an old one cannot bring back changes the room has answered since.
What is kept belongs to the signed-in person, whom `/api/me` names: before anything kept is opened (for at most 1.5 s), and whenever a connection closes before the room said anything (the room refuses a device whose person is out of it with a plain 403), the app asks it, lets go of everything when another person signed in on this browser, and of every room that person is no longer in, the open one included.

### The stores and the cache, tidied

Each store had built its own key in a `computed`, read it with `getQueryData` and named the slice's type by hand; `me` lived in `useMembers` though only the room wrote it, and the room id was held twice, in `useRoom` and `useSync`.

The keys are `roomKeys` in `features/sync/keys.ts`, one function per slice, tagged with what the slice holds (`EntryKeyTagged`), so a read or a write of the wrong type does not compile.
The stores read with `useQueryState`, Pinia Colada's reactive read of an entry that never fetches it; an entry the room creates later wakes them, since the cache's map is tracked.
`useSync` is the session: which room, who this device is in it (`me`), and where changes go; `useRoom` sets all three and no longer depends on any store.

The session is one value, `Session` in `features/sync/session.ts`: out, joining a room (nothing of it to show), or in it, which needs who this device is and the moment the room is shown as of.
Its transitions (`opened`, `synced`, `linked`) are pure functions, so a connected room without a member, or a member without a room, cannot be written down.
Each unanswered change in the ledger carries who made it, so the ledger no longer asks who this device is; changes kept on a device before that are read back as `me`'s.

## Open questions

- Whether the three slices should be one `["room", roomId]` entry instead.
  One entry makes the snapshot a single write; three keep a note's change from re-rendering the trip and members.
  The design picks three and the third step can revisit it.
- Whether the stores stay as a facade over the cache for good, or components call the queries directly once the move is done.
  They stay: a store is a slice read with `useQueryState` plus what is derived from it (`nameOf`, `forDay`, the tag counts) and the commits a view makes; a component calling the cache would have to know the room's keys.
  Since then they are not Pinia stores: `useNotes`, `useTrip` and `useMembers` hold no state of their own, so each is one composable defined with Pinia Colada's `defineQuery`, handing out the slice's `data` as the cache holds it (undefined until the first snapshot) for its readers to read where they use it.
- How long a held-back incoming change may wait for its ack before the client gives up on it and takes the room's version.
  Answered by the ledger: until the next ack, rejection or snapshot, with no timer.
