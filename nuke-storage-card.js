// nuke-storage-card.js
// Home Assistant custom card: Nuke Storage Card
// Dialog with checkboxes for which storage to clear, then (optionally) reload.
// Uses ha-button with minimal styling to match default Home Assistant appearance.
// Initial log shows current storage state with counts and sizes.
// Editor saves config on Enter key or Save button.
// Dialog Cancel button uses appearance="plain", Okay button renamed to "Nuke" with appearance="brand".
// v1.0.14

(() => {
  const DEFAULTS = {
    title: "Nuke Storage Card",
    description: "Choose what to clear for this origin. Actions include localStorage, sessionStorage, cookies, IndexedDB, Cache Storage, and Service Workers.",
    button_label: "Choose",
    show_details: true,
    default_reload_after: true
  };

  // -------- Utilities --------
  const formatBytes = (n) => {
    if (n === undefined || n === null) return "n/a";
    const k = 1024;
    const u = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(Math.max(1, n)) / Math.log(k));
    return `${(n / Math.pow(k, i)).toFixed(2)} ${u[i]}`;
  };

  const clearLocalStorage = async (log) => {
    try { localStorage.clear(); log("localStorage: cleared"); }
    catch (e) { log(`localStorage: ${e}`); }
  };

  const clearSessionStorage = async (log) => {
    try { sessionStorage.clear(); log("sessionStorage: cleared"); }
    catch (e) { log(`sessionStorage: ${e}`); }
  };

  const clearCookies = async (log) => {
    try {
      const cookies = document.cookie ? document.cookie.split(";") : [];
      const names = cookies.map((c) => c.split("=")[0].trim()).filter(Boolean);
      if (!names.length) { log("cookies: none visible"); return; }

      const hostParts = location.hostname.split(".").filter(Boolean);
      const domainVariants = [];
      for (let i = 0; i < hostParts.length; i++) {
        const d = hostParts.slice(i).join(".");
        domainVariants.push(d);
        domainVariants.push("." + d);
      }
      const pathVariants = (() => {
        const segs = location.pathname.split("/").filter(Boolean);
        const paths = ["/"];
        let curr = "";
        for (const s of segs) { curr += "/" + s; paths.push(curr); }
        return Array.from(new Set(paths));
      })();

      const expireStr = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
      let attempts = 0;
      for (const name of names) {
        for (const path of pathVariants) {
          document.cookie = `${name}=; ${expireStr}; path=${path}`; attempts++;
          for (const domain of domainVariants) {
            document.cookie = `${name}=; ${expireStr}; path=${path}; domain=${domain}`; attempts++;
          }
        }
      }
      log(`cookies: attempted to expire ${names.length} cookie(s) across ${attempts} combos (HttpOnly not removable client-side)`);
    } catch (e) {
      log(`cookies: ${e}`);
    }
  };

  const clearIndexedDBAll = async (log) => {
    try {
      const deleted = [];
      if (indexedDB && "databases" in indexedDB && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (!db?.name) continue;
          await new Promise((res) => {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = req.onerror = req.onblocked = () => res();
          });
          deleted.push(db.name);
        }
      } else {
        const guesses = ["home-assistant", "home-assistant_v2", "idb-keyval", "localforage"];
        for (const name of guesses) {
          await new Promise((res) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = req.onerror = req.onblocked = () => res();
          });
          deleted.push(name + " (guessed)");
        }
      }
      log(`IndexedDB: requested delete for ${deleted.length} DB(s)${deleted.length ? `: ${deleted.join(", ")}` : ""}`);
    } catch (e) {
      log(`IndexedDB: ${e}`);
    }
  };

  const clearCacheStorage = async (log) => {
    try {
      if (!("caches" in window)) { log("Cache Storage: not supported"); return; }
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      log(`Cache Storage: deleted ${keys.length} cache(s)`);
    } catch (e) {
      log(`Cache Storage: ${e}`);
    }
  };

  const clearServiceWorkers = async (log) => {
    try {
      if (!(navigator.serviceWorker?.getRegistrations)) { log("Service Workers: no API / none registered"); return; }
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      log(`Service Workers: unregistered ${regs.length} registration(s)`);
    } catch (e) {
      log(`Service Workers: ${e}`);
    }
  };

  const logStorageEstimate = async (log) => {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        log(`Total usage: ${formatBytes(est.usage)} (quota: ${formatBytes(est.quota)})`);
      }
    } catch {/* ignore */}
  };

  // Non-destructive functions to get storage state
  const getLocalStorageState = async (log) => {
    try {
      const count = Object.keys(localStorage).length;
      log(`localStorage: ${count} item${count === 1 ? "" : "s"}`);
    } catch (e) {
      log(`localStorage: ${e}`);
    }
  };

  const getSessionStorageState = async (log) => {
    try {
      const count = Object.keys(sessionStorage).length;
      log(`sessionStorage: ${count} item${count === 1 ? "" : "s"}`);
    } catch (e) {
      log(`sessionStorage: ${e}`);
    }
  };

  const getCookiesState = async (log) => {
    try {
      const cookies = document.cookie ? document.cookie.split(";") : [];
      const names = cookies.map((c) => c.split("=")[0].trim()).filter(Boolean);
      log(`Cookies: ${names.length} visible`);
    } catch (e) {
      log(`Cookies: ${e}`);
    }
  };

  const getIndexedDBState = async (log) => {
    try {
      if (indexedDB && "databases" in indexedDB && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        const validDbs = dbs.filter(db => db?.name);
        log(`IndexedDB: ${validDbs.length} database${validDbs.length === 1 ? "" : "s"}`);
      } else {
        log(`IndexedDB: enumeration not supported`);
      }
    } catch (e) {
      log(`IndexedDB: ${e}`);
    }
  };

  const getCacheStorageState = async (log) => {
    try {
      if (!("caches" in window)) {
        log("Cache Storage: not supported");
        return;
      }
      const keys = await caches.keys();
      log(`Cache Storage: ${keys.length} cache${keys.length === 1 ? "" : "s"}`);
    } catch (e) {
      log(`Cache Storage: ${e}`);
    }
  };

  const getServiceWorkersState = async (log) => {
    try {
      if (!(navigator.serviceWorker?.getRegistrations)) {
        log("Service Workers: no API / none registered");
        return;
      }
      const regs = await navigator.serviceWorker.getRegistrations();
      log(`Service Workers: ${regs.length} registration${regs.length === 1 ? "" : "s"}`);
    } catch (e) {
      log(`Service Workers: ${e}`);
    }
  };

  // -------- Card View --------
  class NukeStorageCard extends HTMLElement {
    static getStubConfig() { return { ...DEFAULTS }; }
    static getConfigElement() { return document.createElement("nuke-storage-card-editor"); }

    set hass(hass) { this._hass = hass; }

    setConfig(config) {
      this._config = { ...DEFAULTS, ...(config || {}) };
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this._render();
    }

    getCardSize() { return 2; }

    async _render() {
      const c = this._config;
      const card = document.createElement("ha-card");
      card.header = c.title;

      const style = document.createElement("style");
      style.textContent = `
        /* Minimize ha-card overrides to respect default :host styles */
        ha-card {
          padding: 0;
        }
        .wrap { padding: 16px; display: grid; gap: 12px; }
        p { margin: 0; opacity: .9; }
        .actions { display: flex; gap: 8px; align-items: center; }
        /* Minimal ha-button styling to align with Home Assistant defaults */
        ha-button, button.fallback {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        ha-button[appearance="brand"], button.brand {
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #ffffff);
          border-radius: 4px;
          font-weight: 500;
        }
        ha-button[appearance="plain"], button.plain {
          background: none;
          color: var(--secondary-text-color, #808080);
          border: none;
        }
        ha-button[raised], button.fallback[raised] {
          box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0,0,0,0.2));
        }
        ha-button[disabled], button.fallback[disabled] {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .log {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12px;
          background: var(--card-background-color, #ffffff);
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 10px;
          padding: 8px;
          max-height: 180px;
          overflow: auto;
          white-space: pre-wrap;
        }
        dialog {
          border: none;
          border-radius: 12px;
          padding: 0;
          max-width: 520px;
          width: 92vw;
          color: var(--primary-text-color, #000000);
          background: var(--card-background-color, #ffffff);
          box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,.2));
        }
        .dlg {
          padding: 16px;
          display: grid;
          gap: 12px;
        }
        .chk-grid { display: grid; gap: 8px; }
        .dlg-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 0 16px 16px 16px;
        }
        .dlg h3 { margin: 0 0 4px 0; font-size: 1.1rem; }
        .sub { opacity: .8; font-size: .9rem; }
        label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        input[type="checkbox"] { transform: scale(1.15); }
      `;

      const wrap = document.createElement("div");
      wrap.className = "wrap";

      const desc = document.createElement("p");
      desc.textContent = c.description;
      wrap.appendChild(desc);

      if (c.show_details) {
        this._logEl = document.createElement("div");
        this._logEl.className = "log";
        this._logEl.setAttribute("aria-live", "polite");
        this._logEl.setAttribute("aria-label", "Log of storage clearing operations");
        this._logEl.textContent = "";
        wrap.appendChild(this._logEl);

        // Populate initial storage state
        const log = (msg) => {
          if (!this._logEl) return;
          this._logEl.textContent += msg + "\n";
        };
        await getLocalStorageState(log);
        await getSessionStorageState(log);
        await getCookiesState(log);
        await getIndexedDBState(log);
        await getCacheStorageState(log);
        await getServiceWorkersState(log);
        await logStorageEstimate(log);
      } else {
        this._logEl = null;
      }

      const actions = document.createElement("div");
      actions.className = "actions";

      const buttonTag = customElements.get("ha-button") ? "ha-button" : "button";
      const btn = document.createElement(buttonTag);
      if (buttonTag === "button") btn.className = "fallback";
      btn.textContent = c.button_label;
      if (buttonTag === "ha-button") btn.label = c.button_label;
      btn.setAttribute("raised", "");
      btn.addEventListener("click", () => this._openDialog());
      actions.appendChild(btn);
      wrap.appendChild(actions);

      // dialog
      this._dialog = document.createElement("dialog");
      const dlgDiv = document.createElement("div");
      dlgDiv.className = "dlg";
      dlgDiv.innerHTML = `
        <h3>What should we clear?</h3>
        <div class="sub">Pick the data types to remove for <strong>${location.origin}</strong>.</div>
        <div class="chk-grid">
          <label><input type="checkbox" id="opt-ls" checked> localStorage</label>
          <label><input type="checkbox" id="opt-ss" checked> sessionStorage</label>
          <label><input type="checkbox" id="opt-cookies" checked> Cookies <span class="sub">(HttpOnly cannot be removed)</span></label>
          <label><input type="checkbox" id="opt-idb" checked> IndexedDB</label>
          <label><input type="checkbox" id="opt-cache" checked> Cache Storage</label>
          <label><input type="checkbox" id="opt-sw" checked> Service Workers</label>
          <label><input type="checkbox" id="opt-reload" ${c.default_reload_after ? "checked" : ""}> Reload after</label>
        </div>
      `;

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "dlg-actions";

      const cancelBtn = document.createElement(buttonTag);
      cancelBtn.id = "dlg-cancel";
      if (buttonTag === "button") cancelBtn.className = "fallback plain";
      cancelBtn.textContent = "Cancel";
      if (buttonTag === "ha-button") {
        cancelBtn.label = "Cancel";
        cancelBtn.setAttribute("appearance", "plain");
      }
      cancelBtn.addEventListener("click", () => { this._dialog.close(); });

      const okBtn = document.createElement(buttonTag);
      okBtn.id = "dlg-ok";
      if (buttonTag === "button") okBtn.className = "fallback brand";
      okBtn.textContent = "Clear";
      if (buttonTag === "ha-button") {
        okBtn.label = "Nuke";
      }
      okBtn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await this._runSelected();
      });

      actionsDiv.append(cancelBtn, okBtn);
      this._dialog.append(dlgDiv, actionsDiv);

      card.appendChild(style);
      card.appendChild(wrap);
      card.appendChild(this._dialog);

      this.shadowRoot.innerHTML = "";
      this.shadowRoot.appendChild(card);
    }

    _openDialog() {
      if (!this._dialog.open) this._dialog.showModal();
    }

    async _runSelected() {
      const d = this._dialog;
      const get = (id) => d.querySelector(id).checked;

      const toRun = [];
      const log = (msg) => {
        if (!this._logEl) return;
        this._logEl.textContent += (this._logEl.textContent ? "\n" : "") + msg;
      };

      await logStorageEstimate(log);

      if (get("#opt-ls")) toRun.push((l) => clearLocalStorage(l));
      if (get("#opt-ss")) toRun.push((l) => clearSessionStorage(l));
      if (get("#opt-cookies")) toRun.push((l) => clearCookies(l));
      if (get("#opt-idb")) toRun.push((l) => clearIndexedDBAll(l));
      if (get("#opt-cache")) toRun.push((l) => clearCacheStorage(l));
      if (get("#opt-sw")) toRun.push((l) => clearServiceWorkers(l));

      const okBtn = d.querySelector("#dlg-ok");
      okBtn.disabled = true;

      try {
        for (const op of toRun) {
          await op(log);
        }
        await logStorageEstimate(log);
      } finally {
        okBtn.disabled = false;
        const reload = get("#opt-reload");
        d.close();
        if (reload) setTimeout(() => location.reload(), 200);
      }
    }
  }



  // -------- Card Editor (Designer) --------
  class NukeStorageCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = { ...DEFAULTS, ...(config || {}) };
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this._render();
    }
    set hass(hass) { this._hass = hass; }

    _render() {
      const c = this._config;
      const style = document.createElement("style");
      style.textContent = `
        .ed { display:grid; gap:12px; padding: 12px; }
        .row { display:grid; gap:6px; }
        label { font-weight: 600; }
        input[type="text"] { padding:8px; border-radius:8px; border:1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
        .chk { display:flex; align-items:center; gap:8px; }
      `;

      const root = document.createElement("div");
      root.className = "ed";
      root.innerHTML = `
        <div class="row">
          <label for="title">Title</label>
          <input type="text" id="title" value="${c.title}">
        </div>
        <div class="row">
          <label for="desc">Description</label>
          <input type="text" id="desc" value="${c.description}">
        </div>
        <div class="row">
          <label for="btn">Button label</label>
          <input type="text" id="btn" value="${c.button_label}">
        </div>
        <div class="chk">
          <input type="checkbox" id="show" ${c.show_details ? "checked" : ""}>
          <label for="show">Show log details</label>
        </div>
        <div class="chk">
          <input type="checkbox" id="ra" ${c.default_reload_after ? "checked" : ""}>
          <label for="ra">Default: Reload after</label>
        </div>
      `;

      const emit = () => {
        const titleInput = root.querySelector("#title").value.trim();
        const descInput = root.querySelector("#desc").value.trim();
        const btnInput = root.querySelector("#btn").value.trim();
        const detail = {
          ...this._config,
          title: titleInput || DEFAULTS.title,
          description: descInput || DEFAULTS.description,
          button_label: btnInput || DEFAULTS.button_label,
          show_details: root.querySelector("#show").checked,
          default_reload_after: root.querySelector("#ra").checked,
        };
        this._config = detail;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: detail } }));
      };

      // Explicitly bind events to each input
      const titleInput = root.querySelector("#title");
      const descInput = root.querySelector("#desc");
      const btnInput = root.querySelector("#btn");
      const showCheckbox = root.querySelector("#show");
      const raCheckbox = root.querySelector("#ra");

      // Handle Enter key to save configuration
      const handleEnter = (e) => {
        if (e.key === "Enter") {
          emit();
          // Find the closest form or editor container and dispatch a submit event
          const form = e.target.closest("form") || e.target.closest("ha-dialog");
          if (form) {
            form.dispatchEvent(new Event("submit", { cancelable: true }));
          }
        }
      };

      titleInput.addEventListener("change", emit);
      titleInput.addEventListener("blur", emit);
      titleInput.addEventListener("keydown", handleEnter);

      descInput.addEventListener("change", emit);
      descInput.addEventListener("blur", emit);
      descInput.addEventListener("keydown", handleEnter);

      btnInput.addEventListener("change", emit);
      btnInput.addEventListener("blur", emit);
      btnInput.addEventListener("keydown", handleEnter);

      showCheckbox.addEventListener("change", emit);
      raCheckbox.addEventListener("change", emit);

      this.shadowRoot.innerHTML = "";
      this.shadowRoot.append(style, root);
    }
  }

  if (!customElements.get("nuke-storage-card")) {
    customElements.define("nuke-storage-card", NukeStorageCard);
  }
  if (!customElements.get("nuke-storage-card-editor")) {
    customElements.define("nuke-storage-card-editor", NukeStorageCardEditor);
  }

  // -------- Card Picker Metadata --------
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "nuke-storage-card",
    name: "Nuke Storage Card",
    description: "Clear selected site data (localStorage, sessionStorage, cookies, IndexedDB, caches, service workers).",
    preview: true
  });
})();