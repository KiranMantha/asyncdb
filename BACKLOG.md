# Backlog

Tracked priority: P0 (blocking) → P3 (nice to have). Update status inline as items are picked up.

## Features

| # | Priority | Area | Description | Status |
|---|----------|------|-------------|--------|
| 1 | P0 | API surface | No flat/schemaless KV mode. Every operation requires a predeclared object store via `setup()`. This is the core structural blocker keeping the library out of KV-shaped use cases (e.g. a TanStack Query persister). Add an opt-in "default store, no schema" mode that auto-creates one store on first use. | **Done** — `getItem`/`setItem`/`removeItem` lazily auto-open a dedicated KV database/store, no explicit setup needed. |
| 2 | P0 | API surface | No `get`/`set`/`remove` single-key convenience API. A thin wrapper (`get(key)`, `set(key, value)`, `remove(key)`) over one implicit store, layered on top of #1, would let this slot directly into KV-shaped consumers. | **Done** — see `getItem`/`setItem`/`removeItem` in [src/index.ts](src/index.ts). |
| 3 | P1 | Error handling | `{status, data}` envelope instead of throw/reject. Idiomatic JS/TS and every persister-style interface expect rejected promises on failure. Either switch to reject-on-error, or add a throwing variant alongside the existing envelope API. | **Done** — `promisify` now rejects on error; every function resolves the plain value or rejects with an `Error`. `DBTransactionStatus`/`DBResponse` removed. |
| 4 | P1 | Init ergonomics | No `ready` promise / auto-queuing. Every consumer must gate calls behind `setup()` resolving. Add `whenReady()` or auto-queue calls made before setup completes. | Open — still applies to the table API (`setupDatabase` must be awaited manually); the KV API doesn't need this since it self-initializes. |
| 5 | P2 | Data lifecycle | No TTL/expiration. Relevant for cache/persister use cases needing stale-entry eviction. | Open |
| 6 | P2 | Environment | No SSR/Node fallback. Reads `window.indexedDB` and throws if absent — add a guard so importing in SSR/Node doesn't crash at module load. | Open |
| 15 | P1 | Bundling | Library was class-based (`AsyncDB`), forcing consumers to instantiate even if they only need one function. Converted to standalone tree-shakable functions with module-level state (one DB + one KV store per app). Table functions use verb+Table naming (`queryTable`, `upsertTable`, `deleteRecord`, `setupDatabase`); KV functions use `getItem`/`setItem`/`removeItem`. | **Done** — verified with esbuild that importing only `getItem`/`setItem` drops all table-related code from the bundle. |
| 16 | P2 | API surface | `upsertTable` consolidates the old `insertRecords`/`updateData`/`bulkPut` three-way split into one function that branches on argument shape: array → bulk insert, single object (+ optional key) → put. The implicit get-then-merge patch behavior was dropped — callers now `queryTable` first and pass the merged object back in, which is more predictable. | **Done** | 

## Bugs (source code only)

| # | Priority | Location | Description | Status |
|---|----------|----------|-------------|--------|
| 7 | P0 | `updateData` (old) | On a missing key, `Object.assign(undefined, value)` threw `TypeError` instead of a clean error. | **Resolved as part of #16** — the implicit merge-by-key path no longer exists; `upsertTable` always puts a full record, so there's no "get a possibly-missing record" step to fail. |
| 8 | P0 | table functions (`requireDb`) | Calling any data method before `setupDatabase()` resolves threw a raw "Cannot read properties of undefined". | **Done** — `requireDb()` now throws a clear `Error('Database is not set up yet. Call setupDatabase() first.')`. |
| 9 | P2 | `#debug` field | Accepted but never used. | **Resolved by #15** — the class and its unused `debug` constructor option no longer exist. |
| 10 | P2 | error casts (e.g. old `e as unknown as T[]`) | Error branches cast the raw DOM `Event` to the success data type. | **Resolved as part of #3** — errors now reject with a real `Error` built via `toError()`, no more casting a DOM event into the success type. |
| 11 | P2 | old `DBResponse`/`TableIndex`/`TableDefinition` | Public shapes were `type` instead of `interface`. | Open — `TableIndex`/`TableDefinition`/`KvOptions` are still `type` aliases in the current source; revisit if it matters for consumers. |
| 12 | P2 | old `transaction`/`keyRange` getters | Dead abstraction post vendor-prefix removal. | **Resolved by #15** — dropped entirely in the function-based rewrite; consumers can use the DOM globals directly if needed. |

## Process

| # | Priority | Description | Status |
|---|----------|-------------|--------|
| 13 | P2 | No test suite — nothing catches regressions automatically. Currently verified only via ad hoc smoke scripts against `fake-indexeddb` during development. | Open |
| 14 | P3 | Single npm release since 2023, ~2 weekly downloads — worth noting if this is meant to be depended on externally. | Open |
