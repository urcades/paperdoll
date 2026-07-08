# RFC: A Vessel Calculus (paper-doll/v2)

Status: draft
Follows: `rfc-containment-and-constraints.md`, `core-ontology.md`

## Summary

v1 established that paperdoll models one rooted physical graph plus body-level pools, with typed-but-unenforced compatibility tokens and opaque containment. This RFC proposes v2 as an *annealing* of that model: fewer primitives, more laws. The goal is not to grow the protocol but to compact it until every concept is load-bearing.

Three moves, all subtractive in spirit:

1. **Unify slot and pool into one primitive: the vessel.** A pool is already a slot without ports. Make that literal.
2. **Enforce the compatibility contract that v1 only declares.** `accepts` becomes a law, not documentation.
3. **Acknowledge the recursion that v1 already permits.** A contained element may be a body; validation recurses.

Net effect on the surface area: two types deleted (`Pool`, `PoolId`), two mutations deleted (`insertPool`, `deletePool`), one heuristic deleted (special-cased pool layout), one field added (`ContainedElement.type`), zero new concepts. v2 should be *smaller* than v1 and strictly more expressive.

## Guiding principle

paperdoll aims to be an algebra for arranging vessels: a small set of primitives, closed under a small set of pure operations, governed by laws that a validator can check mechanically in any language. Every proposal below is tested against one question: **does this subtract a concept or add a law?** Anything that adds a concept is rejected or deferred to sibling protocols.

## The calculus

### Primitives

Three primitives, one judgment.

```
Vessel  ::= { accepts?, contains?, ports? }
Body    ::= { root, vessels }
Element ::= { kind, type?, id?, data? }
```

- A **vessel** is a container with optional compatibility declarations (`accepts`), optional contents (`contains`), and optional connection faces (`ports`).
- A **body** is a set of named vessels with one distinguished root.
- An **element** is a thing contained. It is opaque to the protocol *except* for its typed envelope — and except when it is itself a body (see Recursion).

The single judgment is validity: `⊢ body ok`. Everything else — layout, connections, reachability — is derived, not stored.

### What disappears

**Pools.** v1's `Pool` is structurally `BodySlot` minus `ports`. In v2 there is one `vessels` map. The distinction becomes a *derived property*, not a stored kind:

- The **figure** of a body is the connected component of `root`.
- A vessel outside the figure with no ports is a **pool** — a word consumers may use; the protocol doesn't store it.
- A vessel outside the figure *with* ports is invalid, exactly as v1's unreachable slot is invalid.

This deletes `Pool`, `PoolId`, `insertPool`, `deletePool`, and the `body.pools` key. `insertVessel` and `deleteVessel` cover both cases: inserting with a source endpoint grows the figure; inserting without one creates a free vessel. The v1 pool-placement heuristic (a column at `minX - 2`) leaves the core: derived layout assigns figure coordinates from the rooted graph as today, and free vessels are reported as an ordered list without coordinates. Where to draw them is a renderer decision, which v1's ontology already claims — v1's heuristic was a quiet violation of our own boundary.

### Laws

Validity is the conjunction of:

1. **Rootedness.** `root` names an existing vessel.
2. **Reciprocity.** Every port is reciprocated by its target.
3. **Opposition.** Ports connect only opposite faces (`top↔bottom`, `left↔right`).
4. **Planarity.** Derived figure coordinates are collision-free and consistent.
5. **Reachability.** Every ported vessel is in the figure.
6. **Compatibility** *(new — the enforcement v1 lacked)*. For every vessel that declares `accepts`, every element in `contains` matches at least one accept token. A vessel with no `accepts` accepts anything (open); declaring `accepts` closes the set.
7. **Recursive validity** *(new)*. Every embedded body is itself valid.

Matching is purely structural:

```
matches(token, element) :=
  token.kind == element.kind
  ∧ (token.type == undefined ∨ token.type == element.type)
```

This requires the one field addition of the proposal: `Element.type`. v1 tokens can express `{ kind: "item", type: "hat" }` but v1 elements have nowhere to carry the `type` half of the join. The addition completes a contract that already exists; without it, law 6 cannot be stated.

### Recursion

v1 already permits a consumer to stash an entire document inside `Element.data` — the protocol just can't see it. v2 acknowledges this with a blessed convention rather than a new primitive:

- An element with `kind: "body"` carries a `Body` in `data`.
- Validation recurses into it (laws 1–7 apply at every depth).
- Compatibility composes across the boundary: the embedded body is an element like any other, so the *outer* vessel's `accepts` governs whether it may sit there; the embedded body's own vessels govern what *it* contains.

Embedding is by value, so cycles are impossible by construction — only depth, which implementations may bound. Embedding by *reference* (shared sub-bodies, instancing) is explicitly out of scope for v2; it reintroduces aliasing and cycle detection, and belongs in a sibling protocol or a later RFC if a real consumer demands it.

This collapses a distinction rather than adding one: "a slot containing an item" and "a slot containing a sub-system" become the same sentence. A backpack is an element and a body. A head is a vessel in the humanoid figure and the root of a face figure.

### Operations

The v2 operation set, all pure, all invariant-annotated:

| Operation | Replaces | Law obligations |
|---|---|---|
| `connect` | `connect` | 2, 3 checked; 4, 5 caller-validated |
| `disconnect` | `disconnect` | may exit the figure; caller-validated |
| `insertVessel` | `insertSlot`, `insertPool` | 2, 3, 6 checked |
| `deleteVessel` | `deleteSlot`, `deletePool` | root-protected |
| `insertElement` | *(new — v1 had no containment ops)* | 6 checked |
| `removeElement` | *(new)* | — |
| `moveElement` | *(new)* | 6 checked at destination |

The division of labor stays as documented in v1.4: operations enforce *local* laws and throw on violation; *global* laws (4, 5) are checked by validation after a batch of edits, because legitimate multi-step edits pass through globally incomplete states. `moveElement` composes remove and insert but checks the destination before removing, so it is atomic — it cannot strand an element.

`insertElement` and company are the material addition here, and they are additions of *coverage*, not concept: v1 asks consumers to hand-edit `contains` arrays outside the invariant-preserving API, which is the same hole "equipped" fell into before v1 closed it for topology.

### Portability

The protocol's claim to be a protocol — rather than a TypeScript library — is substantiated by publishing, alongside v2:

1. **A JSON Schema** for `paper-doll/v2` documents. Any language validates documents identically for laws expressible in schema (shape, ids, known keys); a short prose spec of laws 2–7 covers the rest. The reference implementation stays TypeScript; the *protocol* becomes the schema plus the laws.
2. **A mechanical v1→v2 migration**: `slots` and `pools` merge into `vessels` (id collisions are an error, matching v1.4's shared-namespace id generation); everything else is unchanged. Ship `migrateV1(document)` and keep the v1 parser error messages pointing at it.

## What v2 deliberately does not do

- No item definitions, stats, quantities, or stacking — sibling protocol territory. (Capacity — `max` counts on accepts — is the most tempting; it is deferred, not rejected, because it is the first constraint that requires *counting* rather than *matching*, and it should wait for a consumer.)
- No display metadata, unchanged from v1.
- No embedding by reference, as above.
- No layout generalization (hex, 3D, spans). The 4-face planar figure is the constraint that makes paperdoll feel like paperdoll; loosening it is a fork, not a version.
- No diff/patch in core. Pure operations make diffing trivial to build *on top*; it can live in a companion package without touching the protocol.

## Sequencing

1. **v1.x** — additive groundwork on the current protocol: `insertElement` / `removeElement` / `moveElement` with opt-in compatibility checking, and `matches()` as an exported query. Nothing breaks; consumers get the containment API early.
2. **v2.0** — the unification: `vessels`, laws 6–7 mandatory, recursion, `Element.type`, deletions of the pool surface. `paper-doll/v2` protocol string, migration helper, JSON Schema published.
3. **Post-v2** — sibling protocol for item collections (the other half of the `accepts` handshake), companion diff/patch package if consumers materialize.

## Open questions

- Should a declared-but-empty `accepts: []` mean "accepts nothing" (sealed vessel)? Proposed: yes — it falls out of law 6 with no special case, and sealed vessels are useful (decorative nodes, structural joints).
- Is `kind: "body"` the right reserved kind, or should recursion use a dedicated field (`element.body`) to keep `data` fully opaque? Proposed: dedicated field, leaning on the principle that `data` should never be protocol-legible — but this adds a field, so it must earn its place in review.
- Does the root vessel's `accepts` mean anything when a body is embedded (does the *outer* token need to match the *inner* root)? Proposed: no — the embedded body matches as an ordinary element via its envelope; its internals are its own business.
