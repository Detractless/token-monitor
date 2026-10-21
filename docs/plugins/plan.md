# Plugin ecosystem capability matrix

This is a local runtime, management and interactive-content implementation, a first-version distribution solution using app-shipped official listings and user-added community sources. It does not require an operated submission/review/rating service. [Validation](validation.md) distinguishes implementation from native/platform acceptance.

| Capability | Implemented locally | Partial, absent or not yet accepted |
| --- | --- | --- |
| Code plugins | One bundled JavaScript entry in an isolated Worker; brokered metrics, storage, notifications and approved HTTPS | No arbitrary Node/DOM, dynamic modules or service credential onboarding |
| Data reuse | Shared host-source sampling; a plugin's metrics reused across its views/background checks | No public inter-plugin dependencies or package dependency resolver |
| Main App, tray, Edge Dock, Notch | Placement controls, compact/full layouts, tray bitmap drawing, unified built-in/plugin Notch selection with camera-safe scroll navigation | Native menu-bar interaction, Notch hover/geometry and Edge hover-card acceptance remain open |
| Optional main-app pages | Author declares `page`; user enables each page independently. Enabled pages join the existing main-app view menu, retain controls/drafts while switching, and suspend demand behind Settings. Optional detached windows share demand safely | No automatic page generation. Authoring layouts still requires a manifest/code; no visual page builder. Unsubmitted drafts and scroll are session-local |
| Free drawing | Validated rect/circle/line/arc/poly/path/text lists from plugin code; host-owned SVG/canvas rendering | Pointer/keyboard actions and persistent Sketch Pad implemented; still bounded display lists, with no WebGL, HTML/CSS, images or custom font loading |
| Plugin identity icons | Author-supplied bounded static PNG embedded in manifest/catalog metadata; host slots in installed/catalog/detail/preview, fallback icons, no remote image fetch | SVG, animation and arbitrary view image assets remain unsupported; identity art never replaces host source labels |
| Skins | Colour/vendor presets plus font, spacing, corners and panel tokens; personal UI preview/save/reset/JSON import/export | Partial: finite host styles; no arbitrary stylesheets, visual layout designer or main-app shell replacement |
| Number motion | Existing App Roll and Count shared by plugin numeric components; author per-component `inherit` / `none`, default inherit; global reduced motion wins; compact rail display font matches built-in content | No author-defined CSS/DOM animations, custom timelines or navigation transitions. Drawing/data updates are coalesced at 250 ms; tray stays static like the built-in bitmap path |
| Non-AI sources | CPU/memory and brokered approved HTTPS | Broader OS adapters and service authentication not included |
| Visibility/background | Explicit background opt-in, shared demand/cadence, idle teardown, request cancellation, alert producer demand, safe mode | Sampled resource bounds; idle timers may continue until teardown; endurance unverified |
| Installation | File/folder import, package preview, exact source/version/hash, disabled until consent, staged transaction | Single-bundle `.tmplugin` format; no npm/Git package resolver |
| Updates | Manual catalog refresh, version/changelog selection, confirmation, no silent permission expansion | No automatic updater or data migration framework |
| Rollback/uninstall | One verified compatible previous version; corrupt-current rescue; data/placement retention choices; grants removed | Data migrations cannot be reversed; applied colours intentionally remain; power-loss durability not verified |
| Official catalog | Searchable offline app-shipped catalog: System Monitor, Token Pulse and Sketch Pad | Public hosting, submission, maintenance and publishing service absent |
| Community catalog | User-added HTTPS catalogs, searchable listings, cached offline metadata, explicit refresh, digest checks, Unreviewed label; optional key pin | No pre-enrolled external catalog; public registry inventory, submission, moderation, reporting/revocation operations absent |
| Evidence | Full verify, actual Electron adversarial probes, independent review rounds, real desktop renderer captures and lifecycle acceptance | Windows/Linux, packaged/signing delivery, OS notification delivery and native interactions above remain unverified |

## Remaining work in reasonable order

1. The interactive/drawing API and local style editor passed bounded independent review and final verification. Further local authoring freedom remains: a visual layout editor, safe image/font assets and inter-plugin dependency contracts are not implemented. Define those contracts before extending the host API; finite controls and style tokens do not provide unrestricted UI freedom.
2. Complete native Notch/Tray/Edge interactions, notification delivery, endurance and packaged cross-platform acceptance.
3. Before public distribution, decide registry ownership, publication location, moderation/revocation and author submission policy. These are new external publication/trust decisions and require the user's direction; no source is silently enrolled.
4. Only after those decisions, operate the official/community registry and author publishing workflow. Local catalog browsing and loading do not constitute a complete public store.

The implementation is proposed for code review. It does not enroll an external source or publish a registry, release or package to a distribution service.

## Next architecture decision

See [author UI architecture comparison](author-ui-options.md). New animation/material APIs are paused while comparing a hybrid sandboxed-web page model; the current declarative API remains supported. Public review operations, ratings and remote revocation are not first-version merge requirements.
