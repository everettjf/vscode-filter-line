# Filter Line 3 upgrade

Baseline: annotated tag `legacy-v2.0.1-20260912`, commit `25e34c4`.
Existing release tags remain unchanged.

## Required scope

- Safe output: never delete or replace source/previous result implicitly; publish only completed output, clean up failures/cancellation, respect stream backpressure.
- Preserve UTF-8/UTF-16 BOM, line terminators and missing final newline; reject unsupported/invalid disk input rather than silently corrupting it.
- Source selection: current buffer including unsaved/Untitled content, selected whole lines, explicit target URI, direct large-file picker, correct target workspace config.
- Worker execution with progress and effective cancellation, including pathological regular expressions; bounded live preview with literal/regex, case and inverse toggles.
- Context lines without duplication, match counts, result-to-original navigation.
- Named reusable presets, include/exclude composition, JSON schema and field validation; retain legacy JSON/EOML rules and command IDs.
- Modern TypeScript/ESLint and VS Code test tooling; pure unit, filesystem, worker and real extension-host integration tests, representative large-file benchmark, installable VSIX.
- Documentation and changelog describe migration, limitations and tested behavior.

## Verification

Tests must exercise output collision/concurrency, read/write failure, cancellation,
line endings/encodings, every legacy rule type, preview truncation, selection,
unsaved buffers, multi-root config resolution, navigation, and lifecycle cleanup.
Run lint, compile, unit tests, extension-host tests and packaging; record actual
results and remaining limits in this file. Do not publish to Marketplace as part
of this upgrade.

## Completed verification — 2026-09-12

| Requirement | Implementation and evidence |
| --- | --- |
| Historical baseline | Annotated `legacy-v2.0.1-20260912` resolves to `25e34c45dd8db623e6d134213aec4998c86f549c`; existing `v2.0.1` stays at `c54d253` |
| Safe writes and bounded memory | `core/job.ts`, `core/files.ts`; exclusive concurrent publication, failure, cancellation-before-publication and source-change tests |
| Encoding and line boundaries | Exact byte comparisons for UTF-8/BOM/UTF-16 LE/BE, mixed CR/LF/CRLF, multibyte/chunk boundaries, missing final newline; invalid encoding/NUL/UTF-32 rejection |
| Sources and configuration | Real extension-host tests for Untitled, dirty right-click targets, whole-line selection offsets, two workspace roots and virtual editor buffers |
| Context and navigation | Overlap/gap mapping tests; real source jumps and rejection of stale source/result mappings |
| Legacy and new rules | All five JSON and five EOML examples, list/inverse/general state, combined any/all/include/exclude, invalid fields and schema tests |
| Preview and user controls | Native UI smoke test: matching count, inverse, context editing, case toggle, regex toggle, invalid regex blocked, history Esc cancellation; preview line order corrected and rechecked |
| Named presets | Native UI save and reuse, core combined-rule validation, schema validation of named presets |
| Cancellation and cleanup | Pathological regex cancelled in a worker; real host cancellation/failure cleanup, large results complete without opening/replacing files |
| Toolchain and package | Clean `npm ci`, TypeScript build, ESLint, VSIX inspection and final packaged-code extension-host run |

- `npm test`: **25 passed**, none skipped. Includes schema, worker and filesystem tests.
- `npm run lint`: passed. `git diff --check`: passed.
- Source extension-host suite: **10 passed** on VS Code **1.96.0** and **1.135.0**, macOS arm64.
- Final VSIX was extracted and loaded as the development extension in VS Code **1.96.0**: **10 passed**. This checks the actual delivered modules rather than assuming a source run proves packaging.
- The packaged-run cancellation test was updated to assert the cancellation message instead of comparing constructors from two different copies of the extension.
- Final VSIX: `filter-line-3.0.0.vsix`, 21 archive files, approximately 31 KiB, no runtime npm dependencies and no bundled tests/source/dependency tree.
- VSIX SHA-256: `365b4e07d3086483707f8e5f33c7069a8575265ba6728a9aeabe0de53b21ee63`.

## Reproducible performance checks

Measured on this macOS arm64 machine, Node **v23.11.0**; these are single-run stress
checks, not a universal speed claim or a comparison against the legacy release.
The benchmark hashes both files and checks match count and mapping-file size.

| Input | Lines (all match) | Elapsed | Peak process RSS | Verification |
| --- | ---: | ---: | ---: | --- |
| 128.953 MiB | 1,032,192 | 1.406 s | 89.7 MiB | Identical input/output SHA-256 |
| 512.742 MiB (final core) | 4,104,192 | 5.650 s | 90.1 MiB | Identical input/output SHA-256 |

Final 512 MiB output SHA-256:
`e47796e6978468d091c9b8f08c0e38aec63bdd5ac2ddaf96a32027168179ba70`.

The npm registry was unreachable from this environment at first; installation used
the public npm mirror with lockfile integrity verification. Checked-in resolved
URLs use the standard npm registry. Clean installation succeeded. Node 23 produces
a development-tool engine warning; use the documented Node 22.13+ LTS or Node 24+
for normal development and CI. The extension itself was exercised in both VS Code hosts.

## Limits and release state

- Local execution was verified on macOS arm64. Linux/Windows and both VS Code versions
  are defined in CI, but those remote CI jobs have **not** been run here.
- Native remote SSH/WSL sessions were not available; virtual editor buffers were tested.
- The primary selection is supported; secondary selections are not combined.
- Disk export preserves supported encodings and terminators. Untitled results follow
  VS Code's text model and save settings. Direct disk mode requires a BOM for UTF-16.
- Large-file publication requires hard-link support. Context/line/worker memory limits
  are explicit, and preview counts are labelled when sampled.
- The historical tag and upgrade are local. No Marketplace release or remote push was performed.
