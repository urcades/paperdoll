# Changelog

## 0.7.0 — 2026-07-10

The symmetry-completion (paperfold prerequisite (a), per `docs/rfc-paperfold.md`): every destructive or overwriting operation now returns what it removed, so callers can construct inverse operations without diffing. API-only — no document format changes, protocol string stays `paper-doll/v2`.

### Changed (breaking TypeScript API, not protocol)

- `connect` returns `{ body, displaced: Connection[] }` — the prior connections (0–2) the new one overwrote.
- `disconnect` returns `{ body, removed: Connection | null }`.
- `deleteVessel` returns `{ body, vessel, collapsed: Connection | null }` — the deleted vessel exactly as it was (its ports encode the severed connections, recoverable by reciprocity), and the neighbor connection created by `collapseOppositeNeighbors`, if any.
- `removeElement` already returned `{ body, element }`; creation-only operations (`insertVessel`, `insertElement`) and `moveElement` (which destroys nothing) are unchanged.

Round-trip invertibility is covered by tests: delete-then-restore and disconnect-then-reconnect reproduce the original body exactly.


## 0.6.0 — 2026-07-08

Step 2 of the vessel-calculus roadmap: the `paper-doll/v2` protocol. Breaking throughout; v1 documents migrate with `migrateV1()`.

### The unification

- `slots` and `pools` merge into a single `body.vessels` map. `Pool`, `PoolId`, `BodySlot`, `SlotId`, `insertPool`, `deletePool`, `insertSlot`, `deleteSlot` are gone; `Vessel`, `VesselId`, `insertVessel`, `deleteVessel` replace them. "Pool" is now a derived property (a port-less vessel outside the figure), not a stored kind.
- Port addresses are `{ vessel, side }` instead of `{ slot, side }`; `Endpoint` likewise.
- `insertVessel(body, vessel, { at?, id? })` covers both former inserts: with `at` it bridges into the figure; without it creates a free vessel. New vessels no longer default to `accepts: []` — in v2 that means sealed; absent means open.
- Derived layout is `{ figure, free, connections }`: coordinates for the figure, a sorted id list for free vessels (the v1 pool-column heuristic is deleted — placement of free vessels is a renderer decision), and `deriveLayout` now takes a `Body`.

### Laws

- Compatibility (law 6) is mandatory: validation rejects any element that fails its vessel's declared `accepts`, and `insertElement` / `moveElement` always enforce it (the v1.x `checkCompatibility` opt-in and `ContainmentTarget` / `ContainmentOptions` types are gone — targets are vessel ids).
- Recursion (law 7): an element may embed a full `Body` in `element.body`; validation applies all laws at every depth. `data` remains opaque to the protocol, always.

### Migration and portability

- `migrateV1(document)` mechanically converts v1 documents: merges slots and pools (id collisions are errors), rewrites port addresses, and validates the result — v1 documents whose contents violate their own `accepts` fail with precise errors.
- The v2 parser rejects v1 documents with errors pointing at `migrateV1`.
- `schema/paper-doll-v2.schema.json` ships in the package: a JSON Schema (2020-12) for the document format, with the beyond-schema laws specified in `docs/rfc-vessel-calculus.md`.


## 0.5.0 — 2026-07-08

Step 1 of the vessel-calculus roadmap (`docs/rfc-vessel-calculus.md`): the containment API, fully additive.

### Added

- `insertElement`, `removeElement`, `moveElement` — pure containment mutations for slots and pools, closing the gap where `contains` arrays had to be hand-edited outside the invariant-preserving API. `moveElement` checks its destination before removing, so it is atomic.
- `matches(token, element)` and `isAccepted(container, element)` — structural compatibility queries. Absent `accepts` is open; `accepts: []` is sealed; a non-empty set admits only matching elements.
- Opt-in enforcement: pass `{ checkCompatibility: true }` to `insertElement` / `moveElement` to reject elements the target does not accept. Becomes a validation law in v2.
- `ContainedElement.type` — optional lowercase id completing the `{ kind, type }` join with accept tokens.
- Type exports: `ContainmentTarget`, `ContainmentOptions`.


## 0.4.0 — 2026-07-08

### Breaking

- `connect` now throws on self-connections and non-face-opposite endpoints instead of silently producing an invalid body.
- `parseDocument` / `validateDocument` reject unknown keys at the document, body, slot, pool, port, accept-token, and contained-element levels. Presentation or consumer data can no longer ride along inside protocol documents.
- `parseDocument` returns a deep copy of the input instead of aliasing it; mutating the original input no longer affects the parsed value.
- Generated slot ids changed from `new-node-N` to `slot-N`, and generated slot ids now avoid collisions with pool ids (and vice versa).
- Derived pool positions are assigned in sorted pool-id order rather than object insertion order, making layout robust across serialization round-trips.
- `insertSlot`'s slot argument is now typed `Omit<BodySlot, "ports">`; ports were always discarded, and the type now says so.

### Added

- `insertSlot` and `insertPool` accept an `options.id` to choose the new node's id explicitly. Invalid or already-taken ids throw.
- `InsertOptions` type export.

### Documentation

- README and core ontology now state precisely which invariants the mutation helpers enforce (local, structural) and which remain the caller's responsibility to check via `parseDocument` / `validateDocument` after a batch of edits (reachability, layout collisions).

## 0.3.0 and earlier

Pre-git history. See `docs/rfc-containment-and-constraints.md` for the v0 → v1 protocol migration (removal of `body.zones` / `body.equipped` in favor of `body.pools` and `contains`).
