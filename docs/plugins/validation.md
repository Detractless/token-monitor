# Plugin validation and acceptance boundaries

## Reproduce

```sh
npm run verify
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-settings-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-motion-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-corrections-ui.cjs
env -u ELECTRON_RUN_AS_NODE npm run verify:plugins -- --out /tmp/plugin-report.json
```

The Electron scripts use disposable user data and fixture APIs. They do not start the user's primary app or publish packages. The isolation script deliberately creates flooding, busy and memory-consuming Workers; run it as a separate acceptance check, not inside normal `npm test`.

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
