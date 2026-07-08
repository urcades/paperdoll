# Changelog

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
