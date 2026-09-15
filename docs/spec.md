# paper-doll/v3 — Normative specification

Status: current protocol dialect. Published by `paperdoll@0.8.3`.

This document is the normative, language-independent definition of
`paper-doll/v3`. The JSON Schema is a structural companion; the RFCs and the
2026-07 transcript are historical design records. When they disagree with
this document, this document controls.

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe
interoperability requirements.

<a id="document-grammar"></a>
## Document grammar

A document has exactly this recursive JSON shape:

```jsonc
{
  "protocol": "paper-doll/v3",
  "body": {
    "root": "<vessel-id>",
    "vessels": {
      "<vessel-id>": {
        "accepts": [
          { "kind": "<id>", "type": "<id, optional>" }
        ],
        "contains": [
          {
            "kind": "<id>",
            "type": "<id, optional>",
            "id": "<id, optional>",
            "data": "<any finite JSON value, optional>",
            "body": "<body, optional>"
          }
        ],
        "ports": {
          "top":    { "vessel": "<vessel-id>", "side": "bottom" },
          "right":  { "vessel": "<vessel-id>", "side": "left" },
          "bottom": { "vessel": "<vessel-id>", "side": "top" },
          "left":   { "vessel": "<vessel-id>", "side": "right" }
        }
      }
    }
  }
}
```

Only `protocol`, `body`, `root`, and `vessels` are required. A vessel may omit
all three of `accepts`, `contains`, and `ports`. Within an accept token only
`kind` is required. Within a contained element only `kind` is required.
Within a port address both `vessel` and `side` are required. Unknown members
are invalid at every defined object level.

An **id** is a string matching `^[a-z][a-z0-9-]*$`. Vessel-map keys, `root`,
element `kind`, `type`, and `id`, and token `kind` and `type` all use this
grammar. A side is exactly one of `top`, `right`, `bottom`, or `left`.

`accepts` and `contains`, when present, are arrays. Their order is retained.
`ports`, when present, is an object with at most one member for each side.
JSON object member names MUST be unique in interchange. `data` may be any
finite JSON value: null, a boolean, a finite JSON number, a string, an array
of finite JSON values, or an object with unique names and finite JSON values.
It is opaque to every law except the requirement that it be JSON-compatible.
Cycles, `NaN`, infinities, functions, symbols, and host objects are not JSON
values.

A **body** is the object containing `root` and `vessels`. Embedded bodies omit
the outer `protocol` wrapper but obey this entire body grammar and all eight
laws below.

## Validity

A document is valid exactly when it obeys the document grammar and its body,
recursively, obeys all eight laws. Validators SHOULD collect independent
violations rather than stop at the first one, but error ordering and prose are
not protocol data. Error paths use `$` for the document, dot-separated member
names, and decimal array indices; for example,
`$.body.vessels.hand.contains.0.id`.

<a id="law-1-rootedness"></a>
### Law 1 — Rootedness

`body.root` MUST name an own member of `body.vessels`. Inherited properties or
host-language prototype members do not count.

<a id="law-2-reciprocity"></a>
### Law 2 — Reciprocity

For every port `vessels[A].ports[S] = { vessel: B, side: T }`, vessel `B`
MUST exist and `vessels[B].ports[T]` MUST equal
`{ vessel: A, side: S }`. A connection is therefore represented twice in a
body, once from each endpoint.

<a id="law-3-opposition"></a>
### Law 3 — Opposition

Connections MUST join opposite faces:

| Side | Required opposite |
|---|---|
| `top` | `bottom` |
| `right` | `left` |
| `bottom` | `top` |
| `left` | `right` |

Thus the `T` in law 2 MUST be the required opposite of `S`.

<a id="law-4-planarity"></a>
### Law 4 — Planarity

Give the root coordinate `(0, 0)` and use these side vectors:

| Side | `(dx, dy)` |
|---|---|
| `top` | `(0, -1)` |
| `right` | `(1, 0)` |
| `bottom` | `(0, 1)` |
| `left` | `(-1, 0)` |

For every port from a positioned vessel at `(x, y)`, its target MUST be at
`(x + dx, y + dy)`. Every path from the root to a vessel MUST imply the same
coordinate, and two distinct vessels in the root component MUST NOT occupy
the same coordinate.

<a id="law-5-reachability"></a>
### Law 5 — Reachability

Every vessel that has at least one port MUST be connected to the root through
ports. A vessel outside the root component is valid only when it has no
ports; such a vessel is **free**.

<a id="law-6-compatibility"></a>
### Law 6 — Compatibility

An accept token matches a contained element exactly when their `kind` values
are equal and either the token omits `type` or its `type` equals the element's
`type`.

If a vessel omits `accepts`, it is **open** and every structurally valid
element is accepted. If a vessel contains `accepts`, every element in
`contains` MUST match at least one listed token. Consequently `accepts: []`
is **sealed** and accepts no element. Token order has no effect on matching.

<a id="law-7-recursive-validity"></a>
### Law 7 — Recursive validity

Every `element.body`, when present, MUST obey the body grammar and all eight
laws. Validation continues at every nesting depth in the finite document.

<a id="law-8-identity"></a>
### Law 8 — Identity

An element `id`, when present, MUST obey the id grammar. Within one vessel,
no two contained elements may have the same `id`. The same element id may be
reused in a different vessel or embedded body. Elements without ids are
valid but cannot be addressed.

<a id="addressing"></a>
## Addressing

A paper-doll/v3 address is one or more id segments separated by `/`, with no
leading slash, trailing slash, or empty segment. It alternates:

```text
vessel-id / element-id / vessel-id / element-id / ...
```

Resolution starts in the supplied body. The first segment selects a vessel.
If it is the last segment, the address resolves to that vessel. Otherwise the
next segment selects, by `id`, an element in that vessel's `contains`. If it
is the last segment, the address resolves to that element. Otherwise the
element MUST carry a `body`; resolution enters that body and repeats with the
next vessel segment.

`parseAddress(address)` returns the segment array for well-formed syntax and
throws for malformed syntax. `resolveAddress(body, address)` first applies
that syntax rule; it throws on malformed syntax, returns `null` when a
well-formed path does not resolve, and otherwise returns one of:

```ts
{ kind: "vessel", body: containingBody, vesselId, vessel }
{ kind: "element", body: containingBody, vesselId, index, element }
```

The `body` and `vessel`/`element` fields are the resolved values in the
current nesting scope. `index` is the element's current array index. Law 8
makes element selection unambiguous and makes addresses stable under
`contains` reordering. Resolution requires a valid body.

<a id="layout"></a>
## Derived connections and layout

`deriveConnections(body)` returns every reciprocal port pair once as
`{ from: {vessel, side}, to: {vessel, side} }`. Endpoint orientation and the
array order carry no protocol meaning.

`deriveLayout(body)` requires a valid body and returns:

```ts
{
  figure: Record<VesselId, { x: number, y: number }>,
  free: VesselId[],
  connections: Connection[]
}
```

`figure` contains exactly the root component with coordinates derived by law
4. `free` contains exactly the vessels outside that component, sorted by
vessel id in ascending code-point order. `connections` is the result of
`deriveConnections`; its sequence order is not significant. A caller-domain
violation may throw. Implementations MUST NOT impose arbitrary document-size
or nesting limits as protocol laws, though normal host memory, recursion, and
execution limits may prevent processing a particular finite value.

<a id="equality"></a>
## Equality used by the paper family

These definitions are shared by paperdoll, paperchain, paperfold, and
papermold:

1. **JSON structural equality** compares JSON values recursively. Object
   member order is ignored; member names and values must match. Array order is
   preserved. Strings and booleans compare by value, null equals null, and
   finite numbers compare by numeric value.
2. **Body canonical equality** is JSON structural equality after recursively
   removing every vessel's empty `ports: {}` and empty `contains: []`.
   Nothing else is removed or reordered. In particular, absent `accepts` and
   `accepts: []` are distinct because they mean open and sealed.
3. **Connection equality** compares an unordered pair of endpoints. A
   connection recorded `A:S` to `B:T` equals the same connection recorded
   `B:T` to `A:S`.
4. **Paperchain relation equivalence** compares `kind`, `from`, and `to`
   structurally for asymmetric kinds. For symmetric kinds it compares the
   endpoint pair without orientation. Paperchain uses this equivalence for
   duplicate detection and removal matching.
5. **Paperfold scene storage equality** uses body canonical equality, JSON
   structural equality for kind declarations, and the exact stored
   `(kind, from, to)` orientation of every relation. Relation-table order is
   ignored after sorting by `(kind, from, to)`. A reversed symmetric relation
   is equivalent to the original in paperchain while remaining a different
   stored scene value in paperfold.

<a id="editing-operations"></a>
## Editing operations

The seven editing operations are pure: they return fresh values and do not
mutate their inputs. Their `Body`, endpoint, vessel, element, and option
arguments are assumed to satisfy the exported structural types (or an
equivalent caller-domain contract in another language). The edits are not
arbitrary-JSON validators: behavior outside those structural types is
unspecified, and a successful edit does not establish document validity.
External JSON MUST pass through the relevant validator or parser before it is
used as a typed edit argument.

Within that structural caller domain, the checked preconditions listed for
each operation throw on violation and produce no result. Edits need not leave
every intermediate body globally planar or reachable during a multi-step
transaction; those laws are checked by `validateDocument`/`parseDocument`
after the batch. Returned vessels, elements, and connections are records of
the state actually removed or overwritten.

### `connect(body, from, to)`

Preconditions: both endpoints name existing vessels and valid sides; the
vessels differ; `to.side` is opposite `from.side`. The operation removes any
connections occupying either endpoint, then installs one reciprocal
connection from `from` to `to`.

Returns `{ body, displaced }`, where `body` is the edited body and
`displaced` contains each overwritten connection once under connection
equality (zero, one, or two records).

### `disconnect(body, endpoint)`

Preconditions: `endpoint` names an existing vessel and a valid side. If the
endpoint is occupied, the operation removes both halves of its reciprocal
connection. An empty endpoint is a valid no-op.

Returns `{ body, removed }`, where `removed` is the removed connection or
`null` when the endpoint was empty.

### `insertVessel(body, vessel?, options?)`

`vessel` defaults to `{}`. Its caller-domain type is a valid vessel shape
without `ports`; the operation assumes that type rather than validating an
arbitrary runtime object. The operation checks that `options.id`, when
supplied, is a valid unused id. When omitted, the chosen id is the first
`vessel-N` (`N` starting at 1) absent from `body.vessels`.

Without `options.at`, the operation inserts a free vessel. With `options.at`,
that endpoint MUST name an existing vessel and valid side. If it is empty,
the operation connects it to the new vessel's opposite side. If occupied,
the operation splits the existing connection: the old neighbor connects to
the new vessel on the `at` side, and `at` connects to the new vessel on its
opposite side.

Returns `{ body, vesselId, bridged }`, where `vesselId` is the chosen id and
`bridged` is the pre-existing connection that was split, or `null`.

### `deleteVessel(body, vesselId, options?)`

Preconditions: `vesselId` exists and is not `body.root`. The operation removes
the vessel and every connection incident to it.

If `options.collapseOppositeNeighbors` is true, and the deleted vessel had
exactly two connections through opposite sides to two different neighbor
vessels, those neighbor endpoints are connected. Otherwise no collapse is
performed.

Returns `{ body, vessel, collapsed }`, where `vessel` is the exact deleted
vessel and `collapsed` is the created neighbor connection or `null`.

### `insertElement(body, vesselId, element, at?)`

`element` has the caller-domain type `ContainedElement`; in particular its
`data`, when present, is already a finite JSON value and it has no unknown
members. The operation does not independently validate `data` or reject
unknown runtime members. It does check that the destination vessel exists;
`kind` and optional `type`/`id` obey the id grammar; an optional embedded body
is valid; the destination accepts the element under law 6; the element id, if
present, is unused there; and `at`, when supplied, is an integer from 0
through the current `contains.length` inclusive. Omitted `at` means append.

Returns the edited `Body`.

### `removeElement(body, vesselId, index)`

Preconditions: the vessel exists and `index` is an integer from 0 through
`contains.length - 1`. The operation removes exactly that array element.

Returns `{ body, element }`, where `element` is the exact removed value.

### `moveElement(body, from, index, to)`

Preconditions: both vessels exist; `index` selects an element in `from`; the
destination accepts that element; and, when the vessels differ, the element's
id does not collide in `to`. The operation removes the element from its
current position and appends it to `to`. When `from === to`, this moves the
element to the end of that vessel.

Returns the edited `Body`. Destination checks occur before removal, so failure
is atomic.

<a id="failure-channels"></a>
## Normative status and failure channels

`validateDocument` accepts any finite JSON value and returns
`ProtocolError[]`; it does not throw merely because the value is invalid.
`parseDocument` accepts the same domain and returns `Result`, containing a
deep copy on success or validation errors on failure. `assertDocument` throws
when parsing fails. Error message prose and collection order are not
interchange requirements.

`parseAddress` throws on malformed syntax, and `deriveLayout` may throw when
its typed body violates the layout derivation preconditions. Within the edits'
typed structural caller domain, the checked violations listed under the seven
operations throw. Out-of-domain structural argument behavior is unspecified;
edit success MUST NOT be treated as validation. `resolveAddress`
distinguishes malformed syntax (throw) from a well-formed missing path
(`null`). Fragment validators are supporting API for sibling implementations
and append errors to their supplied array.

All totality statements concern finite JSON values and are conditional on
ordinary host resources. Stack exhaustion, memory exhaustion, cancellation,
or configured execution budgets are runtime failures, not protocol verdicts.

## Historical design records

The files `rfc-*.md`, `core-ontology.md`, and
`transcript-2026-07-building-the-paper-family.md` explain the design's
lineage. They do not add normative requirements. The structural companion is
[`../schema/paper-doll-v3.schema.json`](../schema/paper-doll-v3.schema.json).
Package and dependency compatibility is recorded in
[`family-compatibility.md`](family-compatibility.md).
