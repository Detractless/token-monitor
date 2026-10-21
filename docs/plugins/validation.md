# Plugin validation and acceptance boundaries

## Reproduce

```sh
npm run verify
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-settings-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-motion-ui.cjs
env -u ELECTRON_RUN_AS_NODE npm run verify:plugins -- --out /tmp/plugin-report.json
```

The Electron scripts use disposable user data and fixture APIs. They do not start the user's primary app or publish packages. The isolation script deliberately creates flooding, busy and memory-consuming Workers; run it as a separate acceptance check, not inside normal `npm test`.

## Recorded local results

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
- Operating public official/community registries, author submission, moderation/revocation and publishing services.

Worker creation itself is not claimed blocked: a native probe created a nested Worker. Network access remains constrained by the host/CSP/broker boundaries; the nested-Worker result did not establish a network escape.

See the [capability matrix](plan.md) for implemented local behavior versus remaining authoring and distribution capabilities. Managed local catalogs and folder loading are not a complete public plugin store.
