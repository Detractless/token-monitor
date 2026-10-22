# Independent author UI review

**Verdict: bounded GO for the frozen local author-retention and declarative smooth-chart delta. No actionable defect reproduced.** This is not approval of the entire plugin feature, remote PR, public delivery, or native hardware acceptance.

## Candidate and integrity

- Only candidate: `/Users/javis/.t3/worktrees/Token Monitor/feat-plugin-ecosystem`, HEAD `cdd70d692fa6ca8c7b7a419425530257ed9b6f95` plus existing dirty overlay.
- Manifest: `/tmp/tm-author-snapshot.json`, SHA-256 `57b1108f9a34a6da11161890d8ff6141cf5d89dbf9b2d9269819ff16363e4960`.
- All 69 source hashes matched before and after inspection/test execution; HEAD matched both times. Records: `/tmp/tm-author-independent-before.json`, `/tmp/tm-author-independent-after.json`.
- Compared the previous reuse manifest to identify this round's changed files; read `/tmp/tm-reuse-independent-review.md` as prior context, not as this round's independent execution. All five frozen System Monitor Rich UI HTML/CSS/JS assets match the prior reuse freeze. Current surface documents remain author-selectable; smooth is enabled in its declarative layouts.

## Findings and reasoning

1. **Measured data, not invented samples.** `dataBus.js:196` returns copied timestamp/value pairs, retains null gaps, and does not create demand. Binding resolution adds timestamp history only for an opted-in history sparkline, resolves plugin namespaces and fields through the existing path, and charges expanded points to the render budget. Manager supplies the existing bus history and effective source interval. Literal series and non-smooth charts retain their static path. The count-zero fix was independently probed, along with tail selection, defensive point copies, and zero demand.
2. **Continuity and timing.** `pluginViews.js:171` builds measured SVG segments; the shared host moves their transform against a monotonic/wall-reanchored clock. Four successive real approximately two-second updates independently preserved the previous measured point's x position within 0.02 viewBox units, and each continued moving between pushes. The test is synthetic timestamp input through the production renderer, not an OS-compositor measurement. Forward/rollback clock changes, stale history, explicit null values and long gaps passed the production checks. The one-interval-plus-250ms buffer is accurately documented; it is not a guarantee against arbitrarily delayed sample arrivals. Autoscaled y bounds can legitimately change when values change; the fixed 0–100 comparison isolates scrolling continuity.
3. **Lifecycle and motion.** The host uses one scheduled chart callback, applies the existing visible/active checks, honors App reduced motion and ancestor/own `motion: none`, and caps movement at 16 charts per mounted view. Extra probes verified the seventeenth chart remains static and that inactive and stopped-source states generate no recurring rAF callbacks after settling. The standard harness checks removal releases demand. Source reads and source timers are not added to the animation loop. Background Worker behavior is not silently changed.
4. **Author retention reaches the host.** Shared normalization accepts only optional integer `retainMs` in 0–300000, preserving omission/default compatibility. The normalized document passes through manager to the native child. `webUi.js:93` destroys immediately at zero; otherwise hide releases demand and visible ownership, parks/freezes, and starts that document's bounded expiry. Existing count-three, sampled-memory, revocation and owner-close paths retain precedence. Real cache tests exercise zero, 1200ms expiry, 120000ms propagation followed by disable, and the 30-second default. The 120000ms check proves propagation and revocation, not a two-minute wall-clock expiry test. Prior fail-closed freeze/thaw semantics are unchanged by this delta.
5. **Docs and presentation.** Quickstart begins with a complete existing example, then explains per-surface renderer choice, packaged examples, retention, lifecycle and distribution. README documents the smooth timing/gap/cap contract and distinguishes retained DOM from durable storage. Magpie and DSH are labeled design/documentation references rather than equivalent API/security contracts. All local Markdown file targets in the three reviewed docs exist. External reference availability and assertions about those external products were not independently audited. The supplied comparison screenshot was inspected: matching styling and readable static/continuous plots; a still image cannot prove motion. The UI detector returned no findings for `pluginViews.js`; this is not a whole-app accessibility certification.

## Independent checks

- `node --test tests/shared/pluginViewSpec.test.js tests/shared/pluginDataBus.test.js tests/electron/pluginWebUi.test.js`: **34 passed**, no skips/failures. `/tmp/tm-author-independent-node.log`.
- `node --test tests/electron/pluginManager.test.js`: **29 passed**, no skips/failures. `/tmp/tm-author-independent-manager.log`.
- `env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-smooth-charts.cjs`: **13 passed**. `/tmp/tm-author-independent-smooth.log`.
- Temporary extra Chromium harness: **25 passed**, comprising the 13 standard checks plus 12 independent checks for repeated transitions, ancestor motion, animation cap and callback termination. `/tmp/tm-author-independent-extra.cjs`, `/tmp/tm-author-independent-extra.log`. This compiles a temporary extended test against production source; it does not replace source files.
- Production cache harness: **29 passed**, including real default expiry, author retention and revocation. Cold open 1022.67ms / same-document reopen 16.26ms in this single local run; not a statistical benchmark. `/tmp/tm-author-independent-cache.log`.
- Four direct DataBus assertions passed: zero count, last-point selection, point-copy isolation, no demand.
- Parent's `/tmp/tm-author-verify-final.log`: **7748 passed, 8 skipped, 0 failed**; read, not rerun. Parent's `/tmp/tm-smooth-before.log` fails the expected continuous-motion assertion; inspected, not independently rerun against baseline.

## Limits and suggestions

No reproduced defects or required changes. Optional test maintenance: retain the multi-transition and no-recurring-rAF probes in the permanent harness; the current 13-check harness tests only one new-sample transition.

First sandboxed Electron chart launch aborted with SIGABRT before assertions; the isolated authorized rerun passed. All Electron runs used disposable profiles, synthetic fixtures and no remote-debugging ports. Runs were sequential. No source/Git changes, primary App/profile access, ports 9333/9334, CodeGraph initialization, push, commit, external messages, or spawned agents. Reviewer artifacts are in `/tmp` and harness-created temporary directories.

Physical Notch/camera clearance, OS compositor/shell timing, native IME/trackpad, Windows/Linux, packaging/signing, marketplace and public release remain outside this review. No full-app design-health score is inferred from the scoped chart audit.
