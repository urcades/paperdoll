# paperdoll

`paperdoll` is a small TypeScript protocol library for modeling body-like containment graphs: rooted arrangements of vessels connected by directional ports, with typed compatibility tokens, contained elements, recursive embedded bodies, and deterministic derived layout.

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
    vessels: {
      body: {
        accepts: [{ kind: "item", type: "body" }],
        contains: [{ kind: "item", type: "body", id: "jacket" }],
        ports: {
          top: { vessel: "head", side: "bottom" }
        }
      },
      head: {
        accepts: [{ kind: "item", type: "hat" }],
        ports: {
          bottom: { vessel: "body", side: "top" }
        }
      },
      floating: {
        accepts: [{ kind: "item", type: "floating" }],
        contains: [{ kind: "item", type: "floating", id: "glowsphere" }]
      }
    }
  }
};

const parsed = parseDocument(document);
if (!parsed.ok) throw new Error(parsed.errors[0].message);

const layout = deriveLayout(parsed.value.body);
console.log(layout.figure.body); // { x: 0, y: 0 }
console.log(layout.figure.head); // { x: 0, y: -1 }
console.log(layout.free); // ["floating"]
```

## The Model

A **body** is a set of named **vessels** with one distinguished root. A vessel is a container with optional compatibility declarations (`accepts`), optional contents (`contains`), and optional connection faces (`ports`).

- The **figure** of a body is the connected component of the root. It gets deterministic abstract coordinates.
- A vessel outside the figure with no ports is a **free vessel** (what a consumer might call a pool, an aura, cargo, or "nearby"). Free vessels are reported as a sorted list without coordinates; where to draw them is a renderer decision.
- A vessel outside the figure *with* ports is invalid.

An **element** is a thing contained: `{ kind, type?, id?, data?, body? }`. It is opaque to the protocol except for its typed envelope — and except when it embeds a `body`, which the protocol validates recursively. A backpack is an element *and* a body.

## Laws

Validity is the conjunction of seven laws, applied recursively to every embedded body:

1. **Rootedness** — `root` names an existing vessel.
2. **Reciprocity** — every port is reciprocated by its target.
3. **Opposition** — ports connect only opposite faces (`top↔bottom`, `left↔right`).
4. **Planarity** — derived figure coordinates are collision-free and consistent.
5. **Reachability** — every ported vessel is in the figure.
6. **Compatibility** — in a vessel that declares `accepts`, every contained element matches at least one accept token. Absent `accepts` is open; `accepts: []` is sealed.
7. **Recursive validity** — every embedded body is itself valid.

Matching is purely structural: a token `{ kind, type? }` matches an element when kinds are equal and the token's `type`, if present, equals the element's `type`. The protocol never interprets what a kind means.

## Editing Bodies

```ts
import { connect, insertVessel, insertElement, moveElement } from "paperdoll";

// grow the figure: bridge a new vessel into an existing connection
const { body: withElbow, vesselId } = insertVessel(body,
  { accepts: [{ kind: "item", type: "arm" }] },
  { at: { vessel: "body", side: "right" }, id: "elbow" }
);

// or create a free vessel
const { body: withCargo } = insertVessel(body, { accepts: [{ kind: "item", type: "cargo" }] });

// containment is law-checked at the door
const stocked = insertElement(withElbow, "elbow", { kind: "item", type: "arm", id: "prosthetic" });
insertElement(withElbow, "elbow", { kind: "item", type: "hat" });
// throws: Element "item/hat" is not accepted by vessel "elbow".

// moves are atomic: the destination is checked before removal
const swapped = moveElement(body, "left-hand", 0, "right-hand");
```

All editing helpers return new objects and do not mutate their inputs. Operations enforce local laws (existing endpoints, opposition, no self-connections, compatibility) and throw on violation; graph-global laws (planarity, reachability) are checked by `parseDocument` / `validateDocument`, which callers run after a batch of edits — legitimate multi-step edits pass through globally incomplete states.

## Migrating from v1

`paper-doll/v1` documents (separate `slots` and `pools`) are rejected by the v2 parser with errors pointing at `migrateV1`:

```ts
import { migrateV1 } from "paperdoll";

const migrated = migrateV1(v1Document);
if (migrated.ok) {
  // migrated.value is a valid paper-doll/v2 document
}
```

Migration merges `slots` and `pools` into `vessels` (id collisions are an error) and rewrites port addresses from `{ slot, side }` to `{ vessel, side }`. Note that law 6 is mandatory in v2: a v1 document whose contents violate its own `accepts` declarations will fail migration with precise errors.

## Portability

The protocol is not the TypeScript library — it is the document format plus the laws. [`schema/paper-doll-v2.schema.json`](schema/paper-doll-v2.schema.json) is a JSON Schema (2020-12) capturing the structural laws; laws 2–7 beyond schema expressiveness are specified in [`docs/rfc-vessel-calculus.md`](docs/rfc-vessel-calculus.md). Any language can validate paperdoll documents.

## API

- constants: `PAPER_DOLL_PROTOCOL`, `SIDES`, `OPPOSITE_SIDES`
- validation: `parseDocument`, `assertDocument`, `validateDocument`, `formatProtocolErrors`
- migration: `migrateV1`
- graph/layout: `deriveConnections`, `deriveLayout`
- compatibility queries: `matches`, `isAccepted`
- topology operations: `connect`, `disconnect`, `insertVessel`, `deleteVessel`
- containment operations: `insertElement`, `removeElement`, `moveElement`
- types: `AcceptToken`, `Body`, `ContainedElement`, `DerivedLayout`, `Endpoint`, `JsonValue`, `PaperDollDocument`, `Vessel`, `VesselId`, `Side`, and related helper types

Validation is strict: unknown keys anywhere in a document are rejected, so presentation or game data cannot ride along inside protocol documents. Attach consumer data through `ContainedElement.data` (which is opaque to the protocol, always) or keep it outside the document keyed by vessel id. `parseDocument` returns a deep copy of its input.

## Design Notes

See [`docs/core-ontology.md`](docs/core-ontology.md) for the protocol boundary, and [`docs/rfc-vessel-calculus.md`](docs/rfc-vessel-calculus.md) for the vessel calculus that defines v2.
