# Design Note: The First-Party Gamecraft Consumer

Status: design document (not an RFC — nothing here is protocol)
Relates to: `core-ontology.md`, `rfc-vessel-calculus.md`

## What this is

The paperdoll family is deliberately use-agnostic. This note records a deliberately *opinionated* thing: the shape of a first-party item/gamecraft system built on top of the family. It is a consumer, not a sibling protocol — it lives outside the `paper*` naming scheme, it may embed game-specific taste freely, and nothing in it constrains any other consumer.

It is persisted as a design document for two reasons:

1. Its mechanics are the best stress test the vessel calculus has had — each one lands on protocol machinery and validates it (or reveals what's missing).
2. It is the **demand signal** for sequencing the rest of the roadmap. Rather than speculating about which post-v2 layer to build next, build this; it will tell us exactly when each layer becomes real.

## The layer split

What the roadmap calls "interpretation — what do the symbols mean?" splits into two strata:

- **A protocol-shaped sliver**: a vocabulary manifest format — a document declaring the kinds and types a world uses, with optional subsumption (`weapon/dagger ⊑ weapon`) and deprecations, so tools in different languages can share a vocabulary without sharing game semantics. Small, real protocol. Deferred until two tools actually need to share a vocabulary.
- **Everything else**: a game system. This document. Unapologetically opinionated, hyper-aware of paperdoll, and the first citizen of the ecosystem rather than a peer of it.

## Mechanics and where they land

### Form-defining items (hairstyles, piercings, prosthetics)

Items that define a character's physical form rather than merely equipping onto it. Two readings, both already supported:

- **Mild**: a hairstyle is an element in a `hair` vessel; a piercing is an element in an `ear` vessel. Pure paper-doll/v2.
- **Deep**: an item that *changes the body's shape* is an element that carries a **paperfold patch** as its equip-effect — add a `tail` vessel, seal a slot, split `hair` into `bangs` + `ponytail`. "Equipping this reshapes you" = an element carrying dynamics.

The deep reading is the first genuinely novel composition of the family: **items as carriers of patches**. An equippable's definition includes an on-equip patch (and, for invertibility, its on-unequip inverse).

### Socketed items (materia, weapon modules)

This is `element.body`, verbatim — the payoff recursion was designed for:

```jsonc
{ "kind": "item", "type": "weapon", "id": "buster-sword",
  "body": {
    "root": "blade",
    "vessels": {
      "blade": { "ports": { "right": { "vessel": "materia-slot-1", "side": "left" } } },
      "materia-slot-1": {
        "accepts": [{ "kind": "materia" }],
        "ports": {
          "left": { "vessel": "blade", "side": "right" },
          "right": { "vessel": "materia-slot-2", "side": "left" }
        }
      },
      "materia-slot-2": {
        "accepts": [{ "kind": "materia", "type": "support" }],
        "ports": { "left": { "vessel": "materia-slot-1", "side": "right" } }
      }
    }
  }
}
```

Notes:

- Law 6 already enforces which materia fit which sockets.
- **Linked sockets** (support materia affecting the adjacent slot, FFVII-style) map onto the embedded body's *ports* — adjacency is first-class in the calculus, so "linked pair" is a derived fact (`deriveConnections`), not new machinery.
- Law 7 validates socket contents at every nesting depth for free.

### Wear and destructibility (durability, breakage)

- Durability **state** is `element.data` — consumer-owned, protocol-opaque, exactly as the ontology boundary prescribes. The gamecraft layer defines a data contract (e.g. `{ "durability": { "current": 17, "max": 40 } }`) that is invisible to the protocol.
- Wear **events** are paperfold patches: a tick mutates `data`; breaking swaps `iron-sword` for `broken-iron-sword` (Fire Emblem) or reshapes the item's embedded body — a shield losing its spike vessel (Dark Souls-flavored partial destruction).
- "How many hits until it breaks" is the first genuine consumer for the deferred **capacity/counting** law — the pull that layer was told to wait for.

## The consumer's actual shape

A library of **element conventions and patch generators**, written against paperdoll and (future) paperfold:

- *equippable*: an element whose definition includes an on-equip patch and its inverse.
- *socketed*: an element with an embedded body whose vessels declare socket compatibility.
- *wearable-out*: an element with a durability data contract and a breakage patch.
- *status effect* (from earlier design discussions): a scheduled patch generator whose thresholds reify as structural change, so profile conformance can observe them.

None of these constrain other consumers. All of them exercise the protocol layers.

## What this implies for roadmap sequencing

1. **paperfold is promoted.** The item mechanics above depend on it twice over (form-defining items, wear events). Its kernel prerequisite — every destructive paperdoll operation returns what it destroyed — is the next protocol work.
2. **The vocabulary manifest is demoted** to "when two tools need to share a vocabulary."
3. **Capacity waits for the durability system** to demand it, as designed.
4. The gamecraft layer itself is built as a first-party package once paperfold exists, and doubles as the ecosystem's existence proof.

## Non-goals

- This document defines no protocol. If a concept here turns out to be needed by *multiple unrelated* consumers, that is the signal to extract a sliver of it into a sibling protocol RFC — not before.
- The gamecraft layer never reaches into protocol internals: it composes exported operations and reads derived facts. If it can't express a mechanic that way, that inexpressibility is protocol feedback and goes through an RFC.
