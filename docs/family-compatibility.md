# paper* family compatibility

This document separates protocol dialects, published npm artifacts, and
unreleased repository contents. A dialect string inside a JSON document is
not an npm package version, and changing a package dependency floor does not
create a new protocol dialect.

## Current published artifacts

These are the published package versions and the dependency ranges carried by
those published artifacts:

| Protocol dialect | Current published artifact | Published runtime dependency contract |
|---|---|---|
| `paper-doll/v3` | `paperdoll@0.8.3` | none |
| `paperchain/v1` | `paperchain@0.1.0` | `paperdoll ^0.8.2` |
| `paperfold/v1`, `paperfold/v2` | `paperfold@0.2.0` | `paperdoll ^0.8.2`, `paperchain ^0.1.0` |
| `papermold/v1`, `papermold/v2` | `papermold@0.2.0` | `paperdoll ^0.8.2`, `paperchain ^0.1.0` |

The caret ranges above describe npm resolution. They do not weaken the
normative protocol dependency: all sibling dialects in this table consume
`paper-doll/v3`, and the v2 scene dialects consume `paperchain/v1` where their
specifications say so.

## Prepared release set

The following additive releases are prepared for joint verification. This table
records the intended dependency contracts, not a claim that the artifacts have
already been published:

| Prepared artifact | Runtime dependency contract |
|---|---|
| `paperdoll@0.9.0` | none |
| `paperchain@0.2.0` | `paperdoll ^0.9.0` |
| `paperfold@0.3.0` | `paperdoll ^0.9.0`, `paperchain ^0.2.0` |
| `papermold@0.3.0` | `paperdoll ^0.9.0`, `paperchain ^0.2.0` |

All protocol dialect strings stay unchanged. The additive
`paper-json-portable/v1` profile supplies a separate numeric portability verdict;
it does not narrow the valid sets of the existing dialects. Corpus v2 and the
viewer opt into that profile. Paperchain's optional conformance tooling includes
independent standard-library Python references; it adds no upward runtime
package dependency.

Update the published table only after observing the corresponding registry
artifacts. Package versions and protocol dialect versions remain independent.

## Normative specifications

- [`paper-doll/v3`](spec.md)
- [`paperchain/v1`](https://github.com/urcades/paperchain/blob/main/docs/spec.md)
- [`paperfold/v1` and `paperfold/v2`](https://github.com/urcades/paperfold/blob/main/docs/spec.md)
- [`papermold/v1` and `papermold/v2`](https://github.com/urcades/papermold/blob/main/docs/spec.md)

Schemas describe structural shape only. The linked specifications define the
semantic laws, equality, operation domains, and failure channels.
