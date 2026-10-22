# Write a Token Monitor plugin

## Start with a working readout

Copy the complete `cpu-readout/manifest.json` from [Smallest declarative plugin](README.md#smallest-declarative-plugin). No JavaScript or dependency install is needed. In Settings → Plugins → Installed → More plugin actions, import that folder, review its `sys.cpu` permission, then enable the plugin. Choose a supported placement in its settings. Edge Dock and Notch also need their existing App setting enabled. The readout uses the App theme and only samples while visible.

To make a distributable local file:

```sh
node scripts/build-plugin-package.js /absolute/path/cpu-readout /tmp/cpu-readout.tmplugin
```

Use “Install from file” to preview the exact source/version/permissions before confirming. Installation and execution approval are separate. Develop against a disposable App profile; do not overwrite your personal profile or put credentials in fixtures.

## Choose the UI for each surface

| Need | Declarative UI | Rich UI |
| --- | --- | --- |
| Quick CPU/RAM value or chart | Host renders immediately from available data; cold source can still need its first sample | Needs an isolated document on first open or eviction |
| Continuous curve | Opt-in host sparkline with timestamped measured history | Author controls SVG/canvas/CSS/rAF |
| Custom layout, animation, images and interaction | Validated components and drawing commands | Packaged HTML/CSS/JS and local assets |
| Main App | Home and optional plugin page | Original model/tool/device content slots |
| Notch / Edge Dock | Supported | Optional full panels; Edge Dock also supports compact art |
| Tray bitmap | Supported | No embedded web document |
| Hide | Release visible sampling demand | Release demand and freeze bounded retained documents, or destroy |

Choose independently per declared view/surface. A plugin does not need its own page. Rich UI remains available on Notch and Edge Dock; the host does not force a renderer based on what other plugins choose. A declaration supplies a fallback layout so a failed/unsupported web surface can remain useful. UI selection grants and placement settings still belong to the user.

For smooth lightweight curves use the [sparkline example](README.md#continuous-declarative-sparklines). System Monitor demonstrates both renderers; its main-App layouts are declarative and its Notch/Edge Dock full charts remain Rich UI. Try the renderers under identical sampling cadence rather than speeding up collection to hide animation steps.

## Author a web document

Start from [Surface Studio](examples/surface-studio/manifest.json) for Notch/Edge Dock or [Page Studio](examples/page-studio/manifest.json) for original App pages. These are complete packaged examples; see their HTML, CSS and JS beside each manifest. Declare `ui.web` and `tm.pages`, enumerate local assets and name the target. Use the fixed `tm` bridge documented in [the reference](README.md), never host DOM, Node or internal IPC. Theme tokens and reduced-motion context come from the App.

For a document that benefits from longer quick-reopen retention, add this field to its existing manifest entry:

```json
{ "retainMs": 120000 }
```

This requests two minutes after hiding. The allowed range is any nonnegative safe-integer duration in milliseconds or `"until-evicted"`, default 30000. `"retainMs": "until-evicted"` omits idle expiry. It is not a keep-alive guarantee: the host can evict earlier for count/memory limits, reload, disable, revoked grants or owner closure. Retention does not grant background work. Persist drafts with `tm.storage`, and handle a genuine cold launch. Only explicitly enabled Worker background features may keep background sampling demand.

## Test before sharing

Check cold open, quick reopen, expiry, missing data, reduced motion, keyboard/focus, resize and each supported surface. Hide every consumer and verify the source stops; multiple consumers should share sampling. Disable/revoke the plugin while it is open and while cached. Do not claim Windows/Linux or physical Notch acceptance from a synthetic renderer fixture.

See [README verification commands](README.md) and [distribution contracts](distribution-design.md) for packaging and catalog checks. Existing official and user-added HTTPS catalogs are the first-version distribution model; a public submission backend or manual-review operation is not required. Do not label third-party source claims as host verification.

## Documentation references

This guide adopts an example-first path followed by lifecycle/API/testing/distribution guidance, inspired by [Magpie's author guide](https://usemagpie.ai/docs/plugins). Its UI and backend privilege models are separate; this does not imply Token Monitor grants the same APIs. [DSH's market guide](https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market) is a useful example of documenting a simple JSON catalog, installation confirmation and third-party source claims. Our actual contracts remain those linked above, not another project's formats or security promises.
