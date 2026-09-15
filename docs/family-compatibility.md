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

## Unreleased repository contents

The current `paperchain` and `paperfold` branches still carry manifest versions
`0.1.0` and `0.2.0`, respectively, but now require `paperdoll ^0.8.3`. These
are unreleased dependency-floor changes relative to the published
`paperchain@0.1.0` and `paperfold@0.2.0` artifacts; they are not evidence of
new published package versions. The current `papermold` branch remains on its
published `paperdoll ^0.8.2` dependency floor.

No package version has been bumped for a next local release train, so this
document does not present one as current. Update the published table only
after the corresponding artifacts actually exist.

## Normative specifications

- [`paper-doll/v3`](spec.md)
- [`paperchain/v1`](https://github.com/urcades/paperchain/blob/main/docs/spec.md)
- [`paperfold/v1` and `paperfold/v2`](https://github.com/urcades/paperfold/blob/main/docs/spec.md)
- [`papermold/v1` and `papermold/v2`](https://github.com/urcades/papermold/blob/main/docs/spec.md)

Schemas describe structural shape only. The linked specifications define the
semantic laws, equality, operation domains, and failure channels.
