# Publishing checklist — Moltn Sync

Two channels. Do sideload/BRAT now; do the official directory when polished.

## Now — pilot distribution (no review needed)

- **Sideload:** hand the customer `main.js` + `manifest.json` + `styles.css`
  → they drop them in `<vault>/.obsidian/plugins/moltn-sync/` and enable it.
- **BRAT (auto-update):** needs a public repo + a GitHub release. Customer
  installs the BRAT plugin, adds `github.com/<org>/obsidian-moltn-sync`, done.

## Later — official Community Plugins directory

Prerequisites (this folder already has them):

- [x] `manifest.json` — `id` unique + contains no "obsidian" (`moltn-sync` ✓),
      `name` doesn't start with "Obsidian", `isDesktopOnly: false`,
      `minAppVersion` set.
- [x] `versions.json` mapping version → minAppVersion.
- [x] `README.md` describing purpose + usage, **and disclosing that the plugin
      sends note content to the Moltn URL the user configures** (Obsidian
      requires network/data use to be disclosed — this is allowed; Readwise does
      the same).
- [x] `LICENSE` (MIT).
- [x] Release workflow (`.github/workflows/release.yml`) — builds and attaches
      `main.js`/`manifest.json`/`styles.css`.
- [ ] Source is not obfuscated (esbuild bundle of readable TS — ✓, keep it).
- [ ] No hidden telemetry / no calls to any server other than the user's Moltn.

### Steps

1. Put the repo on its **final** public account/org first (the directory binds
   to the repo URL — don't submit from a temp account you'll transfer later).
2. Ensure `manifest.json` version is bumped (semver `x.y.z`).
3. `git tag <version> && git push origin <version>` → the workflow cuts a
   GitHub release with the three assets. Confirm the release exists.
4. Go to **community.obsidian.md**, link GitHub, **New plugin**, paste the repo
   URL, review + agree to the Developer policies.
5. Automated checks run, then a human review (days–weeks). Fix anything they
   flag, push a new tag if needed.
6. On approval it appears in-app under **Community plugins**; releases
   auto-update users. Announce in the forum's Share & Showcase + Discord.
