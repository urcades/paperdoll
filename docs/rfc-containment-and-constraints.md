# RFC: Containment and Constraints

Status: implemented in `paper-doll/v1`

This RFC extrapolates the current direction of `paperdoll` as a minimal protocol for constructing body-like systems that can contain elements.

It does not propose that `paperdoll` become an inventory system. The point is narrower: if body-like arrangements are made from connected nodes, then those nodes need a minimal way to describe what they can hold and, possibly, what they currently hold.

## Problem

The current protocol still carries two concepts inherited from the first equipment-interface prototype:

- `equipped`
- `accepts`

Those names are useful in an RPG paper-doll interface, but they are not quite general enough for the larger protocol goal.

The goal is not only to model a character wearing equipment. The goal is to model a constrained arrangement of physical-ish parts:

- humans
- aliens
- monsters
- robots
- vehicles
- machines
- nested anatomical or mechanical subsystems
- arbitrary body-like state machines

In this broader frame, a node is not merely an equipment slot. A node is a vessel in a body-like graph.

## Body-Like Systems

A body-like system is an abstraction of a physical organism, machine, or machine-like entity.

The protocol models the coarse shape of that system with:

- stable slot ids
- directional ports
- reciprocal face-opposite connections
- a rooted physical graph
- explicit non-physical pools

This is the arrangement calculus. It answers structural questions:

- What exists?
- How is it connected?
- What is reachable from the root?
- Which abstract position is implied by the graph?
- Which mutations preserve graph invariants?

That arrangement layer should remain minimal and consumer-neutral.

## Containment

The phrase "can contain elements" is broader than "can equip items."

A slot named `head` might contain:

- a consumer display name such as `Head`
- an item reference such as `hat-001`
- an arbitrary state object owned by a game
- a damage record
- a sensor module
- another `paperdoll` body representing a face rooted at `nose`

Those are not all equipment. Some are data. Some are entities. Some are recursive body-like systems. The shared idea is containment.

Therefore, `equipped` is probably the wrong core concept. It is one consumer interpretation of containment, not the general primitive.

## Proposed Direction

Replace top-level `equipped` with a generalized containment model.

A future protocol shape could move toward:

```ts
type BodySlot = {
  ports?: Partial<Record<Side, PortAddress>>;
  accepts?: readonly AcceptToken[];
  contains?: readonly ContainedElement[];
};

type Pool = {
  accepts?: readonly AcceptToken[];
  contains?: readonly ContainedElement[];
};
```

This makes slots and pools parallel: both can be places where consumer-defined elements live.

This RFC adopts `Pool` as the target name for what is currently called `EquipmentZone`.

`Zone` sounds spatial. `EquipmentZone` sounds RPG-specific. Names like `Aura` or `Chakra` are evocative, but too fictionally and metaphysically loaded for a protocol that should also model robots, vehicles, machines, and simulations.

`Pool` is intentionally plainer: it means an edge-less, body-associated collection of containment points. A pool belongs to a `Body`, but it does not participate in the rooted physical graph.

This is a stricter ontology than "anything may be attached anywhere." A `Body` has exactly one rooted physical graph and zero or more body-level pools.

In target ontology:

```ts
type Body = {
  root: SlotId;
  slots: Record<SlotId, BodySlot>;
  pools: Record<PoolId, Pool>;
};
```

The distinction becomes:

- `slots`: connected physical arrangement
- `pools`: edge-less associated containment collections owned by the body

The body-level pool map is intentionally plural:

```ts
pools: {
  floating: { accepts: [{ kind: "item", type: "floating" }] },
  thrown: { accepts: [{ kind: "item", type: "thrown" }] },
  cargo: { accepts: [{ kind: "item", type: "cargo" }] },
  external: { accepts: [{ kind: "module", type: "external" }] }
}
```

A single body can host multiple pools because pools represent distinct non-graph containment contexts. Each pool id is unique within its body.

Consumer concepts like "aura", "nearby", "floating", "thrown", "cargo", "inventory", or "external modules" can be represented as pools without those names entering the core protocol.

Slot-scoped pools are intentionally out of scope for the first version of this direction:

```ts
// Not proposed for now.
body.slots.head.pools = {
  surface: {},
  internal: {}
};
```

Slot-local containment should be represented with `slot.contains`. Body-level pools should represent containment that belongs to the body as a whole but is not part of the physical slot graph.

## Contained Elements

The contained element shape should be thin enough to avoid becoming an item database, but structured enough to remain portable JSON.

Possible minimal shape:

```ts
type ContainedElement = {
  kind: string;
  id?: string;
  data?: unknown;
};
```

Examples:

```ts
{ kind: "item", id: "hat-001" }
{ kind: "module", id: "sensor-array" }
{ kind: "state", data: { damaged: true } }
{ kind: "paperdoll", id: "face-body" }
```

This keeps the protocol from needing to know what a hat, sensor, or damage state means. Consumers own those meanings.

The protocol can still validate the envelope:

- `kind` must be a valid token
- `id`, if present, must be a string
- `data`, if present, is opaque consumer data

The protocol should not validate opaque data unless a future extension mechanism is explicitly designed.

## Recursive Paperdolls

Recursive containment is a useful design target.

For example, a `head` slot could contain another paperdoll document that models a face:

```ts
{
  kind: "paperdoll",
  data: {
    protocol: "paper-doll/v1",
    body: {
      root: "nose",
      slots: {},
      pools: {}
    }
  }
}
```

This is powerful, but it should be introduced carefully.

Recursive documents complicate:

- validation depth
- error paths
- identity and id collision rules
- derived layout boundaries
- cyclic references
- serialization size
- consumer rendering decisions

The first version of containment may be better served by allowing references to nested paperdolls rather than inline recursive documents:

```ts
{ kind: "paperdoll", id: "face-body" }
```

Inline recursion can remain a later extension if it proves necessary.

## Constraints

`accepts` should be reframed as containment compatibility, not equipment category.

The previous `accepts: string[]` form was small, JSON-friendly, and consumer-defined. The v1 protocol keeps the consumer-defined spirit but makes each token typed.

In the new language:

```ts
accepts: [
  { kind: "item", type: "hat" },
  { kind: "module", type: "sensor" },
  { kind: "paperdoll", type: "face" }
]
```

means:

> this slot or pool can contain elements matching these consumer-defined compatibility tokens.

The protocol does not need to know what `item:hat` means. It only needs to preserve the token and, possibly, provide small matching helpers.

## Why Not a Full Constraint Language Yet?

A richer model could distinguish:

- accepted kinds
- rejected kinds
- required traits
- capacities
- quantities
- exclusive occupancy
- multi-slot items
- consumer namespaces

That may become necessary later. It is not necessary yet.

The current package should avoid overfitting to imagined inventory systems. Typed tokens give consumers enough room to experiment without forcing the protocol to become a rules engine.

## Candidate Matching Helper

If the protocol keeps `accepts`, a small helper could be useful:

```ts
type Containable = {
  kind: string;
  type?: string;
};

function canContain(container: { accepts?: readonly AcceptToken[] }, element: Containable): boolean;
```

The simplest version could match against:

- `element.kind`
- optional `element.type`

This should remain optional API sugar. The protocol's central responsibility is still structural validity.

## Implications

This direction is implemented in `paper-doll/v1`:

- `equipped` is removed from the core document.
- `contains` is the general containment primitive.
- `accepts` remains, but uses consumer-defined typed compatibility tokens.
- `EquipmentZone` is renamed to `Pool`.
- `body.zones` is replaced by `body.pools`.
- A `Body` supports zero or more pools.
- Pools are body-level only.
- Existing equipment use cases become a consumer convention over containment.

For example:

```ts
body.slots.head.contains = [{ kind: "item", id: "hat-001" }];
body.slots.head.accepts = [{ kind: "item", type: "hat" }, { kind: "item", type: "helmet" }];
```

An RPG can call this "equipped." The protocol should call it "contained."

## Boundary

`paperdoll` should own:

- graph topology
- structural validation
- deterministic derived abstract layout
- body-level pool existence
- containment envelopes
- compatibility token preservation
- pure mutation helpers

Consumers should own:

- item definitions
- item behavior
- item rendering
- labels
- icons
- localization
- inventory rules
- game-specific capacity rules
- semantic interpretation of compatibility tokens

## Open Decisions

Future follow-up decisions:

- whether contained elements are inline values, references, or both
- whether recursive paperdoll documents are allowed immediately
- whether `contains` belongs directly on slots and pools or in a separate state layer

Settled and implemented by this RFC:

- `EquipmentZone` became `Pool`.
- `body.zones` became `body.pools`.
- a body may have multiple pools.
- pools are body-level only for now.
- the containment field is named `contains`.
- `accepts` uses typed `{ kind, type? }` tokens.

## Working Principle

The durable abstraction is not equipment.

The durable abstraction is constrained containment inside a body-like arrangement.
