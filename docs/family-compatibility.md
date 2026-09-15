# paper* family compatibility

Protocol dialect strings inside JSON documents are independent of npm package
versions. This matrix records the jointly verified release set published on
2026-09-15.

## Published artifacts

| Protocol dialect | Published artifact | Runtime dependency contract |
|---|---|---|
| `paper-doll/v3` | `paperdoll@0.9.0` | none |
| `paperchain/v1` | `paperchain@0.2.0` | `paperdoll ^0.9.0` |
| `paperfold/v1`, `paperfold/v2` | `paperfold@0.3.0` | `paperdoll ^0.9.0`, `paperchain ^0.2.0` |
| `papermold/v1`, `papermold/v2` | `papermold@0.3.0` | `paperdoll ^0.9.0`, `paperchain ^0.2.0` |

All four npm artifact integrity hashes match their locally verified tarballs.
The caret ranges describe npm resolution; all sibling dialects consume
`paper-doll/v3`, and the v2 scene dialects consume `paperchain/v1` where their
specifications say so.

## Portability and optional tooling

The additive `paper-json-portable/v1` profile supplies a separate numeric verdict.
It does not narrow the existing dialect validators or schemas. Corpus v2 and the
viewer opt into the profile: finite binary64 numbers, with integral values bounded
to `±9007199254740991`. Exact larger integers in opaque data can use decimal
strings; existing numeric control fields do not acquire a string form.

Paperchain packages optional standard-library Python references and the compiled
`paperchain/conformance/v2` transport. Fold and Mold package their own fixtures and
cross-language scripts. These tools add no upward runtime dependency from Chain.

The verified suite includes 49 core v1 cases, 83 extended v2 cases covering 32
operations, 1,200 cross-language patch applications, and 768 supplemental judgment
comparisons. The viewer's assembly workshop is a second reference consumer; it
does not establish independent external adoption.

## Normative specifications

- [`paper-doll/v3`](spec.md)
- [`paperchain/v1`](https://github.com/urcades/paperchain/blob/main/docs/spec.md)
- [`paperfold/v1` and `paperfold/v2`](https://github.com/urcades/paperfold/blob/main/docs/spec.md)
- [`papermold/v1` and `papermold/v2`](https://github.com/urcades/papermold/blob/main/docs/spec.md)

Schemas describe structural shape. The linked specifications define semantic
laws, equality, operation domains, and failure channels.
