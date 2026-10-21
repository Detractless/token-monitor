# Plugin pages and distribution contracts

The local runtime now includes independent pages and a managed package/catalog workflow. Public hosting, publishing and registry operation remain separate decisions and are not performed by this implementation.

## Local workflow

1. Discover and validate the manifest, declared permissions and supported display locations.
2. A plugin may declare `surfaces: ["page"]` and optional `layouts.page`. Only explicitly enabled page placements appear in the main app’s view menu. A detached window is an optional action within that page. Main and detached page visibility share demand; neither grants arbitrary DOM or Node access.
3. Add package preview and confirmation, transactional install/update, one previous version for rollback, and uninstall with explicit data/placement retention. Installed code is disabled until approved; updates are confirmed even if their permissions do not change. Directory import remains useful for authors.
4. Add searchable Official and Community catalog views, source management, explicit refresh/update checks, integrity and compatibility failures, install/update actions, and offline cache status. No scheduled background updater is enabled by default.
5. Exercise a complete local flow: discover → preview → install → permission consent → open page → update → rollback → uninstall, plus corrupt/incompatible package and interrupted-operation recovery.

## Package format

The existing author contract is one JSON manifest and one bundled JavaScript entry, with no external assets or dynamic imports. Use a versioned `.tmplugin` JSON envelope carrying the exact manifest and the entry source, rather than introducing ZIP extraction for arbitrary files this runtime cannot use. The package is data: parsing and validation never execute code. A directory importer produces the same internal representation. Enforce total encoded bytes, a valid contained relative entry name, manifest compatibility and no duplicate/conflicting plugin identity. A package-builder command can generate this artifact from an author directory; it does not publish it.

This choice follows the current runtime's two-file contract. If images/modules/assets are introduced later, evaluate a standard archive reader and extraction policy before expanding this format. No new dependency is proposed now; existing `semver` handles version comparison and Node crypto handles SHA-256/signatures.

Managed installs record source id, exact version and SHA-256 beside local transaction metadata. Downloaded bytes must match the selected catalog digest before parsing. Updates stage and validate completely, stop/flush the current owner, preserve a recoverable previous version, atomically switch directories and reload. Failed switching restores the old directory and state; a prepared/committed journal recovers process-interrupted operations at startup. Rollback preserves data but warns that application-specific data migrations cannot be automatically reversed by the host. Uninstall never silently deletes user data.

## Accepted trust policy (2026-10-21)

The ordinary user flow is browse → inspect source and permissions → install. It does not require copying public keys. The user approved this layered policy. The previous mandatory pinned-key proposal is withdrawn.

- App-shipped catalog entries alone get the Official source label. A future maintained community list has its own community/curated label; inclusion does not make its authors official or guarantee safety.
- An advanced source manager accepts HTTPS catalog URLs, clearly labelled Community / Unreviewed. Optional pinned signatures can strengthen source identity without becoming a mandatory installation step. No outside source is pretrusted or invented here.
- Every manual install/update confirms the exact source and version. Existing permission grants survive updates; additional permissions or destinations require renewed consent before execution. No automatic update policy is enabled implicitly.
- Local packages are unverified. SHA-256 detects content mismatch; it does not establish publisher identity or prove safe code. Labels come from host-owned source records, never package claims.
- The app ships an offline browsable official catalog containing real bundled examples. Community empty states remain honest until a real source is added. Fixtures are labelled test data and are not live marketplace inventory.
- Public hosting, source enrollment, package/store publication and submission/moderation operations remain outside this local implementation.

## Ecosystem references (checked 2026-10-21)

- [Magpie authoring / publishing](https://usemagpie.ai/docs/plugins#publishing-and-listing): community registry with bundled fallback, npm/Git/folder install, separate unreviewed GitHub-topic discovery. Ordinary users do not manage signing keys.
- [DeepSeek Harness plugin markets](https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market): user-added index URLs, exact npm version or Git commit shown before confirmation; no index source ships by default and index claims are not vetted by the app.
- [VS Code Marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace): publisher trust and automatic Marketplace package-signature verification, without manual key entry.

These are distribution precedents, not permission-model equivalence: Token Monitor retains its separate sandbox and broker grants.

## Persistence and recovery bounds

Registry reads and writes share a 1 MB limit; the journal uses 2 MB. Next registry and journal payloads are bounded before replacement. Capacity failure leaves the prior installation intact. The journal file is fsynced, but directory/staged-file power-loss durability is not guaranteed; only process termination recovery has been exercised.

Backups may read a formerly compatible installed version after the host upgrades. A rollback target must itself satisfy current compatibility. Uninstall skips current package parsing; rescue rollback tolerates a corrupt current package and drops the unusable reverse backup. Update discovery uses the managed installed version when runtime discovery is invalid, keeping a compatible recovery update reachable.

Source and package URLs are bounded after URL normalization, before persistence. Ordinary sources are HTTPS, credential-free, fragment-free and limited to 2048 normalized characters. Downloads omit cookies, reject redirects, and enforce streamed byte/time limits. Good cache survives a refresh failure; source removal aborts downloads and invalidates pending previews.

## Catalog v1

```json
{
  "format": 1,
  "title": "Example community catalog",
  "plugins": [{
    "id": "example-plugin",
    "name": "Example plugin",
    "author": "Example author",
    "versions": [{
      "version": "1.0.0",
      "url": "https://example.com/example.tmplugin",
      "sha256": "replace-with-the-64-character-sha256-of-the-exact-package",
      "engines": { "tokenMonitor": ">=0.76.0" },
      "changelog": "Release description"
    }]
  }]
}
```

This is schema documentation, not an enrolled source. The digest placeholder must be replaced by the builder's digest. Limits are 16 sources, 128 plugin entries per index, 32 versions per plugin, 1 MB downloaded index and 2 MB package. For an optional pinned source, serve `{ "payload": "base64 of exact catalog JSON bytes", "signature": "base64 Ed25519 signature over those bytes" }`; the user-provided PEM key verifies identity, not safety or review status.
