# RFC: A Vessel Calculus (paper-doll/v2)

Status: implemented — step 1 shipped in 0.5.0, step 2 (paper-doll/v2) shipped in 0.6.0
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
Element ::= { kind, type?, id?, data?, body? }
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

v1 already permits a consumer to stash an entire document inside `Element.data` — the protocol just can't see it. v2 acknowledges this with one optional field rather than a new primitive:

- An element may carry a `Body` in `element.body`. `data` remains fully opaque to the protocol; the envelope (`kind`, `type`) remains mandatory and keeps its meaning — *what this element is to its container* (see Resolved questions).
- Validation recurses into `element.body` (laws 1–7 apply at every depth).
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

- No item definitions, stats, quantities, or stacking — sibling protocol territory. (Capacity — `max` counts on accepts — is the most tempting; it is deferred, not rejected, because it is the first constraint that requires *counting* rather than *matching*, and it should wait for a consumer. See the deferral rationale below.)
- No display metadata, unchanged from v1.
- No embedding by reference, as above.
- No layout generalization (hex, 3D, spans). The 4-face planar figure is the constraint that makes paperdoll feel like paperdoll; loosening it is a fork, not a version.
- No diff/patch in core. Pure operations make diffing trivial to build *on top*; it can live in a companion package without touching the protocol.

### Capacity: the deferral rationale

Recorded 2026-07-10, after discussion. Capacity looks like one field (`max: n` on a vessel or token) and is actually a trapdoor — the one extension where the cheap version and the valuable version are far apart. The full analysis, so the reasoning survives to whenever this reopens:

1. **It is the missing law of the founding metaphor.** v2 cannot say "one hat per head" — a head vessel accepting hats lawfully contains forty. Every classic paper-doll mechanic (one weapon per hand, one ring per finger) is a capacity-1 constraint. This is the strongest argument *for* capacity, and even it waits.
2. **Counting collides with the opacity boundary.** Is a stack of 20 arrows one element with `data: {count: 20}` (protocol-blind — `data` is opaque, always) or 20 elements? For capacity to see quantity, `count` must be promoted into the envelope — an ontological shift: elements stop being individuals and become multisets, and every law that says "each element" must be re-read as "each unit."
3. **Token budgets turn validation from a scan into a search.** With per-token budgets, an element matching two budgeted tokens raises "which budget does it consume?" — vessel validity becomes "does an assignment of elements to budgets exist," i.e. bipartite matching. Every current law is a linear scan; this one is combinatorial. Escape hatch if ever needed: a **disjointness law** — where any token carries `max`, a vessel's tokens must be pairwise non-overlapping — which forces the assignment and restores linear checking. One law added to avoid one algorithm class.
4. **It breaks locality, and paperfold feels it first.** Admission would depend on a vessel's *other contents*, not just (vessel, element). Consequences: operation order starts to matter at full vessels, patches stop commuting exactly at capacity boundaries (dragging paperfold toward its expensive commutation frontier ahead of schedule), and multi-step swaps through full inventories require genuinely transactional patches.
5. **Half the use cases dissolve into existing machinery.** Weighted capacity ("2 cars or 1 truck") and spatial capacity (grid inventories) are largely expressible today as embedded bodies of `max`-1-style cell vessels — the calculus is secretly good at spatial capacity because it is a spatial calculus. The fragment that does not dissolve is pure counting ("any 5, arrangement irrelevant").

**Decision: build nothing until the first-party gamecraft consumer (`design-gamecraft-consumer.md`) concretely fails to express a mechanic without it.** That moment identifies which fragment is actually needed (possibly only `max: 1`, a far smaller RFC than the survey above) and supplies a real consumer to test the disjointness trade against. Waiting is free: strict unknown-key validation means no capacity dialect can drift into existence in the interim — an `accepts` token carrying `max` is rejected by every v2 validator today, so capacity arrives as a clean versioned event or not at all. If it arrives, the expected shape is: `max` on vessels and on tokens, the disjointness law, `count` on the element envelope, and weights/shapes explicitly rejected with the dissolution argument.

### Identity: the addressing law (planned as paper-doll/v3)

Recorded 2026-07-10, after discussion. Identity splits in two, and the halves land on opposite sides of the protocol boundary:

- **Identity assignment** — who is alice, minting character ids, body factories, registries — is a consumer concern, permanently. Bodies are anonymous values; consumers wrap them (`{ characterId, body }`). The protocol will never own a character registry.
- **Identity reference** — the address syntax and resolution rules by which *documents* point at vessels and elements — is protocol surface, because sibling documents (paperchain scenes, paperfold patches) are interchange: a Rust validator and a TypeScript validator must resolve `alice.left-hand/steel-dagger` identically. The web analogy: the protocol owns the URL syntax, never the registrar.

The concrete gap in v2: **elements cannot be stably addressed.** `contains` is an ordered array whose indices shift under `removeElement`/`moveElement` — index-paths are invalidated by the very patches paperfold exists to record — and `element.id` is optional with no uniqueness requirement. Both named siblings are blocked on this: paperfold cannot say what a patch touched; paperchain cannot relate a held item to a holder.

**Decision: fold the addressing law into the paperdoll core** as a future `paper-doll/v3`. It passes the annealing test (a law, not a concept — it constrains a field present since v0, adds no fields or primitives), the dependency test (shared prerequisite of two siblings, who must not invent rival address semantics), and the consumer test (interchange validity cannot be enforced consumer-side). Expected content, deliberately tiny:

- **Law 8 (identity):** `element.id`, where present, must be unique within its containing vessel (open sub-question: per-vessel vs per-body scope). Elements without ids are legal but unaddressable — anonymous values.
- An address grammar for vessel paths and id-bearing element paths, recursing through `element.body`.
- Mechanical migration: documents with duplicate ids are rejected with precise paths (or deduplicated by suffix — to be decided in the v3 RFC).

Because law 8 changes which documents are valid, it cannot slide into v2 silently — it warrants the protocol-string bump, and a one-law protocol version is an acceptably annealed thing to ship. Cut v3 when paperfold work begins, alongside the API-only symmetry-completion (which needs no protocol bump). Capacity explicitly does **not** ride along (see the deferral rationale above): it adds concepts rather than laws, blocks nothing, and its deferral is free, whereas identity's deferral holds up two siblings.

## Sequencing

1. **v1.x** — additive groundwork on the current protocol: `insertElement` / `removeElement` / `moveElement` with opt-in compatibility checking, and `matches()` as an exported query. Nothing breaks; consumers get the containment API early.
2. **v2.0** — the unification: `vessels`, laws 6–7 mandatory, recursion, `Element.type`, deletions of the pool surface. `paper-doll/v2` protocol string, migration helper, JSON Schema published.
3. **v3** — the identity/addressing law (law 8) plus the address grammar, cut when paperfold work begins; the destructive-operation symmetry-completion lands beside it as API-only work. See "Identity: the addressing law" above.
4. **Post-v2** — sibling protocols, named on a `paper*` scheme:
   - item collections (the other half of the `accepts` handshake) — unnamed
   - body profiles (structural conformance, interfaces-for-bodies) — **papermold**, pre-RFC drafted: see `rfc-papermold.md`
   - cross-body relations / scenes (typed relations over vessel addresses, e.g. `holds(alice.left-hand, bob.right-hand)`; the by-reference frontier deliberately exiled from v2) — **paperchain**, pre-RFC drafted: see `rfc-paperchain.md`
   - dynamics: diff/patch/apply/invert over bodies — **paperfold**. Sibling, not core: its patch vocabulary is defined as the reification of paperdoll's operation signatures, one constructor per exported operation. Kernel prerequisite: every destructive operation must return what it destroyed (`removeElement` already does; `deleteVessel`, `disconnect`, and `connect`'s implicit port-clears do not yet) — a small additive v2.x symmetry-completion to land before paperfold exists. Pre-RFC drafted: see `rfc-paperfold.md`.

## Resolved questions

These were open in the first draft and are now resolved by discussion.

**Sealed vessels.** `accepts: []` means "accepts nothing." This falls out of law 6 with no special case: every contained element must match at least one token, and an empty token set matches nothing. Absent `accepts` remains open; declared `accepts` closes the set; empty `accepts` seals it. Sealed vessels are useful (decorative nodes, structural joints).

**Recursion uses a dedicated field, and the envelope is the type.** Embedded bodies ride in `element.body`, not in `data` under a reserved kind — `data` stays fully opaque to the protocol, forever. The apparent cost of the extra field buys a unification that answers the "what does `kind` mean here" question and the "do bodies need types" question at once:

- `kind` (and `type`) keep exactly their existing meaning: *what this element is to its container*. They remain mandatory and never gain an empty state. `body` describes internals; the envelope describes the outside. They are orthogonal.
- **Bodies do not have types; elements do.** A body only needs a type at the moment it is contained, which is precisely when it is wrapped in an envelope. A free-standing body (a document root) has no container asking, so it carries none.

So a factory's mech bay is expressed entirely with existing law-6 machinery:

```
// the bay
{ accepts: [{ kind: "unit", type: "mech" }] }

// the mech
{ kind: "unit", type: "mech", body: { root: "torso", vessels: { ... } } }
```

No reserved kinds, no body-level type field, no new matching rule.

**The outer token does not inspect the inner root.** An embedded body matches its container's `accepts` via its envelope, like any element; its internals are its own business. One caveat recorded deliberately: this is *nominal typing on trust*. Anything can claim `type: "mech"`; paperdoll matches names and never inspects internals for mech-ness. Structural conformance — checking that a body claiming a type actually has the expected shape (a torso, two arm mounts) — is interfaces-for-bodies, a "body profile" concept that belongs in a sibling protocol. Enforcing it in core would require the protocol to know what a mech is, which is exactly the boundary the core ontology forbids crossing.
