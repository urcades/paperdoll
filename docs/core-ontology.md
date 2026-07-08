# Core Ontology

This note records the current protocol boundary for `paperdoll`.

`paperdoll` is a thin arrangement and containment protocol for body-like systems — an algebra for arranging vessels. It models a set of named vessels: one rooted, connected figure plus zero or more free vessels, any of which may contain opaque elements or entire embedded bodies. It does not model presentation, item behavior, localization, or game-specific inventory rules.

## Core Model

The core protocol owns three primitives and one judgment:

- `Vessel`: a container with optional compatibility declarations (`accepts`), optional contents (`contains`), and optional connection faces (`ports`).
- `Body`: a set of named vessels with one distinguished root. The **figure** is the connected component of the root; a port-less vessel outside the figure is **free** (a derived property, not a stored kind).
- `Element`: a thing contained: `{ kind, type?, id?, data?, body? }`. Opaque to the protocol except for its typed envelope, and except when it embeds a `body`, which is validated recursively.
- `Validity`: the judgment. Seven laws — rootedness, reciprocity, opposition, planarity, reachability, compatibility, recursive validity — applied at every depth. See `rfc-vessel-calculus.md`.

Supporting concepts:

- `Port`: one directional connection face on a vessel: `top`, `right`, `bottom`, or `left`.
- `Connection`: a reciprocal, face-opposite relationship between two ports.
- `AcceptToken`: a typed compatibility token with `{ kind, type? }`. Matching is structural; the envelope is the type.
- `DerivedLayout`: deterministic abstract coordinates for the figure, plus the sorted list of free vessels.
- `Mutation`: pure operations that return new bodies. Operations enforce local laws (existing endpoints, opposition, no self-connections, compatibility) and throw on violation; graph-global laws (planarity, reachability) are checked by validation, which callers run after a batch of edits.

The protocol is intentionally narrow. It should answer questions like:

- Is this body valid, at every level of nesting?
- Which vessels are connected, and what coordinates fall out of the rooted figure?
- Which vessels are free?
- May this element sit in this vessel?
- What body results from inserting, deleting, connecting, disconnecting, or moving vessels and elements?

## Consumer Model

Consumers own these concepts:

- icons, labels, and localized display names
- colors, typography, node sizes, connector lengths
- canvas panning and zooming
- selected, hovered, focused, and edited UI states
- sprite or item art
- item definitions and behavior
- placement of free vessels on a canvas
- semantic interpretation of `kind` and `type` (nominal typing is on trust; the protocol matches names, never meanings)
- structural conformance of embedded bodies ("is this really mech-shaped?") — interfaces-for-bodies belong in a sibling protocol
- semantic interpretation of `ContainedElement.data`, which is opaque to the protocol, always

## Typing

**Bodies do not have types; elements do.** A body acquires a type only at the moment it is contained, via its envelope. A vessel's `accepts` governs what may sit in it; an embedded body's own vessels govern what *it* contains. Absent `accepts` is open, `accepts: []` is sealed, a non-empty set admits only matching elements.

## Version History

- `paper-doll/v1` removed v0's equipment interface (`body.zones`, `body.equipped`) in favor of generalized containment (`contains`) and pools. See `rfc-containment-and-constraints.md`.
- `paper-doll/v2` dissolved the slot/pool distinction into the single vessel primitive, made compatibility and recursive validity mandatory laws, added `element.body` for recursion, and published a JSON Schema. v1 documents migrate mechanically via `migrateV1`. See `rfc-vessel-calculus.md`.

## Working Principle

`paperdoll` should remain a protocol and functional toolkit for arranging constrained, body-like containment graphs — annealed, not grown. Proposals are tested against one question: does this subtract a concept or add a law?

It should not become a UI kit, an inventory system, a localization layer, or an item database.
