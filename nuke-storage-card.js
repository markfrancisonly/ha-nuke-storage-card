// nuke-storage-card.js
// Home Assistant custom card: Nuke Storage Card
// Dialog with checkboxes for which storage to clear, then reloads.
// v1.0.30

(() => {
  const DEFAULTS = {
    title: "Nuke Storage Card",
    description:
      "Choose what to clear for this origin. Actions include localStorage, sessionStorage, cookies, IndexedDB, Cache Storage, and Service Workers.",
    button_label: "Choose",
    show_details: true
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
    try {
      localStorage.clear();
      try {
        for (const k of Object.keys(localStorage)) localStorage.removeItem(k);
      } catch {}
    } catch (e) {
      log(`localStorage: error ${e}`);
    }
  };

  const clearSessionStorage = async (log) => {
    try {
      sessionStorage.clear();
      try {
        for (const k of Object.keys(sessionStorage))
          sessionStorage.removeItem(k);
      } catch {}
    } catch (e) {
      log(`sessionStorage: error ${e}`);
    }
  };

  const clearCookies = async (log) => {
    try {
      const cookies = document.cookie ? document.cookie.split(";") : [];
      const names = cookies.map((c) => c.split("=")[0].trim()).filter(Boolean);
      if (!names.length) return;

      const hostParts = location.hostname.split(".").filter(Boolean);
      const domainVariants = [];
      for (let i = 0; i < hostParts.length; i++) {
        const d = hostParts.slice(i).join(".");
        domainVariants.push(d, "." + d);
      }
      const pathVariants = (() => {
        const segs = location.pathname.split("/").filter(Boolean);
        const paths = ["/"];
        let curr = "";
        for (const s of segs) {
          curr += "/" + s;
          paths.push(curr);
        }
        return Array.from(new Set(paths));
      })();

      const expireStr = "expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0";
      const secure = location.protocol === "https:" ? "; Secure" : "";

      for (const name of names) {
        for (const path of pathVariants) {
          document.cookie = `${name}=; ${expireStr}; path=${path}${secure}`;
          for (const domain of domainVariants) {
            document.cookie = `${name}=; ${expireStr}; path=${path}; domain=${domain}${secure}`;
          }
        }
      }
    } catch (e) {
      log(`Cookies: error ${e}`);
    }
  };

  const clearIndexedDBAll = async (log) => {
    // Delete one DB name with guards; only log actual errors.
    const deleteDb = (name, timeoutMs = 4000) =>
      new Promise((resolve) => {
        let settled = false;
        let timer = setTimeout(() => {
          // Treat long blocks as "timeout" (not an error); status will reflect remaining DBs later.
          if (!settled) {
            settled = true;
            resolve("timeout");
          }
        }, timeoutMs);

        let req;
        try {
          req = indexedDB.deleteDatabase(name);
        } catch (e) {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            log?.(`IndexedDB: error deleting "${name}": ${e}`);
            resolve("error");
          }
          return;
        }

        req.onsuccess = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve("success"); // silent success
        };
        req.onerror = (ev) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          // Real error
          log?.(`IndexedDB: error deleting "${name}"`);
          resolve("error");
        };
        req.onblocked = () => {
          // If other tabs/connections hold the DB, deletion is blocked.
          // We don't log or wait forever; the timeout will resolve gently.
          // (Final status will show remaining DBs.)
        };
      });

    try {
      // Collect candidate DB names.
      let names = [];
      if (indexedDB && typeof indexedDB.databases === "function") {
        try {
          const dbs = await indexedDB.databases();
          if (Array.isArray(dbs)) {
            names = dbs
              .map((d) => d && d.name)
              .filter((n) => typeof n === "string" && n.length > 0);
          }
        } catch {
          // ignore, we'll fall back
        }
      }
      if (!names.length) {
        names = [
          "home-assistant",
          "home-assistant_v2",
          "idb-keyval",
          "localforage",
        ];
      }

      // Delete sequentially with micro-yield to avoid UI jank.
      for (const name of names) {
        await deleteDb(name);
        // Yield to event loop so HA/UI stays responsive.
        await new Promise((r) => setTimeout(r, 0));
      }
    } catch (e) {
      log?.(`IndexedDB: error ${e}`);
    }
  };

  const clearCacheStorage = async (log) => {
    try {
      if (!("caches" in window)) return;
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    } catch (e) {
      log(`Cache Storage: error ${e}`);
    }
  };

  const clearServiceWorkers = async (log) => {
    try {
      if (!navigator.serviceWorker?.getRegistrations) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    } catch (e) {
      log(`Service Workers: error ${e}`);
    }
  };

  const getStorageEstimate = async (log) => {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        log(
          `Total usage: ${formatBytes(est.usage)} (quota: ${formatBytes(
            est.quota
          )})`
        );
      }
    } catch {
      /* ignore */
    }
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
        const validDbs = dbs.filter((db) => db?.name);
        log(
          `IndexedDB: ${validDbs.length} database${
            validDbs.length === 1 ? "" : "s"
          }`
        );
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
      if (!navigator.serviceWorker?.getRegistrations) {
        log("Service Workers: no API / none registered");
        return;
      }
      const regs = await navigator.serviceWorker.getRegistrations();
      log(
        `Service Workers: ${regs.length} registration${
          regs.length === 1 ? "" : "s"
        }`
      );
    } catch (e) {
      log(`Service Workers: ${e}`);
    }
  };

  const logStorageState = async (log) => {
    await getLocalStorageState(log);
    await getSessionStorageState(log);
    await getCookiesState(log);
    await getIndexedDBState(log);
    await getCacheStorageState(log);
    await getServiceWorkersState(log);
    await getStorageEstimate(log);
  };

  // -------- Card View --------
  class NukeStorageCard extends HTMLElement {
    static getStubConfig() {
      return { ...DEFAULTS };
    }
    static getConfigElement() {
      return document.createElement("nuke-storage-card-editor");
    }

    set hass(hass) {
      this._hass = hass;
    }

    setConfig(config) {
      this._config = { ...DEFAULTS, ...(config || {}) };
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this._render();
    }

    getCardSize() {
      return 2;
    }

    async _render() {
      const c = this._config;
      const buttonTag = customElements.get("ha-button")
        ? "ha-button"
        : "button";

      // dialog
      this._dialog = document.createElement("dialog");
      const dlgDiv = document.createElement("div");
      dlgDiv.className = "dlg";
      dlgDiv.innerHTML = `
        <h2>What should we clear?</h2>
        <div class="sub">Pick the data types to remove for <strong>${
          location.origin
        }</strong>.</div>
        <div class="chk-grid">
          <label><input type="checkbox" id="opt-ls" checked> localStorage</label>
          <label><input type="checkbox" id="opt-ss" checked> sessionStorage</label>
          <label><input type="checkbox" id="opt-cookies" checked> Cookies <span class="sub">(HttpOnly cannot be removed)</span></label>
          <label><input type="checkbox" id="opt-idb" checked> IndexedDB</label>
          <label><input type="checkbox" id="opt-cache" checked> Cache Storage</label>
          <label><input type="checkbox" id="opt-sw" checked> Service Workers</label>
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
      cancelBtn.addEventListener("click", () => {
        this._dialog.close();
      });

      const okBtn = document.createElement(buttonTag);
      okBtn.id = "dlg-ok";
      if (buttonTag === "button") okBtn.className = "fallback brand";
      okBtn.textContent = "Clear";
      okBtn.setAttribute("variant", "danger");
      if (buttonTag === "ha-button") {
        okBtn.label = "Nuke";
      }

      actionsDiv.append(cancelBtn, okBtn);
      this._dialog.append(dlgDiv, actionsDiv);

      // card
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
        this._logEl.setAttribute(
          "aria-label",
          "Log of storage clearing operations"
        );
        this._logEl.textContent = "";
        wrap.appendChild(this._logEl);

        const log = (msg) => {
          this._logEl.textContent += msg + "\n";
        };
      
        // Populate initial storage state
        logStorageState(log);

        okBtn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          this._logEl.textContent = "";
          await this._runSelected(log);
        });

      } else {
        this._logEl = null;
        const log = (msg) => {
          console.info(msg + "\n");
        };
        okBtn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          await this._runSelected(log);
        });
      }

      const actions = document.createElement("div");
      actions.className = "actions";

      const btn = document.createElement(buttonTag);
      if (buttonTag === "button") btn.className = "fallback";
      btn.textContent = c.button_label;
      if (buttonTag === "ha-button") btn.label = c.button_label;
      btn.setAttribute("raised", "");
      btn.addEventListener("click", () => this._openDialog());
      actions.appendChild(btn);
      wrap.appendChild(actions);
      card.appendChild(style);
      card.appendChild(wrap);
      card.appendChild(this._dialog);

      this.shadowRoot.innerHTML = "";
      this.shadowRoot.appendChild(card);
    }

    _openDialog() {
      if (!this._dialog.open) this._dialog.showModal();
    }

    async _runSelected(log) {
      const d = this._dialog;
      const get = (id) => d.querySelector(id).checked;

      const selections = {
        ls: get("#opt-ls"),
        ss: get("#opt-ss"),
        cookies: get("#opt-cookies"),
        idb: get("#opt-idb"),
        cache: get("#opt-cache"),
        sw: get("#opt-sw"),
      };

      const chooseBtn = this.shadowRoot?.querySelector(
        ".actions ha-button, .actions button"
      );
      if (chooseBtn) {
        if (chooseBtn.tagName === "HA-BUTTON")
          chooseBtn.setAttribute("disabled", "");
        else chooseBtn.disabled = true;
      }

      const okBtn = d.querySelector("#dlg-ok");
      okBtn.disabled = true;

      try {
        if (d?.open) d.close();
      } catch {}

      log('Clearing ...');

      const toRun = [];
      if (selections.sw) toRun.push((l) => clearServiceWorkers(l));
      if (selections.cache) toRun.push((l) => clearCacheStorage(l));
      if (selections.ls) toRun.push((l) => clearLocalStorage(l));
      if (selections.ss) toRun.push((l) => clearSessionStorage(l));
      if (selections.cookies) toRun.push((l) => clearCookies(l));
      if (selections.idb) toRun.push((l) => clearIndexedDBAll(l));

      try {
        for (const op of toRun) {
          await op(log);
        }
        await logStorageState(log);
      } finally {
        d.close();
        setTimeout(() => location.reload(), 200);
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
    set hass(hass) {
      this._hass = hass;
    }

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
        };
        this._config = detail;
        this.dispatchEvent(
          new CustomEvent("config-changed", { detail: { config: detail } })
        );
      };

      // Explicitly bind events to each input
      const titleInput = root.querySelector("#title");
      const descInput = root.querySelector("#desc");
      const btnInput = root.querySelector("#btn");
      const showCheckbox = root.querySelector("#show");

      // Handle Enter key to save configuration
      const handleEnter = (e) => {
        if (e.key === "Enter") {
          emit();
          // Find the closest form or editor container and dispatch a submit event
          const form =
            e.target.closest("form") || e.target.closest("ha-dialog");
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
    description:
      "Clear selected site data (localStorage, sessionStorage, cookies, IndexedDB, caches, service workers).",
    preview: true,
  });
})();
