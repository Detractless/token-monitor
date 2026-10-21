# PR #1164 — independent frozen-delta review

**Verdict: bounded GO for the requested corrections.** No confirmed blocking production-source defect in the reviewed delta. One P3 validation-artifact issue is reproduced below. This is not full PR, marketplace, native Notch, platform, or release acceptance.

## Frozen scope and integrity

- Worktree: `/Users/javis/.t3/worktrees/Token Monitor/feat-plugin-ecosystem`.
- HEAD before and after: `230e819859059fb2f120cdaaf9393907e5e66ea0`.
- `/tmp/plugin-corrections-snapshot.json`: all 25 SHA256 entries matched before review and at completion; no source edits. Final verification recorded in `/tmp/plugin-corrections-review-snapshot-final.json`.
- Reviewed the uncommitted source/tests/docs in that snapshot, plus relevant unchanged callers, supervisor, sandbox, Data Bus and settings integration. Parent-prepared `validation.md` and other evidence outside the snapshot are not frozen review subjects.
- No primary app, primary checkout writes, ports 9333/9334, CodeGraph initialization, push, GitHub edits or publication. PR was registered with this T3 thread only. CodeGraph reported this worktree unindexed; source review used Git and direct file reads.

## Confirmed finding

**P3 — settings screenshot can capture the preceding comparison frame and lacks the production settings wrapper.**

Location: `scripts/test-plugin-corrections-ui.cjs:95-96`, plus the fixture's bare `#settings` container.

Reproduction: run `env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-corrections-ui.cjs`. My run passed 23/23, but `/var/folders/fy/4wmcgtwj02966_f8fxrqfvwc0000gn/T/tm-plugin-corrections-ycqDR2/page-settings.png` still shows the ring/Notch comparison instead of the settings page. The DOM is changed immediately before `capturePage()` without allowing a paint. A scratch-only copy with a 200 ms paint allowance captured the intended settings content. That content also renders as inline browser checkboxes because the fixture omits `.settings-panel`, which scopes the real checkbox styles in `src/electron/renderer/styles.css:598` onward.

Impact: the generated screenshot is not reliable visual proof of the original settings surface. The DOM interaction assertions remain useful and passed; this does not establish a production settings layout defect. Before presenting this PNG as settings UI acceptance, capture after a confirmed paint and use the real settings wrapper. No source was changed during review.

## Adequacy by requested boundary

1. **Runtime burst recovery and flood containment: adequate within the existing sampled-resource design.** Both host and main treat exhausted `ready`, `tick-done`, `interaction-done` and `call` budgets as failure rather than dropping indispensable protocol messages. Host teardown suppresses queued messages from the retired Worker; sandbox ownership fences retired renderer callbacks. Restart resets the message budget without resetting the supervisor failure history or broker quotas. Independent tests drove each of the four control types through the 1 s / 5 s / 30 s backoff ladder and confirmed circuit opening on the fourth failure, with no further restart. Ordinary data flooding still terminates at 400 dropped messages. The tick deadline has generation and sequence guards, valid completion clears it, and stale completion cannot clear a live tick. I additionally invoked retired deadline callbacks after both sequence and generation changes: neither killed the replacement. Healthy completed ticks continued beyond their original deadlines. The supplied before log records five failures; the after log records 32 passes, and the corresponding current tests passed independently. Calls are not replayed; an over-budget legitimate plugin can restart, as documented. This fixes the stuck scheduler without promising instantaneous memory caps or full malicious-process isolation proof.

2. **Explicit numeric ring captions: adequate.** Numeric metadata comes from the caption's own binding and format descriptor; no formatted/literal label parsing was added. Existing Roll/Count rendering uses that metadata. Tests cover actual System Monitor CPU/RAM bindings, unavailable values, literal captions, intermediate Count values, exact final values, reduced motion and author `motion: none`. The change introduces no new motion API.

3. **Notch selection and navigation: adequate for the frozen correction scope.** Built-in choices are normalized on read/write and ride the existing panel payload; authored choices use the existing placement contract. The renderer consumes active plugin metadata, while persisted selections survive temporary disablement. The shared helper serializes writes, takes updated render context while saving, restores failed choices and preserves focus without stealing it after the user moves elsewhere. The 1024 bound is storage capacity, independently tested at 1024/1025 and for removal/reselection at capacity. Hidden/removed pages cannot remain selected, and removed plugin mounts release demand. The Chromium fixture passed all nine 480/640/760 width × 0.75/1/1.5 zoom combinations with nine plugin pages and a synthetic 180 px camera gap; End-key focus reaches the last tab. This is component/geometry proof, not native camera, hover or non-activating-window acceptance.

4. **Background and shared sampling: adequate.** Normalization, state creation, description and managed installation consistently default background to false; only persisted literal `true` opts in. Existing true choices remain active. Tests confirm zero samples and no Worker at zero demand, one sampler shared by two plugins, remaining-consumer continuity, and cessation after hide/disable/removal or background opt-out. The existing 30-second Worker retention window is distinct from sampler demand; native Worker timers can still run during retention under the existing supervisor, as the docs explicitly state. Data Bus tests also cover late results and in-flight demand changes.

5. **Architecture proposal: appropriately bounded.** `author-ui-options.md` clearly proposes a follow-up, preserves existing declarative views, and compares optional full web pages with compact declarative surfaces. It identifies the missing proof for renderer separation and termination rather than treating a sandboxed iframe as CPU/memory isolation. It covers denied Node/secrets/files, bounded per-document bridge authority, request identity/deadlines, revocation, visibility demand, resource disposal and explicit background ownership. Official plus user-added catalogs are sufficient v1 scope; staff operations are not mandatory merge gates. Future source descriptors, granular capabilities, availability states and extra system adapters are expressly unimplemented. No rewrite or implementation of the proposal is required by this review. External comparison links were not independently audited.

## Validation performed

- **114/114 focused Node tests:** `pluginManager`, `pluginSandbox`, `pluginPlacement`, `notchPanel`, `notchExperimental`, and shared `pluginViewSpec`. Log: `/tmp/plugin-corrections-review-node.log`.
- **37/37 supporting boundary tests:** shared `pluginDataBus`, Electron `pluginRuntime`, `pluginManaged`, `pluginViews`, `pluginRailNumbers`, `pluginPages`. Log: `/tmp/plugin-corrections-review-boundaries.log`.
- **9/9 independent scratch probes:** repeated control failures/circuit, flood threshold, stale timer callbacks, completion longevity, strict persisted opt-in and storage limit. Script/log: `/tmp/plugin-corrections-review-extra.cjs`, `/tmp/plugin-corrections-review-extra.log`.
- **Requested isolated Electron fixture: 23/23.** Log: `/tmp/plugin-corrections-review-ui.log`. Initial sandboxed launch aborted with SIGABRT before tests; the same authorized isolated command succeeded outside that restriction. Separate temporary profile, no debugging port.
- **Scratch extended Electron fixture: 27/27 total**, including four additional delayed-save/focus/unavailable-retained-selection assertions. Script/log: `/tmp/plugin-corrections-review-extra-ui.cjs`, `/tmp/plugin-corrections-review-extra-ui.log`. The scratch relocation initially had a relative manifest import error; corrected only in `/tmp` before the successful run.
- `git diff --check`: passed.
- Impeccable static audit: five warnings, all on unchanged existing spring/layout-animation CSS, not newly introduced findings. Output: `/tmp/plugin-corrections-review-ui-audit.json`.
- Parent full verification log inspected, **not rerun**: `/tmp/plugin-corrections-verify-final.log` shows lint proceeded to tests and final totals of 7712 pass, 8 skip, 0 fail (7720 total). The fixture stub correction preserves its original assertions.

## Limits and handoff

Independent Node evidence totals 160 passing tests; the extended UI run includes the original 23, so do not count 23 + 27 as 50 independent checks. This review did not run the parent's native `verify:plugins` job or certify its outcome. Native hardware geometry, focus/IME/gestures, macOS compositing, long-duration resource behavior, Windows/Linux and all 1024 tabs rendered simultaneously remain outside this review. The small screenshot fixture issue should be corrected before claiming settings visual proof, but does not block the bounded production correction GO.
