# Plugin validation

## Automated checks

Run `npm run verify` for lint and the Node test suite. Renderer and lifecycle checks use isolated Electron profiles and synthetic data; they do not start the user's primary app or publish packages.

```sh
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-settings-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-motion-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-corrections-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-notch-page-order-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-web-ui.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-surface-web.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-web-cache.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-smooth-charts.cjs
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-system-monitor-rich-ui.cjs
env -u ELECTRON_RUN_AS_NODE npm run verify:plugins -- --out /tmp/plugin-report.json
```

The sandbox verifier deliberately creates flooding, busy and memory-consuming Workers; run it separately from `npm test`. Test reports, screenshots and frozen review manifests belong in local/CI artifacts and PR evidence, not the permanent author documentation.

## Business/settings integration checks

```sh
node --test tests/plugins-business-data.test.js tests/shared/pluginBusinessDerivations.test.js tests/electron/pluginBusinessCache.test.js tests/electron/pluginBusinessAdapters.test.js tests/shared/pluginSettings.test.js tests/electron/pluginSettingsStore.test.js tests/electron/pluginPresentation.test.js
node scripts/build-plugin-package.js docs/plugins/examples/business-studio /tmp/business-studio.tmplugin
```

Use a fresh output filename for packaging. Manifest/package validation establishes declared targets, grants and asset loading, not an actual native mount. For Business Studio exercise initial snapshot without a duplicate query, next-page traversal, invalidation during an outstanding page, cursor expiry, source switching, denied/missing data and unknown cost. Save preferences from both host form and Rich editor; verify committed pushes, preserved dirty drafts, revision conflicts, restart, downgrade and disabled/master-off editing. Close/park/revoke one owner while another remains; no late delivery or duplicate sampler may survive.

App integration owns immutable selected-source publication, existing-cache adapters, bridge authority after awaits, owner cleanup, settings IPC errors and host presentation ownership. A plugin PR owns a bounded manifest, fallback layouts, accurate permissions, local assets, uncertainty display and draft/pagination behavior. App/API changes must land together before a plugin can depend on them; declaring `tmApi:1` alone does not prove an older App implements new optional methods. Gate distribution on a tested App version via `engines.tokenMonitor` once that release is known, rather than inventing a version. Prefer native forms/declarative views for low-cost controls; Rich UI buys layout freedom at additional renderer, focus and lifecycle cost.

Focused DTO/store tests do not establish Worker/Rich transport, native multi-window lifecycle, source adapter purity or packaged delivery. Record the commands actually run and any remaining checks in the PR, not timestamped reports here.

## Required behavior

- Installation verifies the exact source/version/hash and permissions. Updates cannot silently widen grants. Rollback and removal must recover from invalid installed code without deleting retained user data.
- Disabled plugins disappear from runtime surfaces without erasing saved placement/order preferences. Notch ordering and reset use shared drag behavior, maintain keyboard focus and avoid camera overlap at supported sizes/zoom.
- Multiple visible consumers share sampling. Hiding, disabling or removing the last consumer clears demand; only explicitly enabled background features retain their own demand. Rate-limit recovery must not leave a healthy-heartbeat worker permanently stuck in a tick.
- Authored pages cannot access host DOM, credentials, arbitrary IPC or unauthorized sources. Selection/save failure preserves the prior document and persisted selection. Owner close, reload and capability loss revoke active and cached documents.
- Hidden retained documents freeze timers/animation and release subscriptions. Author retention never overrides global count/memory limits or revocation. Long numeric retention must not overflow Node timers.
- Numeric motion and continuous charts respect reduced motion and author overrides. Charts retain missing-data gaps, do not invent samples or increase source cadence, and stop animation when inactive or caught up with a stopped source.
- Settings preserve focus, drafts and scroll across refresh. Safe mode must not overwrite the saved master preference. App theme inheritance remains distinct from read-only legacy appearance compatibility.

## Outstanding manual acceptance

Local fixtures do not establish physical Notch/camera geometry, native hover/composition, menu-bar interaction, OS IME/trackpad, VoiceOver, Windows/Linux interaction, packaging/signing, or long-running resource/power-loss behavior. Validate these on the applicable platform before claiming acceptance.

The current long cache harness has reproduced `UnknownVizError` while capturing a resumed child. A diagnostic run omitting only that capture reached the retention/eviction assertions, then timed out on the later cold-open step before owner-close/uninstall. Keep this integration limitation open; passing unit tests and earlier lifecycle runs are not a substitute for a clean final native flow.

Official bundled listings plus user-added HTTPS indexes are the supported distribution model. A submission backend, staff moderation, ratings and remote revocation service are not acceptance requirements. See the [author guide](author-quickstart.md), [web/data contract](author-ui-options.md) and [distribution contract](distribution-design.md).

`env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-shared-runtime.cjs` exercises the production runtime and isolated preloads with synthetic host data: byte-bounded pagination beyond 500 rows, grants, host/author settings, real IPC conflict fields, hidden subscription release and warm restoration. It also checks same-plugin sibling refresh while another owner traverses page two, session-parent identity joins and subscription/calendar/balance derivations through the actual Rich bridge. It does not boot the collector or a user profile.
