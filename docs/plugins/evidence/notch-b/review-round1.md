# Notch B — independent frozen-delta review

**Verdict: bounded HOLD. Three reproduced P2 defects remain.** The B layout and compact settings direction are implemented, but keyboard continuity and the promised status-width/tab-capacity stability are incomplete. This verdict covers the 13-file uncommitted snapshot only, not the previous plugin runtime review or full plugin/native acceptance. No source was edited.

## Frozen scope

- Worktree: `/Users/javis/.t3/worktrees/Token Monitor/feat-plugin-ecosystem`.
- HEAD before and after: `be3a88f3fa6b3315aae1ee6e81f3bbe238e7046d`.
- `/tmp/notch-b-snapshot.json`: **13/13 SHA256 matches before and after**. Final record: `/tmp/notch-b-independent-snapshot-final.json`.
- Read the frozen delta and relevant unchanged renderer helpers, plus the previous `docs/plugins/evidence/pr1164-corrections/independent-review.md` for context only.
- No primary app or checkout modifications, ports 9333/9334, CodeGraph initialization, Git mutation, public action, or nested agents. CodeGraph confirmed this worktree has no index; direct reads were used. All review scripts/logs are scratch artifacts.

## Confirmed findings

### P2 — a five-digit rate can still resize status and evict tabs

Location: `src/electron/renderer/notch/panel.js:435`, `:463-470`; production formatting contract at `src/electron/renderer/edgeDock/dock.js:317-319`, `:799-803` and `src/shared/compactTokens.js`.

The reserve probe measures `formatRate(88888)`. With the real default Western tray formatter this is `88.9K`, while the valid five-digit input `99999` rounds to `100.0K`. The latter is one glyph wider. The original UI fixture injects `formatRate: String`, so its 88888 test does not exercise this boundary.

Independent Electron reproduction uses the production compact formatter and otherwise the same production panel/CSS, nine plugin pages, four built-ins, zoom 1, camera gap 180px, refresh disabled. Render rate 28, then update only the rate to 99999:

- At **700px**, status grows from **90px to 96.859375px** and visible tab count falls from **7 to 6**.
- At **630px**, the same width growth changes the trailing pager into a leading pager: visible tabs change from `home|limits|sessions|breakdown|plugin:demo/page5` to `plugin:demo/page4|plugin:demo/page5|plugin:demo/page6`.

Impact: a normal data push changes the navigation window/capacity, including removing all four visible built-in tabs at the narrower boundary. This violates the explicitly requested stable status reservation even within the stated five-digit input range.

Recommendation: reserve the widest actual formatted reading across relevant formatting/rounding boundaries and current unit; do not assume one arbitrary five-digit input is the widest output. Add a regression using the production formatter at a slot boundary.

Evidence: `/tmp/notch-b-independent-production-format-ui.cjs` and `.log` establish the extra width at eight fixture widths; `/tmp/notch-b-independent-capacity-ui.cjs` and `.log` confirm the capacity changes at 630/700px. The two capacity assertions fail in the latter run.

### P2 — switching rate mode drops keyboard focus

Location: `src/electron/renderer/notch/panel.js:425-438`.

`rateMode` was added to the status structure key, so a speed→burn push calls `status.replaceChildren()` and replaces the focused rate button. The old frozen-HEAD implementation keeps the button in place for this transition.

Reproduction in isolated Electron: render speed mode, focus `.notch-rate`, then render the same payload with only `rateMode: 'burn'`. **Before:** focus remains on the rate button. **After:** the original button is disconnected, `document.activeElement` is `BODY`, and the new unit reads `TPM`.

Impact: keyboard activation of the rate toggle loses its focus location, preventing a second activation without navigating back. This is separate from live numeric samples, whose existing focus-preservation check passes.

Recommendation: update unit/probe/reservation in place on mode changes, or explicitly preserve the focused control through the rebuild. Keep an independent regression for mode changes, not only numeric samples.

Evidence: `rate-mode-toggle-retains-focus-before` passes and `rate-mode-toggle-retains-focus-after` fails in both scratch extended runs. See `/tmp/notch-b-independent-extra-ui.log`, `/tmp/notch-b-independent-production-format-ui.log`.

### P2 — fallback keyboard entry navigates relative to an invisible selection

Location: `src/electron/renderer/notch/panel.js:168-170`, `:248-260`.

The pager correctly leaves a visible `tabIndex=0` entry when the selected tab is hidden. However, ArrowLeft/ArrowRight still calculate the next tab from `view.page`, rather than from the focused tab that received the key.

Reproduction at 640px, zoom 1, gap 180px, four built-ins and nine plugin pages: select `plugin:demo/page4`, step forward until its tab is hidden, and focus the visible fallback entry **Home**. Press ArrowRight. Expected next tab is **Limits**; actual selection and focus jump to **`plugin:demo/page5`**.

Impact: tab re-entry appears to start at Home but arrow navigation skips the adjacent built-in tabs and jumps across the camera into the previous hidden selection's neighborhood. The parent's fixed missing-tabstop case is covered, but its usable navigation behavior still has a regression.

Recommendation: derive relative arrow navigation from the focused tab event target when it is a tab, with an appropriate fallback for other event origins. Preserve the discrete pager window behavior on ordinary live pushes.

Evidence: `fallback-keyboard-follows-focused-tab` fails consistently in `/tmp/notch-b-independent-extra-ui.log` and `/tmp/notch-b-independent-production-format-ui.log`.

## Validation and positive evidence

- **86/86 focused Node tests passed independently**: `node --test tests/electron/notchPanel.test.js tests/electron/notchPageSettings.test.js tests/electron/i18n.test.js`. Log: `/tmp/notch-b-independent-node.log`.
- **Requested production isolated Electron script: 41/41 passed independently.** Log: `/tmp/notch-b-independent-ui.log`; artifact directory `/var/folders/fy/4wmcgtwj02966_f8fxrqfvwc0000gn/T/tm-plugin-corrections-MczC8B`. Initial sandboxed launch aborted with SIGABRT; the same explicitly authorized command succeeded outside the sandbox, with its separate temporary profile and no debugging port.
- Visually inspected all four generated PNGs: `comparison.png`, `trail-pager.png`, `detached-band.png`, `page-settings.png`. At the labeled identical 640px data/geometry, the new rail fills the camera-left lane first and continues to the right ahead of status; arrows sit within the rounded track; icons are whole. The detached rail is continuous before status as requested. Settings show icon+text toggle chips with selected/unselected/unavailable states. This is production renderer/component proof under synthetic geometry, not hardware acceptance.
- Parent's two earlier regressions are now passing in my independent 41-check run: stable tab focus on identical live pushes and a visible keyboard entry when the selected tab has been paged away. Parent's before log records 39/41 with those two failures; this historical failure log was inspected, not independently regenerated.
- Scratch extension: **57/59**, including the original 41. Both failed assertions are the two focus findings above. Nine additional 480/640/760px × .75/1/1.5 zoom refresh checks pass, using the production refresh CSS and equivalent button/icon DOM with its 24px width. They confirm whole-slot containment, camera clearance and no track/status overlap; they do not exercise the real limits-refresh transport callback. Saved unavailable selections remain removable, then become disabled after removal. Delayed settings completion consumes the latest catalog/context, persists the choice, disables concurrent chips, and does not steal focus from an external button.
- Replacing String with the actual production compact formatter: **58/61**. The two focus failures remain and status-width stability additionally fails; the eight coarse widths do not all cross a slot boundary. The targeted 630/700px confirmation is **57/61**, with four failed assertions representing the same three defects (status width and tab capacity are two assertions for one defect). These runs share tests and must not be summed as independent totals.
- Parent full `/tmp/notch-b-verify.log` inspected, **not rerun**: lint completed and tests finished with **7720 pass, 8 skip, 0 fail** (7728 total).
- `git diff --check` passed. Impeccable detector emitted eight warnings on unchanged pre-existing spring/layout-animation declarations; these are not new findings. Output: `/tmp/notch-b-independent-audit.json`. Incumbent tokens, icon vocabulary, button semantics and visible chip focus styling are retained.

## Limits and handoff

No native hardware camera/hover/compositing, non-activating-window keyboard behavior, VoiceOver traversal of `aria-owns`, packaged app, Windows/Linux, or long-duration performance acceptance was performed. No broad runtime/architecture re-review was reopened. The three findings above are reproducible Chromium production-component defects, independent of those untested boundaries.

Fix the three P2s and re-lock the changed snapshot for focused review. User visual approval remains outstanding; no push or publication is authorized by this report.
