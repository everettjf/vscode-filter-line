# Performance contract

Performance is a release requirement alongside output correctness. Run
`npm run test:performance` to exercise isolated worker processes on reproducible
fixtures. The CI performance job runs this command and retains its JSON report.
A failed budget fails the job; it does not silently update a baseline.

## Guardrails

- Disk input streams in fixed-size batches; output awaits writes and never accumulates the full result.
- Each input chunk is scanned once. Spanning lines are joined once, rather than rescanned/copied on every read.
- Before-context uses a bounded ring of **unemitted** lines. Already-emitted context is neither stored nor rescanned.
- Preview transfers at most 256 Ki characters plus one truncation marker character to a worker, even for large editor buffers.
- Matching runs off the extension-host thread. Pathological regex cancellation remains covered by the core tests.
- Existing explicit line/context/worker limits still apply. Arbitrary regex complexity has no guaranteed throughput.

## Automated budgets

The checked-in `scripts/performance-budgets.json` uses deliberately broad CI ceilings
plus within-run scaling ratios, so it catches substantial regressions without
pretending that shared runners have identical hardware.

| Check | Failure threshold |
| --- | --- |
| Process RSS, including worker | Above 256 MiB on the standard fixtures |
| Full-file throughput | Below 8 MiB/s |
| Extension-host-equivalent main event-loop delay | Above 500 ms |
| Sample preview worker startup + processing | Above 1000 ms (excludes UI debounce/rendering) |
| 4x file size: RSS growth | Above 64 MiB |
| 4x file size: throughput | Below 40% of the smaller-file throughput |
| Dense 1000-line context | Above 3x the same all-match run without context |
| Equal bytes with 8 MiB vs 1 MiB individual lines | Above 3x processing time |

Cases cover all/zero/sparse matches, regex, sparse/dense context, 64/256 MiB file
scaling, large-file and 64 MiB buffer preview, and fragmented long lines. Full-file
cases verify the output **and every source mapping** by independent SHA-256
expectations, as well as scanned/matched/emitted counts. Long-line cases verify
exact output hashes. Preview cases verify sample limits.

Each case runs in a fresh child process to keep RSS measurements independent of
prior fixtures and garbage collection. RSS includes the source buffer in the
buffer-preview case. The event-loop measurement is a proxy for host responsiveness,
not a rendered-editor frame-rate measurement. Per-case hard timeouts prevent hangs.

## Local before/after, 2026-09-12

Same macOS arm64 / Node v23.11.0 host, same generated samples. Single-run numbers
are diagnostic evidence, not universal timing guarantees. Exact reports:
[before](performance-before.json), [after](performance-after.json).

| Case | Before | After |
| --- | ---: | ---: |
| 64 MiB all matches | 0.713 s | 0.498 s |
| 256 MiB all matches | 2.658 s | 1.819 s |
| 64 MiB zero matches | 0.471 s | 0.275 s |
| 64 MiB dense context, before=1000 | 5.531 s | 0.494 s |
| 16 MiB input with 8 MiB individual lines | 3.453 s | 0.074 s |

The pre-change run tripped both the dense-context and long-line scaling gates.
The final run passed all gates, with about 86 MiB RSS for normal streaming cases,
132 MiB for the 8 MiB-line case, and 177 MiB for preview with a resident 64 MiB
source buffer. Sample preview processing took about 16–19 ms before UI debounce.

Run `node scripts/performance.cjs --record-only` only for diagnostic baselines;
it records budget violations without failing. CI always uses the enforcing command.
The report is written to `.performance/results.json`. CI is configured locally;
remote CI results are not claimed until that workflow actually runs.
