# Plugin validation and acceptance boundaries

## Reproduce

```sh
npm run verify
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-settings-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-motion-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-corrections-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-notch-page-order-ui.cjs
env -u ELECTRON_RUN_AS_NODE npm run verify:plugins -- --out /tmp/plugin-report.json
```

The Electron scripts use disposable user data and fixture APIs. They do not start the user's primary app or publish packages. The isolation script deliberately creates flooding, busy and memory-consuming Workers; run it as a separate acceptance check, not inside normal `npm test`.

## Settings and page-order follow-up

The Installed toolbar contains file installation and a shared-menu action for the saved master preference. Safe mode does not overwrite that preference; pausing keeps each plugin's selections and uses an inline summary. Pointer opening does not force keyboard focus onto the switch. Notch page choices reuse the shared drag controller for wrapped, mixed built-in/plugin ordering, with keyboard alternatives and a right-aligned Reset action matching the existing Dock/Notch composer. Reset changes order only. Cross-camera selection uses the existing transition and respects reduced motion.

Disabled plugins are omitted from the Notch choices, Dock cells and final Tray bitmap without deleting placement/order preferences. Re-enabling restores those preferences. Home, main-menu pages and Notch runtime metadata already filter inactive plugins; unavailable saved composer entries remain editable preferences.

- Final `npm run verify`: **7,731 passed, 8 skipped, 0 failed**, including lint. An earlier run exposed a Notch VM fixture missing its new `pluginRuntime` dependency; the fixture was corrected without removing assertions and the complete rerun passed.
- Isolated Chromium ordering/availability harness: **19/19**. Covers wrapped drag, keyboard sorting, disk reload, failed-save recovery, zoom, reset, disabled/master-off filtering and restoration of order/visibility.
- Independent availability/reset review: **bounded GO**, **571 Node tests**, **19 Chromium checks** and **3 production probes** passed; **11/11** frozen source hashes unchanged. The probes include immediate Dock repaint, no-stats handling and Tray null-bitmap fallback. The reviewer read the earlier full-suite log; the final complete green rerun above is parent evidence.
- Independent mixed-order review: **141 Node tests** and **13 Chromium checks** passed, with supplementary Escape/resize cancellation probes. Toolbar safe-mode correction review also returned bounded GO. Cross-camera motion regressions failed **3/54** before and passed **54/54** after correction.

[Before sorting](evidence/settings-followup/order-before.png) and [after moving a plugin ahead of Home](evidence/settings-followup/order-after.png) use matching synthetic data, dimensions and zoom. They demonstrate production controls and renderer behavior, not hardware camera acceptance. The standalone settings fixture's lower mock Notch metadata is static during availability tests; its disabled-page screenshot is not used as runtime evidence. Physical hardware, native menu-bar composition and packaging remain outside these checks.

## Notch B navigation follow-up

The local B layout fills the camera-left lane in normal page order, then continues into the right lane before the rate/refresh controls. Whole tabs are distributed in discrete slots; only overflow across both lanes shows the small step controls inside a rounded track. Paging the tab window does not change the open content. Arrow keys navigate relative to the focused tab, including when the selected tab has been paged out of sight. Without a camera, one continuous rail occupies the available space before status.

The original Notch settings use the same page/icon choices as compact toggle chips. Selected/unselected states, failed saves, concurrent refresh and focus restoration use the existing placement/settings paths; disabled plugin choices are now filtered as described above. The isolated running App showed seven choices on two lines at 380 CSS px (the choice block measured about 127 CSS px), with no horizontal overflow; this is temporary acceptance data, not a primary-user profile.

- Final complete `npm run verify`: **7,720 passed, 8 skipped, 0 failed**, including lint. An earlier run after correction had one native watcher timeout (7,719 pass, 8 skipped); its standalone 26-test suite and the subsequent full rerun both passed. No watcher code was changed.
- Focused Node tests: **86/86**.
- Isolated Electron correction harness: **45/45**, with production compact-number formatting, camera/rail geometry across 480/640/760 widths and .75/1/1.5 zoom, split tracks, discrete overflow, demand release, settings saves and keyboard focus.
- Regression evidence: live-push tab focus and missing keyboard entry failed before the first correction; independent review then found mode-switch focus loss, navigation from a fallback entry and compact rounding at 630/700 CSS px. The checked-in harness fails four assertions before those three fixes and passes afterward. [Results](evidence/notch-b/results.json) · [Before correction](evidence/notch-b/review-regression-before.json).

Independent correction review: **bounded GO**, Node 86/86, checked-in UI 45/45; exact old-snapshot probes 57/61 become 61/61 on the final snapshot. All 13 hashes matched before/after. [Report](evidence/notch-b/review-round2.md). The reviewer inspected the earlier watcher-failure log; the separate final parent rerun subsequently passed in full, recorded in [the final summary](evidence/notch-b/verify-final-summary.txt).

[Rendered comparison and isolated App settings](notch-b-gallery.html). Synthetic camera geometry is deliberately distinguished from the running App settings proof. Physical Notch geometry/hover/compositing, VoiceOver, IME, Windows/Linux and packaging remain untested. The review is bounded to this UI delta; runtime isolation and author-web-page proposals were not reopened.

## PR #1164 follow-up on 230e819

- `npm run verify`: **7,712 passed, 8 skipped, 0 failed**, including lint. The first run exposed five old Notch fixture failures because its extracted function lacked the new page-choice helper; its dependencies were updated without removing assertions.
- Short-burst control-message regressions fail on the prior implementation and pass after the fix in both host and main. Exhausted control budgets terminate through backoff/circuit recovery rather than silently losing completion; a generation/sequence-fenced 30-second tick deadline covers a live heartbeat with a stalled tick.
- New isolated Chromium correction harness: **23/23**. Uses the actual built-in CPU/RAM ring declarations, explicit numeric captions, Roll/Count, author `none`, reduced motion, nine chosen pages, three widths × three zoom levels, camera-safe overflow, keyboard navigation, demand release and save/focus restoration.
- Real Electron sandbox harness (`--quick`): **50/50** on macOS arm64 / Electron 43.7.9. Zero-demand idle, explicit background cadence/off, idle Worker release and busy/memory/flood containment passed. Chromium reported one failed memory-dump attempt while the deliberate memory bomb was running; the supervisor still stopped it for exceeding its memory budget.
- Additional disposable Node integration probe uses the real managed installer + manager + shared data bus: two installed plugins share six samples over ten seconds, uninstalling one retains the other, and uninstalling the last stops all sampling for the following simulated minute. [Probe](evidence/pr1164-corrections/managed-uninstall.cjs) · [results](evidence/pr1164-corrections/managed-uninstall.json).
- Isolated running App at 380 CSS px: original Notch settings show built-in and plugin choices together. A built-in choice saved and restored through the real settings path; no horizontal overflow. Programmatic Chromium interaction is not a hardware-pointer/IME acceptance claim.

[Matched before/after renderer evidence](evidence/pr1164-corrections/comparison.png) uses the same synthetic CPU/RAM values, camera gap, dimensions and four built-in plus three plugin selections. It captures Count mid-transition, not a different final number. The camera is simulated; physical Notch geometry remains a manual check. Raw renderer/sandbox results and the frozen source manifest are adjacent to the image.

Independent frozen-delta review: **bounded GO**, 160 Node checks, 23/23 Electron checks plus four additional cases (27/27 extended total), 25/25 source hashes unchanged. [Report](evidence/pr1164-corrections/independent-review.md). A P3 screenshot-only issue was corrected afterward: the settings fixture now includes the production styling wrapper and waits for a compositor frame. Production source is unchanged from the reviewed snapshot; the corrected fixture again passes 23/23. The [independent screenshot follow-up](evidence/pr1164-corrections/independent-screenshot-followup.md) confirms bounded GO, the P3 resolved, and all 25 final hashes unchanged.

## Earlier recorded local results

On macOS after integrating main at `c3b38e779`:

- `npm run verify`: **7,704 passed, 8 skipped, 0 failed** (lint and Node tests).
- Settings Electron harness: **58/58**. Covers persistent tabs, focus/scroll and draft retention, source/preview routes, rapid version selection and exact install token, identity artwork/source labels, compact placements, shared menu surface/keyboard/positioning and host style-editor dimensions.
- Motion Electron harness: **40/40**, rerun after integrating main. Covers per-component `inherit` / `none`, Roll/Count and reduced-motion precedence.
- Earlier Electron isolation harness: **50/50** at the reviewed runtime stage. Additional independent probes found and drove corrections for malformed messages, payload limits, storage/reload, stale host callbacks and view budgets. Passing an earlier harness alone is not proof of every sandbox boundary.
- Independent reviews covered successive runtime, lifecycle/distribution, interactive-content, page/motion and settings changes. The final menu/style delta received bounded GO: **58** independently repeated Electron checks plus **8** supplementary checks, **216** focused Node tests and clean lint. Full verification was parent-run, not independently repeated.

Actual isolated-app checks at 380 and 520 CSS px found no horizontal overflow in the four plugin settings tabs. Pointer and keyboard checks covered placement tooltip dismissal/navigation, action-menu Escape/focus restoration, Home/End, outside-click dismissal and style transfer. The menu shares existing App popup surface rules and positioning helpers; style colors use the existing 30×22 px inputs. Native-glass CSS parity was checked in Chromium fixtures, not accepted as physical macOS compositor proof.

[Installed plugins](screenshots/installed.png) and [personal style editor](screenshots/style.png) show the visible plugin UI from temporary local acceptance data. Live usage totals and account details are excluded. The editor is scrollable; its screenshot shows the visible portion.

## Boundaries that remain open

- Physical Notch hover/geometry, actual menu-bar interaction, Edge Dock hover cards, hardware IME, OS color dialogs and notification delivery.
- Windows/Linux runtime interaction, packaging/signing, long-running resource behavior and power-loss durability.
- Screen readers, every locale/theme/text scale and resizing continuously while an action popover remains open.
- Public registry operation and publication are not performed. The official bundled catalog plus user-added HTTPS indexes is the accepted first-version scope; submission services, staff review, ratings and remote revocation are not acceptance requirements for this PR.

Worker creation itself is not claimed blocked: a native probe created a nested Worker. Network access remains constrained by the host/CSP/broker boundaries; the nested-Worker result did not establish a network escape.

See the [capability matrix](plan.md) for implemented local behavior versus remaining authoring and distribution capabilities. The catalog is a first-version discovery/install workflow; folder loading alone is not a store. Rich author web pages remain a proposed follow-up, described in [the architecture comparison](author-ui-options.md).
