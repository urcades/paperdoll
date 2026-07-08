# Core Ontology

This note records the current protocol boundary for `paperdoll`.

`paperdoll` is a thin arrangement and containment protocol for body-like systems. It models one rooted physical graph plus zero or more body-level pools. It does not model presentation, item behavior, localization, or game-specific inventory rules.

## Core Model

The core protocol owns these concepts:

- `Body`: the model root for one body-like arrangement.
- `Slot`: a physical node in the rooted body graph.
- `Port`: one directional connection face on a slot: `top`, `right`, `bottom`, or `left`.
- `Connection`: a reciprocal, face-opposite relationship between two ports.
- `Pool`: an edge-less, body-level containment collection that does not participate in graph reachability.
- `AcceptToken`: a typed compatibility token with `{ kind, type? }`.
- `ContainedElement`: an opaque contained element envelope with `{ kind, id?, data? }`.
- `DerivedLayout`: deterministic abstract coordinates derived from the rooted body graph, plus deterministic pool positions.
- `Mutation`: pure operations that return new bodies. Helpers enforce local structural invariants (existing endpoints, face-opposite connections, no self-connections) and throw on violation; graph-global properties (root reachability, layout collisions) are checked by validation, which callers run after a batch of edits.
- `Validation`: runtime checks for external JSON or editor input.

The protocol is intentionally narrow. It should answer questions like:

- Is this body valid?
- Which physical slots are connected?
- Is every physical slot reachable from the root?
- Do all connections reciprocate through opposite faces?
- What abstract coordinates fall out of the rooted graph?
- Which body-level pools exist?
- What slots or pools declare compatibility with a contained element kind/type?
- What body results from inserting, deleting, connecting, or disconnecting nodes and pools?

## Consumer Model

Consumers own these concepts:

- icons
- labels and localized display names
- colors
- typography
- node sizes
- connector lengths
- canvas panning and zooming
- selected, hovered, focused, and edited UI states
- sprite or item art
- item definitions and behavior
- semantic interpretation of `AcceptToken`
- semantic interpretation of `ContainedElement.data`

The protocol should not imply that a face slot is represented by a glyph, that a hand is rendered with a particular label, or that derived coordinates map to a specific pixel grid. Those are renderer decisions.

## Current Decisions

The protocol document uses `protocol: "paper-doll/v1"`.

The following presentation fields are not part of the protocol:

- `icon`
- `label`
- `view`

The following v0 equipment-interface concepts are removed:

- `body.zones`
- `body.equipped`
- `EquipmentZone`
- `insertZone`
- `deleteZone`

The v1 replacements are:

- `body.pools`
- `Pool`
- `insertPool`
- `deletePool`
- `slot.contains`
- `pool.contains`

## Pools

A `Body` has exactly one rooted physical slot graph and zero or more body-level pools.

Pools are plural by design:

```ts
type Body = {
  root: SlotId;
  slots: Record<SlotId, BodySlot>;
  pools: Record<PoolId, Pool>;
};
```

Pools are not slots, cannot have ports, and are not required to be reachable from the root. They represent body-associated containment contexts such as floating, thrown, cargo, external modules, aura, nearby, or similar consumer-defined ideas.

Slot-scoped pools are intentionally out of scope. Slot-local containment belongs in `slot.contains`.

## Containment

Slots and pools can both contain consumer-defined elements:

```ts
type ContainedElement = {
  kind: string;
  id?: string;
  data?: JsonValue;
};
```

`kind` is a lowercase protocol id. `id` is an optional consumer id. `data` is JSON-compatible and opaque to paperdoll.

An RPG can interpret a contained item as "equipped." The protocol calls it "contained."

## Compatibility

Slots and pools can both declare typed accept tokens:

```ts
type AcceptToken = {
  kind: string;
  type?: string;
};
```

`paperdoll` validates token shape and preserves tokens. Consumers decide what those tokens mean.

## Working Principle

`paperdoll` should remain a protocol and functional toolkit for arranging constrained, body-like containment graphs.

It should not become a UI kit, an inventory system, a localization layer, or an item database.
