# Author UI: smallest useful next step

Proposal only; no new web UI, animation API, assets API or OS permissions are implemented in this change. Keep the existing declarative API compatible while evaluating one optional richer page type. Do not expand the display-list language into a general browser replacement.

## Comparison

| Concern | Declarative components everywhere (today) | Hybrid: compact data + isolated web pages (proposed) |
| --- | --- | --- |
| Author freedom | Host components, bounded drawing, finite style tokens and inherited number motion | Standard HTML/CSS/JS, local images/fonts, CSS transitions and canvas inside an owned page |
| Maintenance | Every new control, material and animation needs validator + resolver + renderer + tests | Browser owns layout/motion; we maintain packaging, sandbox, a small bridge and lifecycle. Two paths remain, so this is not zero-cost |
| Tray / collapsed rail | Fits bitmap/compact values and system typography | Keep today's data interface; embedding a browser here has little benefit |
| Main App page | Works, but authored layout is restricted | Best first target: stable rectangle, existing focus and navigation. Optional author declaration, optional user placement |
| Expanded Notch / Dock | Predictable hit areas, geometry, host gestures | Possible later; must prove pointer capture, keyboard/IME/Escape, scroll-vs-dismiss gestures, transparent backgrounds, resize and camera-safe bounds |
| Resource isolation | Worker supervisor; host draws bounded output | A sandboxed iframe isolates authority, not necessarily CPU or memory. A hung frame must not block main UI; prove renderer separation/termination before shipping |
| Theme consistency | Host tokens and controls | Expose read-only theme, typography, reduced-motion and size tokens; authors may customize inside their own rectangle |

Magpie documents HTML/CSS/JS pages and embedded panels using a scripts-only sandbox, CSP, a bridge and permissioned reads. Its Bun backend hooks are a separate authority model; they are not evidence that these frames need host filesystem or credentials. [Magpie page contract](https://usemagpie.ai/docs/plugins#pages-in-the-window).

DSH explicitly warns that its plugin/security controls do not guarantee isolation. We can borrow its simple index workflow without adopting host-level plugin authority. [DSH safety statement](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md).

## Minimal prototype and retained boundaries

1. Add an optional packaged main-App web page in a separate follow-up. Demonstrate one CPU/RAM chart with normal browser animation and local artwork, theme changes, reduced motion and state restoration. Keep Tray and narrow rail views declarative. Keep existing full declarative pages working.
2. Serve only validated package paths through a dedicated local scheme. Enforce size/count/type limits, no path escape or remote assets. Use a Chromium sandbox, no Node integration, no Electron bridge/preload in plugin content, no same-origin privilege; deny navigation, popups, downloads, forms, nested frames and unapproved network. CSP is one layer, not the entire isolation argument.
3. A per-document MessagePort exposes only permissioned data subscriptions, bounded plugin storage and finite host actions. Validate shape, rate, sender/document identity and request IDs; revoke on reload, close, disable and uninstall. Never trust `Origin: null` alone. Do not expose tokens, cookies, account credentials, arbitrary IPC, shell or files.
4. Theme/size/visibility updates are host messages. Hidden pages release data demand immediately. Unload inactive web content after a short retention window; on disable/uninstall destroy its renderer resources, abort requests and revoke ports. Background computation remains an explicitly enabled Worker capability, never an invisible web page. Add heartbeat/request deadlines and shared sampler tests; bound concurrently mounted pages.
5. Before selecting iframe versus a separately sandboxed WebContents container, prove a busy/infinite-loop page cannot freeze the main App and that disposal actually stops its timers/workers. Measure memory with several pages. An iframe alone is not a process-level resource guarantee. Only then evaluate an expanded Notch/Dock panel with native focus, gestures, transparent compositing and scaled geometry.

This gives authors a familiar browser for rich content without implementing another animation engine. Main-page prototype acceptance is a separate scope decision, not an automatic rewrite of this PR.

## System data contract direction

Keep current `sys.cpu` and `sys.memory` bindings compatible. Add versioned source descriptors through the existing broker: schema/version, units, fields, capabilities, minimum sampling interval and availability. A proposed reading envelope distinguishes `ok`, `unsupported`, `permission-denied`, `unavailable`, and `stale`; carry timestamp/age and nullable value, never turn absence into zero. These statuses do not exist in full today.

Plan granular permissions and source families: CPU total/per-core utilization; memory resident/available/pressure and swap; per-device disk I/O and per-interface network rates; battery charge/power/time estimates. Rates need reset-aware counter deltas and a measured time base. Platform adapters advertise supported fields; GPU/temperature require a platform-by-platform API and privilege feasibility check before any promise. Do not spawn arbitrary commands or grant general system access to obtain missing fields.

All consumers of one source share one in-flight sample at the fastest permitted cadence. Zero consumers means zero scheduled sampling. Hidden/disabled/uninstalled consumers release subscriptions; explicit background consumers retain only their own slower cadence. Cancel pending adapter work where supported; discard late results after cancellation/generation change. Test zero-demand idle, shared cadence, loss of final consumer and unavailable-to-recovered transitions before adding each source.

## Distribution scope

The shipped official catalog plus user-added HTTPS community indexes is an acceptable first version. Keep source/version/hash confirmation, compatibility, permissions, isolation, disable/uninstall and recovery. Submission backends, staff review, ratings and remote revocation are optional product work, not merge gates. Nothing here authorizes publication or adding external sources.

Magpie offers a registry PR and separately labelled unreviewed GitHub-topic discovery. DSH lets the user add a JSON index and validates its format without certifying third-party claims. [Magpie listings](https://usemagpie.ai/docs/plugins#publishing-and-listing) · [DSH indexes](https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market).
