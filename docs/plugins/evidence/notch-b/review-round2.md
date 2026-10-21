# Notch B — independent correction round2 review

**Verdict: bounded GO for the three named corrections in the frozen 13-file snapshot.** No remaining defect reproduced in the requested correction scope. The former three P2s reproduce against the exact round1 panel/CSS and pass against round2. This is not a green full-suite or native-hardware acceptance verdict: the parent round2 full verify log currently records one watcher failure, described below.

## Frozen scope and integrity

- Worktree: `/Users/javis/.t3/worktrees/Token Monitor/feat-plugin-ecosystem`.
- HEAD before/after: `be3a88f3fa6b3315aae1ee6e81f3bbe238e7046d`.
- **13/13 SHA256 matches before and after** against `/tmp/notch-b-r2-snapshot.json`. Records: `/tmp/notch-b-r2-independent-snapshot-before.json` and `/tmp/notch-b-r2-independent-snapshot-after.json`.
- Compared all 13 entries with `/tmp/notch-b-snapshot.json`: exactly `panel.js`, `notch.css`, and `scripts/test-plugin-corrections-ui.cjs` changed; the other **10/10 are identical**.
- Reconstructed round1 panel/CSS only under `/tmp` by reversing the supplied correction script. Both reconstructed hashes match the original round1 snapshot exactly. No worktree file was replaced for the before run.
- Read-only review: no source edits, Git mutation, push/public action, primary app launch/control, port 9333/9334 access, CodeGraph initialization, or nested agents. This worktree has no CodeGraph index; direct reads were used. Scratch scripts, logs, profiles and screenshots are outside the frozen source.

## Independently reproduced corrections

### 1. Production compact rounding no longer changes status width/tab capacity

Source: `src/electron/renderer/notch/panel.js:436`, `:469`; `src/electron/renderer/notch/notch.css:135`.

The hidden inline-grid measures multiple real formatter boundaries, with its children sharing one grid cell. Its width is the widest formatted probe rather than the sum. The checked-in harness now uses `TokenMonitorCompactTokens.formatCompactTokens(..., 'western', 'en', {style:'tray'})` plus the same sub-one-rate handling as the production dock formatter.

Independent unchanged former reproduction, four built-ins plus nine plugin pages, gap 180px, zoom 1, rate 28 → 99999 (`100.0K`):

- **Round1, 630px:** status 90 → 96.859375px; visible tabs change from `home|limits|sessions|breakdown|plugin:demo/page5` to `plugin:demo/page4|plugin:demo/page5|plugin:demo/page6`.
- **Round1, 700px:** status 90 → 96.859375px; visible count drops from 7 to 6.
- **Round2:** status is **97 → 97px** at both widths and each run's visible page sequence is unchanged. The smaller initial capacity is reserved before the first large reading, so a live sample no longer evicts tabs or switches pager lanes.

Both independent status-width and capacity assertions fail before and pass after. The checked-in 630/700px regressions independently pass too.

### 2. Speed → burn retains the existing focused rate button

Source: `src/electron/renderer/notch/panel.js:426`, `:458`.

Rate mode is omitted from the structural key. The unit text changes in place, and unit changes trigger reservation recalculation without replacing the button.

Independent reproduction: render speed, focus `.notch-rate`, render burn with the same other fields. **Round1:** old button disconnected, active element BODY, unit TPM. **Round2:** original button remains connected and focused (BUTTON), unit TPM. The frozen HEAD comparison also retains focus. Checked-in regression additionally asserts original-button identity.

### 3. Fallback keyboard entry navigates from the focused visible tab

Source: `src/electron/renderer/notch/panel.js:248`.

Relative arrow navigation obtains the page from `event.target.closest('.notch-tab')`, validating it against page order and retaining the previous view-page fallback for other event origins.

Independent reproduction at 640px: select `plugin:demo/page4`, page forward until that selection is hidden, focus the visible roving Home entry, dispatch ArrowRight. **Round1:** jumps to `plugin:demo/page5`. **Round2:** selects and focuses **Limits**. The independent probe explicitly confirms the old selection was hidden and the entry was Home. Existing End navigation, pager stepping without selection, visible keyboard entry and same-payload focus checks also pass.

## Meaningful validation

- **Focused Node: 86/86 pass, zero skipped/failures**, independently rerun using `node --test tests/electron/notchPanel.test.js tests/electron/notchPageSettings.test.js tests/electron/i18n.test.js`. Log: `/tmp/notch-b-r2-independent-node.log`.
- **Checked-in Electron fixture: 45/45 pass**, independently rerun. Log: `/tmp/notch-b-r2-independent-ui.log`; artifact directory `/var/folders/fy/4wmcgtwj02966_f8fxrqfvwc0000gn/T/tm-plugin-corrections-J5ahSh`.
- **Unchanged former independent probes: round1 57/61 → round2 61/61.** Exactly four failing assertions before correction represent the three original P2s (width and capacity are two assertions for one issue). Logs: `/tmp/notch-b-r2-independent-former-before-ui.log` and `/tmp/notch-b-r2-independent-former-ui.log`. Scripts of the same names with `.cjs`; raw successful results also copied to `/tmp/notch-b-r2-independent-former-results.json`. These suites overlap and their totals must not be added.
- The independent 61 checks include nine **refresh-enabled** combinations (480/640/760px × .75/1/1.5 zoom), using production refresh CSS and equivalent 24px refresh-button DOM. Whole slots stay within their rails, trailing track clears status, and status clears the camera. These check layout, not the real limits-refresh callback/transport.
- Demand remains limited to the selected visible page; removing it releases demand and selects a remaining configured page. Detached mode retains the continuous leading rail before status.
- Async settings checks pass: unavailable saved choice remains removable and becomes disabled after removal; pending save disables all chips, consumes the latest catalog/context at completion, persists the choice, and does not steal focus from an external button. Existing save-failure restoration and same-chip focus checks also pass.
- Electron fixture startup initially inherited `ELECTRON_RUN_AS_NODE`; unsetting it exposed sandbox SIGABRT. The authorized isolated fixture then ran outside the sandbox with a fresh temporary profile and no debugging port. No primary app/user profile was used.
- `git diff --check` passed before and after. The Impeccable detector reported five warnings in existing CSS spring/layout animation declarations; all are outside these corrections, and none is a new finding. Output: `/tmp/notch-b-r2-independent-audit.json`. No animation/architecture changes were proposed.

## Visual evidence inspected

Inspected this review's freshly rendered `comparison.png`, `trail-pager.png`, `detached-band.png` and `page-settings.png`. Comparison uses the same labeled 640px geometry and 180px camera gap on both sides: camera-left lane fills before pages continue right ahead of status; when needed, whole-icon pages and discrete arrows share the rounded pager track. Detached mode shows a continuous leading rail. Settings retain compact icon/text chips and distinguish selected, unselected and unavailable choices.

Also inspected the supplied `/tmp/notch-b-settings-app.png` and its JSON: compact Traditional Chinese controls include four built-ins plus System, authored Canvas and Token Pulse; recorded 380px layout has no horizontal overflow. This is parent-provided isolated App evidence; I did not launch/re-run that App. It is not hardware camera/compositor acceptance.

## Full verification boundary

Did **not** duplicate `npm run verify`. Inspected the parent `/tmp/notch-b-r2-verify.log` after it finished and preserved the observed bytes in `/tmp/notch-b-r2-independent-parent-verify-observed.log`.

- Lint completed; tests report **7719 pass, 8 skip, 1 fail** (7728 total).
- Failure: `tests/shared/watcherHost.test.js:416`, “a real worker delivers events and stops watching the old roots after a reconfigure”; assertion at line 430: **“no event from the worker”**.
- The previous round's recorded 7720/8/0 is historical, not this round's result. I did not rerun or diagnose that unrelated worker test, so its cause/flakiness is unestablished here. The parent must resolve or accurately document that full-suite failure before claiming a green verification gate.

## Acceptance limits

Bounded GO applies to the named renderer corrections, preservation checks and frozen source only. No broader plugin/runtime architecture review, native hardware camera/hover/compositing, non-activating-window keyboard behavior, VoiceOver traversal of `aria-owns`, exhaustive locale/unit/rate combinations, packaged delivery, Windows/Linux or endurance acceptance was performed. The fixture's Western formatter and geometric coverage do not establish an unlimited-rate width guarantee. User visual approval remains separate. No push/publication is authorized by this report.

## SHA256 before/after

The complete before/after records cover all 13 files; the three round1-to-round2 changes are:

- `scripts/test-plugin-corrections-ui.cjs`
  - Round1: `830a719ac864548a515e25ee8a33d8877669cd7ecba0ebde95551372b7ba4433`
  - Round2 before/after review: `e1d75327349540c03d9c71f538d943e39c379c5f61701326071216158168eb01`
- `src/electron/renderer/notch/notch.css`
  - Round1: `5d6d7a66bf728b466baadec84b755effa2e7e82aceba6c88790d19e2f2addd76`
  - Round2 before/after review: `9f61b31e648a836cbedbd09a58f92dc1147a94653cbb6fe9886626d55b25c215`
- `src/electron/renderer/notch/panel.js`
  - Round1: `850d31b3499f550ffd3241f9aa3e9871147a6673a5963eedda2b6a0db55eb6f5`
  - Round2 before/after review: `64ab359c93623ecf26f1bd6b1168488e5e16562af89da5fc6a98ae566bfaeb78`
