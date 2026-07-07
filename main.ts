// Moltn Sync — Obsidian plugin.
//
// Pull model (the Readwise pattern): this plugin polls the customer's Moltn
// install for finished notes and writes them into THIS vault. Moltn stores the
// notes only until we ack them. Optionally, it pushes chosen notes back to
// Moltn as context (so builds/answers can cite e.g. a price list).
//
// Uses only cross-platform Obsidian APIs (requestUrl + vault) so it runs on
// desktop AND mobile. No Node/Electron APIs.

import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
  requestUrl,
} from "obsidian";

interface MoltnSettings {
  moltnUrl: string;
  vaultToken: string;
  targetFolder: string; // where pulled notes land
  pollMinutes: number;
  syncOnStartup: boolean;
  contextFolder: string; // notes here are shared back to Moltn as context (optional)
}

const DEFAULT_SETTINGS: MoltnSettings = {
  moltnUrl: "",
  vaultToken: "",
  targetFolder: "Moltn",
  pollMinutes: 30,
  syncOnStartup: true,
  contextFolder: "",
};

interface PendingItem {
  id: number;
  path: string;
  content: string;
}

export default class MoltnSyncPlugin extends Plugin {
  settings: MoltnSettings = DEFAULT_SETTINGS;
  private syncing = false;

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("refresh-cw", "Moltn: synka nu", () => this.pull(true));
    this.addCommand({ id: "moltn-pull", name: "Moltn: hämta nya anteckningar", callback: () => this.pull(true) });
    this.addCommand({ id: "moltn-push-context", name: "Moltn: dela kontext-mapp", callback: () => this.pushContext(true) });
    this.addSettingTab(new MoltnSettingTab(this.app, this));

    // Poll on an interval while Obsidian is open. registerInterval ties the
    // timer to the plugin lifecycle so it's cleaned up on unload.
    this.registerInterval(
      window.setInterval(() => this.pull(false), Math.max(1, this.settings.pollMinutes) * 60_000),
    );

    if (this.settings.syncOnStartup) {
      // Small delay so the vault is fully ready before we start writing.
      window.setTimeout(() => this.pull(false), 3000);
    }
  }

  private configured(): boolean {
    return !!this.settings.moltnUrl && !!this.settings.vaultToken;
  }

  private base(): string {
    return this.settings.moltnUrl.replace(/\/+$/, "");
  }

  // --- Pull: fetch queued notes and write them into the vault ---------------
  async pull(interactive: boolean) {
    if (this.syncing) return;
    if (!this.configured()) {
      if (interactive) new Notice("Moltn: ange install-URL och valv-token i inställningarna.");
      return;
    }
    this.syncing = true;
    try {
      const res = await requestUrl({
        url: `${this.base()}/vault/pending?limit=50`,
        method: "GET",
        headers: { "x-vault-token": this.settings.vaultToken },
        throw: false,
      });
      if (res.status === 401) {
        if (interactive) new Notice("Moltn: ogiltig valv-token.");
        return;
      }
      if (res.status !== 200) {
        if (interactive) new Notice(`Moltn: fel ${res.status} vid hämtning.`);
        return;
      }
      const items: PendingItem[] = res.json?.items ?? [];
      if (items.length === 0) {
        if (interactive) new Notice("Moltn: inga nya anteckningar.");
        return;
      }

      const written: number[] = [];
      for (const item of items) {
        try {
          await this.writeNote(item.path, item.content);
          written.push(item.id);
        } catch (err) {
          console.error("[moltn-sync] write failed for", item.path, err);
        }
      }

      // Ack only what we actually wrote → Moltn deletes those from its outbox.
      if (written.length) {
        await requestUrl({
          url: `${this.base()}/vault/ack`,
          method: "POST",
          headers: { "x-vault-token": this.settings.vaultToken, "content-type": "application/json" },
          body: JSON.stringify({ ids: written }),
          throw: false,
        });
      }
      new Notice(`Moltn: hämtade ${written.length} anteckning(ar) till valvet.`);
    } catch (err) {
      console.error("[moltn-sync] pull error", err);
      if (interactive) new Notice("Moltn: nätverksfel vid synk.");
    } finally {
      this.syncing = false;
    }
  }

  // Write a note under the target folder. Never overwrites: if the path exists,
  // a numeric suffix is added (append-safe like Readwise).
  private async writeNote(relPath: string, content: string) {
    // relPath comes as e.g. "Moltn/Dikteringar/2026-07-06 Offert.md"; re-root it
    // under the user's configured target folder.
    const stripped = relPath.replace(/^Moltn\//, "");
    let full = normalizePath(`${this.settings.targetFolder}/${stripped}`);
    await this.ensureFolder(full.substring(0, full.lastIndexOf("/")));

    if (await this.app.vault.adapter.exists(full)) {
      const dot = full.lastIndexOf(".");
      const stem = dot === -1 ? full : full.slice(0, dot);
      const ext = dot === -1 ? "" : full.slice(dot);
      let i = 2;
      while (await this.app.vault.adapter.exists(`${stem} (${i})${ext}`)) i++;
      full = `${stem} (${i})${ext}`;
    }
    await this.app.vault.create(full, content);
  }

  private async ensureFolder(dir: string) {
    if (!dir) return;
    const parts = dir.split("/").filter(Boolean);
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      if (!(await this.app.vault.adapter.exists(cur))) {
        try {
          await this.app.vault.createFolder(cur);
        } catch {
          /* created concurrently */
        }
      }
    }
  }

  // --- Push: share a chosen folder back to Moltn as build context -----------
  async pushContext(interactive: boolean) {
    if (!this.configured()) return;
    const folder = this.settings.contextFolder.trim();
    if (!folder) {
      if (interactive) new Notice("Moltn: ingen kontext-mapp angiven i inställningarna.");
      return;
    }
    const prefix = normalizePath(folder) + "/";
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f: TFile) => f.path.startsWith(prefix));
    if (files.length === 0) {
      if (interactive) new Notice("Moltn: kontext-mappen är tom.");
      return;
    }
    const docs: { path: string; content: string }[] = [];
    for (const f of files) docs.push({ path: f.path, content: await this.app.vault.cachedRead(f) });

    const res = await requestUrl({
      url: `${this.base()}/vault/context`,
      method: "POST",
      headers: { "x-vault-token": this.settings.vaultToken, "content-type": "application/json" },
      body: JSON.stringify({ docs }),
      throw: false,
    });
    if (interactive) {
      new Notice(res.status === 200 ? `Moltn: delade ${docs.length} dokument som kontext.` : `Moltn: fel ${res.status}.`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class MoltnSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MoltnSyncPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Moltn Sync" });
    containerEl.createEl("p", {
      text: "Hämta färdiga anteckningar från din Moltn-install in i det här valvet. Dina filer stannar hos dig.",
    });

    new Setting(containerEl)
      .setName("Moltn install-URL")
      .setDesc("t.ex. https://din-app.fly.dev")
      .addText((t) =>
        t.setValue(this.plugin.settings.moltnUrl).onChange(async (v) => {
          this.plugin.settings.moltnUrl = v.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Valv-token")
      .setDesc("Hämtas i Moltn under Konto & säkerhet → Valv-sync.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.vaultToken).onChange(async (v) => {
          this.plugin.settings.vaultToken = v.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Målmapp")
      .setDesc("Mapp i valvet där anteckningar landar.")
      .addText((t) =>
        t.setValue(this.plugin.settings.targetFolder).onChange(async (v) => {
          this.plugin.settings.targetFolder = v.trim() || "Moltn";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Synk-intervall (minuter)")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.pollMinutes)).onChange(async (v) => {
          const n = parseInt(v, 10);
          this.plugin.settings.pollMinutes = Number.isFinite(n) && n > 0 ? n : 30;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Synka vid start")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.syncOnStartup).onChange(async (v) => {
          this.plugin.settings.syncOnStartup = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Kontext-mapp (valfritt)")
      .setDesc("Anteckningar här delas till Moltn som kontext (t.ex. prislista) via kommandot 'Dela kontext-mapp'. Lämna tomt för att inte dela något.")
      .addText((t) =>
        t.setValue(this.plugin.settings.contextFolder).onChange(async (v) => {
          this.plugin.settings.contextFolder = v.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).addButton((b) =>
      b.setButtonText("Synka nu").setCta().onClick(() => this.plugin.pull(true)),
    );
  }
}
