# paperdoll

`paperdoll` is a small TypeScript protocol library for modeling body-like containment graphs: rooted physical slot graphs, directional ports, body-level pools, typed compatibility tokens, contained elements, and deterministic derived layout.

It has no runtime dependencies and does not include a renderer. Presentation concerns such as labels, icons, colors, typography, node sizing, and canvas controls belong to consumers.

## Install

```sh
npm install paperdoll
```

## Minimal Document

```ts
import { PAPER_DOLL_PROTOCOL, parseDocument, deriveLayout } from "paperdoll";

const document = {
  protocol: PAPER_DOLL_PROTOCOL,
  body: {
    root: "body",
    slots: {
      body: {
        accepts: [{ kind: "item", type: "body" }],
        contains: [{ kind: "item", id: "jacket" }],
        ports: {
          top: { slot: "head", side: "bottom" }
        }
      },
      head: {
        accepts: [{ kind: "item", type: "hat" }],
        ports: {
          bottom: { slot: "body", side: "top" }
        }
      }
    },
    pools: {
      floating: {
        accepts: [{ kind: "item", type: "floating" }],
        contains: [{ kind: "item", id: "glowsphere" }]
      }
    }
  }
};

const parsed = parseDocument(document);
if (!parsed.ok) throw new Error(parsed.errors[0].message);

const layout = deriveLayout(parsed.value);
console.log(layout.slots.body); // { x: 0, y: 0 }
console.log(layout.slots.head); // { x: 0, y: -1 }
console.log(layout.pools.floating); // { x: -2, y: -1 }
```

## Editing Bodies

```ts
import { connect, insertPool, insertSlot } from "paperdoll";

const withHead = connect(body, { slot: "body", side: "top" }, { slot: "head", side: "bottom" });

const { body: nextBody, slotId } = insertSlot(withHead, { slot: "body", side: "right" }, {
  accepts: [{ kind: "item", type: "arm" }],
  contains: [{ kind: "module", id: "prosthetic-joint" }]
});

const { body: pooledBody, poolId } = insertPool(nextBody, {
  accepts: [{ kind: "effect", type: "aura" }]
});
```

All editing helpers return new objects and do not mutate their inputs. `insertSlot` and `insertPool` generate ids (`slot-N`, `pool-N`) unless you pass `{ id }` in the final options argument.

## Containment and Compatibility

```ts
import { insertElement, moveElement, removeElement, isAccepted, matches } from "paperdoll";

// append an element to a slot or pool
const stocked = insertElement(body, { slot: "head" }, { kind: "item", type: "hat", id: "straw-hat" });

// enforce accept tokens at the door
insertElement(body, { slot: "feet" }, { kind: "item", type: "hat" }, { checkCompatibility: true });
// throws: Element "item/hat" is not accepted by slot "feet".

// remove by index; move atomically between containers
const { body: lighter, element } = removeElement(stocked, { slot: "head" }, 0);
const swapped = moveElement(body, { slot: "left-hand" }, 0, { slot: "right-hand" });
```

Matching is structural: a token `{ kind, type? }` matches an element when kinds are equal and the token's `type`, if present, equals the element's `type`. A container with no `accepts` is open; `accepts: []` is sealed; a non-empty `accepts` admits only matching elements. Compatibility checking is opt-in (`checkCompatibility: true`) in v1 and becomes a validation law in v2 — see [`docs/rfc-vessel-calculus.md`](docs/rfc-vessel-calculus.md).

### What the helpers enforce

Mutation helpers enforce local structural invariants and throw on violations: endpoints must reference existing slots, connections must be face-opposite, and a slot cannot connect to itself. Graph-global properties — reachability from the root and derived-layout collisions — are intentionally not re-checked on every edit, because multi-step edits (disconnect, then reconnect elsewhere) pass through states that are locally sound but globally incomplete. After a batch of edits, validate the result with `parseDocument` or `validateDocument` before treating it as a protocol document.

## Constraints

- A physical body is a rooted graph.
- Every physical slot must be reachable from `body.root`.
- Connections must be reciprocal.
- Connections must be face-opposite: `top <-> bottom`, `left <-> right`.
- Layout is derived from the rooted graph.
- Derived physical slot coordinates must not collide.
- Non-graph containment belongs in body-level `pools`.
- Slots and pools can both have `accepts` and `contains`.
- Display metadata is intentionally out of protocol scope.

## API

The public API exports:

- constants: `PAPER_DOLL_PROTOCOL`, `SIDES`, `OPPOSITE_SIDES`
- validation: `parseDocument`, `assertDocument`, `validateDocument`, `formatProtocolErrors`
- graph/layout: `deriveConnections`, `deriveLayout`
- compatibility queries: `matches`, `isAccepted`
- mutation helpers: `connect`, `disconnect`, `insertSlot`, `deleteSlot`, `insertPool`, `deletePool`, `insertElement`, `removeElement`, `moveElement`
- types: `AcceptToken`, `Body`, `BodySlot`, `ContainedElement`, `DerivedLayout`, `DerivedNode`, `Endpoint`, `InsertOptions`, `JsonValue`, `PaperDollDocument`, `Pool`, `PoolId`, `Side`, `SlotId`, and related helper types

The v1 parser rejects legacy `body.zones`, `body.equipped`, and string-based `accepts` values. Use `body.pools`, `slot.contains` / `pool.contains`, and typed accept tokens instead.

Validation is strict: unknown keys anywhere in a document are rejected, so presentation or game data cannot ride along inside protocol documents. Attach consumer data through `ContainedElement.data` or keep it outside the document keyed by slot/pool id. `parseDocument` returns a deep copy of its input, so later mutation of the input cannot invalidate the parsed value.

## Design Notes

See [`docs/core-ontology.md`](docs/core-ontology.md) for the current ontology boundary.

See [`docs/rfc-containment-and-constraints.md`](docs/rfc-containment-and-constraints.md) for the shift from equipment-specific state toward generalized containment and compatibility constraints.
