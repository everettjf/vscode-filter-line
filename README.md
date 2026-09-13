# Filter Line

Filter logs and text by literal strings, regular expressions, or reusable rules.
Preview matches as you type, keep surrounding context, and jump from a result
back to its original line. All processing stays on your extension host.

Requires VS Code 1.96 or newer. No runtime npm dependencies.

## What's new in 3.0

- **Live preview:** see sample matches while typing, with text/regex, case and inverse controls.
- **Context lines:** retain surrounding lines and merge overlapping ranges without duplicates.
- **Filter what you see:** work with unsaved documents, Untitled editors or selected lines.
- **Large-file processing:** choose a file directly, stream results to disk and cancel running filters.
- **Reusable rules:** save personal presets or share named include/exclude rules with your workspace.
- **Source navigation:** jump from a filtered result back to the original line.
- **Safe output:** create a new result without overwriting the source or earlier results.

## Installation

The published extension is available on the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=everettjf.filter-line).
The 3.0 changes documented here are available in this repository; the local build
has not yet been published to Marketplace.

To try this version, run `npm ci` and `npm run package`, then choose
**Extensions: Install from VSIX…** in VS Code and select `filter-line-3.0.0.vsix`.
See [development and verification](#development-and-verification) for prerequisites.

## Quick start

1. Open a document, or paste text into an Untitled editor. Unsaved changes are supported.
2. Optionally select the lines to filter. The primary selection is expanded to whole lines;
   an end position at column zero excludes that ending line.
3. Run **Filter Line By Input String** or **Filter Line By Input Regex**.
4. Type a pattern. The picker shows matching counts and up to 30 preview lines.
   Use the toolbar buttons to switch text/regex, case sensitivity, inverse matching,
   and context lines before/after matches.
5. Press Enter to filter. Esc closes the picker without starting another prompt.

Small results open in a new Untitled document with the source language. Save it
using VS Code's normal Save / Save As commands. Results larger than 8 MiB are saved
to a new file; an **Open Result** action lets you choose whether to load them.
The completion status reports matched, scanned, and output line counts.

Preview scans at most 256 KiB of disk input or 256 Ki JavaScript characters from an
editor buffer, and at most 5,000 lines. Counts explicitly say
**sample only** when truncated. Preview lines are shortened to 300 characters;
full filtering retains complete lines. Changing the pattern cancels the previous
preview. Long-running regexes execute in a worker and can be cancelled.

## Files, context and navigation

- **Filter Line: Choose File** selects a file without opening it first. This replaces
  the old empty `filterline` placeholder workaround.
- Explorer and editor context menus filter the selected target. An already-open
  target uses its current buffer, including unsaved edits.
- Context windows merge without duplicating lines. Match counts exclude context-only lines.
- **Filter Line: Go to Source Line** jumps from the result cursor to its original line.
  Navigation is available while the result remains open in this session. Editing
  the result or changing/closing the source buffer invalidates its mapping; filter
  again to refresh it.
- **Filter Line: Clear History** clears the locally stored pattern history.
  Reused patterns move to the front. Legacy history is imported automatically.

Disk output never replaces the source or a previous result. For `app.log`, saved
results are named `app.log.filterline.log`, then `app.log.filterline.1.log`, etc.
Filtering an existing result creates another new result. Output is fully written
before publication. Publication uses a temporary sibling and an exclusive hard link,
so the destination filesystem must support hard links. Cancelled or failed runs
remove their temporary output.

## Performance

Disk filtering streams input and output instead of loading the entire file into
memory. Matching runs in a cancellable worker, and previews use a bounded sample.
Line splitting and context handling avoid repeated scans of growing buffers or
already-emitted lines.

Measured locally on macOS arm64 with Node.js v23.11.0, before and after the latest
performance improvements to the 3.0 implementation:

| Workload | Before | After |
| --- | ---: | ---: |
| 256 MiB file, all lines match | 2.658 s | 1.819 s |
| 64 MiB file, dense matches with 1,000 preceding context lines | 5.531 s | 0.494 s |
| 16 MiB input containing 8 MiB individual lines | 3.453 s | 0.074 s |

These are single-run measurements, not timing guarantees. Normal streaming cases
used about 86 MiB process RSS, including the worker. The 256 MiB all-match case
used approximately the same memory as the 64 MiB case.

`npm run test:performance` checks 11 workloads for output correctness, memory,
throughput, preview latency and scaling regressions. The CI workflow includes this
suite with enforced budgets. See [performance results and guardrails](docs/PERFORMANCE.md)
for reproducible commands, raw reports, thresholds and measurement limitations.

## Presets and workspace configuration

After a successful text/regex filter, run **Filter Line: Save Last Filter as Preset**.
Give it a unique name, then use **Filter Line: Use Saved Preset** in any workspace.
These presets, including case, inverse and context settings, are stored locally.

For shared project rules, create `.vscode/filterline.json` in the target file's
workspace and run **Filter Line By Config File**. JSON completion and validation are
provided automatically. Multiple workspace folders use their own configurations.

```json
{
  "presets": [
    {
      "name": "Errors without health checks",
      "type": "combined",
      "caseSensitive": false,
      "include": ["error", "exception"],
      "exclude": ["healthcheck"],
      "match": "any",
      "before": 2,
      "after": 3
    },
    {
      "name": "API timeouts",
      "type": "combined",
      "regex": true,
      "include": ["request=\\d+", "timeout"],
      "match": "all"
    }
  ]
}
```

`combined` uses literal strings by default; `regex: true` enables regular expressions.
Empty `include` matches all lines; any matching `exclude` removes a line. `match`
controls whether any or all include rules are required. Matching is case-sensitive
unless `caseSensitive` is false. `before` and `after` accept integers from 0 to 1000.

Existing configuration types remain supported:

| Type | Behavior |
| --- | --- |
| `stringlist` | Keep lines containing any string in `rules` |
| `regexlist` | Keep lines matching any regex in `rules` |
| `stringlist_notcontainany` | Exclude lines containing any string |
| `regexlist_notmatchany` | Exclude lines matching any regex |
| `general` | Legacy prefix/capture formatting, `dest`, `tag`, persistent `flag`, inclusive `until` blocks |

When `type` is omitted, it defaults to **regexlist**, matching the legacy code's
actual behavior. The older README incorrectly described it as `general`.
See [legacy examples](demo) for all five formats. `.vscode/filterline.eoml` and
`.vscode/filterline.txt` remain supported with their original precedence over JSON:
EOML, then TXT, then JSON. The legacy EOML subset now reports malformed structure
with line numbers. Configuration files are limited to 1 MiB.

## Encoding, limits and remote workspaces

Direct disk processing supports UTF-8 (with or without BOM), and UTF-16 LE/BE with
BOM. Saved disk results preserve encoding, BOM, individual LF/CRLF/CR terminators
and a missing final newline. Invalid or unsupported encoding fails explicitly;
open the file using VS Code's **Reopen with Encoding**, then filter the editor buffer.
Untitled result documents use VS Code's normal text model and save settings, so
saving these documents follows your editor's encoding and line-ending choices.

Large files stream through bounded read/write batches. A single line is limited to
16 × 1024 × 1024 JavaScript characters, buffered context to 32 MiB, and a worker's old-generation
heap to 256 MiB. Excessive input fails with an error rather than blocking the extension host.
A file modified during disk filtering is rejected; retry after it stops changing.

Remote extension hosts can process files on their own filesystem. Virtual document
buffers and target-workspace configuration use VS Code APIs; direct virtual-file
loading is limited to 16 MiB. Streaming and publishing large results require the
extension host's native filesystem. This is a desktop/workspace extension, not a
browser extension for vscode.dev.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `filter-line.historySize` | `10` | Recent patterns, from 1 to 50 |
| `filter-line.caseSensitive` | `true` | Initial matching mode |
| `filter-line.contextBefore` | `0` | Lines before a match |
| `filter-line.contextAfter` | `0` | Lines after a match |
| `filter-line.maxOpenResultMiB` | `8` | Save larger results without automatically opening them |

## Upgrading from 2.x

All six legacy command IDs remain available. Version 3 intentionally removes implicit
file replacement and the requirement to save before filtering. Use **Choose File**
instead of creating a `filterline` placeholder. Existing rules and history remain
usable. The pre-upgrade repository snapshot is tagged `legacy-v2.0.1-20260912`;
existing release tags are unchanged.

## Development and verification

Use Node.js 22.13+ (22 LTS) or Node.js 24+.

```sh
npm ci
npm run lint
npm test
npm run test:integration
npm run benchmark
npm run test:performance
npm run package
```

Integration tests run an isolated VS Code with two workspace fixtures. Set
`VSCODE_EXECUTABLE_PATH` to use an existing executable, or `VSCODE_TEST_VERSION` to
select a downloaded release. Linux requires a display, e.g. `xvfb-run -a npm run test:integration`.
CI defines runs on Linux, macOS and Windows. `BENCHMARK_MIB=512 npm run benchmark`
changes the reproducible all-match stress case size. See [upgrade verification](docs/UPGRADE.md)
for actual local results and limitations. [Performance guardrails](docs/PERFORMANCE.md)
define the enforced streaming, preview, memory and scaling budgets.

Install a locally built `.vsix` with **Extensions: Install from VSIX…**.
Packaging does not publish to Marketplace.

[Marketplace](https://marketplace.visualstudio.com/items?itemName=everettjf.filter-line)
· [Issues](https://github.com/everettjf/vscode-filter-line/issues)
· [Community](https://discord.gg/eGzEaP6TzR)
· [Original Chinese introduction](https://everettjf.github.io/2018/07/03/vscode-extension-filter-line/)
