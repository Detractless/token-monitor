# Independent final retention delta review

Verdict: **bounded GO** for the seven-file retention delta frozen by `/tmp/tm-retention-snapshot.json`. No reproduced production blocker. This does not certify screenshot capture, physical/native surface acceptance, packaging, other platforms, or publication.

## Scope and integrity

Only `/Users/javis/.t3/worktrees/Token Monitor/feat-plugin-ecosystem`, HEAD `cdd70d692fa6ca8c7b7a419425530257ed9b6f95`. Compared the prior author snapshot: exactly seven changed files (shared and Electron webUi.js, pluginWebUi.test.js, cache harness, and three author documents). The prior bounded review supplies lifecycle context; this review does not reopen that implementation. All 69 hashes and HEAD matched initially; all 69 hashes and the same HEAD also matched after execution. The final integrity record is `/tmp/tm-retention-independent-after.json`.

## Assessment

- Normalization accepts omitted retention, nonnegative safe integers including MAX_SAFE_INTEGER, or exactly `until-evicted`; negative/fractional/unsafe/string-number/null/nonfinite inputs are rejected. Omission still selects 30000 ms; zero still destroys immediately. No five-minute policy cap remains.
- Finite retention uses a monotonic deadline with each timeout at most 2147483647 ms. It recomputes remaining time at each callback, avoiding Node overflow and early rounded expiry. Resume and destruction cancel the current timer; the callback also checks dead/parked state. Subsequent hide starts a fresh deadline. Serialized lifecycle completion still guards dead items and stale epochs, so expiry during freeze cannot resurrect a document.
- Indefinite retention installs no expiry timeout. It retains the same freeze, immediate demand removal, bridge denial, count-three/256 MiB sampled-memory bounds and mandatory authority/owner/revision invalidation paths. It adds no hidden sampling.
- All three documents describe the new accepted values, default, author preference versus resource eviction, frozen execution and storage boundary consistently. Minor nonblocking wording: README line 181 still says “up to 30 seconds” without “by default”; the explicit retention section at line 189 correctly explains overrides. This is a clarity nit, not an implementation blocker.

## Evidence

- Independent `node --test tests/electron/pluginWebUi.test.js`: 6 passed, 0 failed/skipped.
- Independent extracted production scheduling-block probes: long-duration rollover and last millisecond expiry, omitted 30-second default, indefinite no timer, maximum-safe duration, and callbacks after resume/death all passed. `/tmp/tm-retention-independent-timers.log`. These use a controlled monotonic clock; no claim of waiting 24 days.
- The unmodified Electron harness reproduced `UnknownVizError` at `capturePage()` after 10 successful assertions, matching the supplied final log. Initial sandbox launch additionally exited SIGABRT; the authorized unsandboxed disposable-profile run reached the screenshot failure. Neither is evidence of a retention logic failure, but the original harness did not complete successfully.
- To reach the remaining assertions, `/tmp/tm-retention-independent-cache-runner.cjs` compiles the original harness at its original module path and skips only the single screenshot capture statement. No assertions or production files are changed. Results are in `/tmp/tm-retention-independent-cache-no-capture.log`; screenshot verification is explicitly excluded. This run passed 32/32 reached assertions, including every new retention assertion, real finite expiry, indefinite eviction/revocation, count eviction and real 30-second expiry. It then exited 1 on the next `open(h)` before the existing owner-close assertion (line 141); owner-close/uninstall were not reached in this run. This later cold-open timeout is not diagnosed as a retention defect and the whole harness is NOT claimed green. The bounded GO applies to the independently exercised retention delta, with this integration limitation retained.
- Supplied parent full verification log `/tmp/tm-retention-verify.log` reaches its terminal summary: 7756 tests, 7748 passed, 8 skipped, 0 failed/cancelled. Lint proceeded into tests. This is inspected parent evidence; this reviewer did not rerun full verify.

## Boundaries

No source/Git writes or publication; no primary app/profile, debug ports 9333/9334, or CodeGraph initialization. Only disposable harness profiles and `/tmp` evidence files were written. The Electron fixture uses production controller/bridge and synthetic host geometry/data; injected memory pressure tests eviction, not an instantaneous OS quota. Physical Notch, native compositor/IME/trackpad, Windows/Linux and packaged delivery remain untested. Parent owns any push.
