# Moltn Sync — Obsidian plugin

Pulls finished notes from your **Moltn** install into this vault, and (optionally)
shares chosen notes back to Moltn as context. **Your files stay yours** — Moltn
only queues notes until this plugin has written them, then deletes them.

Works on **desktop and mobile** (uses only Obsidian's cross-platform APIs).

## How it works

- Every N minutes (and on startup) the plugin calls `GET /vault/pending` on your
  Moltn install, authenticated with a **vault token**.
- It writes each note into your target folder (never overwrites — adds a numeric
  suffix on a name clash), then `POST /vault/ack` so Moltn drops it from its outbox.
- Optional: the **"Dela kontext-mapp"** command pushes a folder you choose (e.g. a
  price list) to `POST /vault/context` so Moltn's builds/answers can cite it.

Because the plugin runs inside Obsidian, notes land next time Obsidian is open on
any device; your own device sync (Obsidian Sync/iCloud) then spreads them.
See `../docs/engineering/19-obsidian-sync.md` for the full architecture.

## Build

```sh
cd obsidian-plugin
npm install
npm run build          # produces main.js
```

## Install into a vault (sideload)

Copy `manifest.json`, `main.js`, and `styles.css` into:

```
<your vault>/.obsidian/plugins/moltn-sync/
```

Then in Obsidian: **Settings → Community plugins → enable "Moltn Sync"**.
(Turn off Restricted/Safe mode first if needed.)

## Configure

1. In Moltn (as admin): **Konto & säkerhet → Valv-sync** → copy the **vault token**,
   and turn on **"Synka till Obsidian-valv"** in Inställningar.
2. In the plugin settings: paste your **Moltn install-URL** (e.g.
   `https://din-app.fly.dev`) and the **vault token**, pick a **target folder**
   (default `Moltn`), and optionally a **context folder** to share back.
3. Click **Synka nu** — your dictations/meeting notes appear in the vault.
