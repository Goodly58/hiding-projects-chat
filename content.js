// Hiding Projects Chat — declutters Claude's sidebar.
// Modes:
//   'off'           → show everything
//   'hideProjects'  → hide chats that belong to any project (default)
//   'focusProject'  → show only chats from the selected project; hide the rest
// Firefox/Chromium MV3 compatible.
//
// Claude.ai renders chats in two ways:
//   1. Sidebar rows:  <div data-row-key="chat:{uuid}"> (buttons, no links)
//   2. List pages:    <a href="/chat/{uuid}"> inside <tr> (Recents, Project pages)

(() => {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;
  const STORAGE_KEYS = ['mode', 'focusProjectId', 'hideProjectChats'];
  const REFRESH_MS = 60_000;
  const CHAT_ROW_SELECTOR = '[data-row-key^="chat:"]';
  const COWORK_ROW_SELECTOR = '[data-row-key^="cowork:"]';
  const CHAT_LINK_SELECTOR = 'a[href^="/chat/"]';
  const HIDDEN_ATTR = 'data-cp-hidden';
  const INJECTED_ATTR = 'data-cp-injected';
  // Claude's sidebar only renders a handful of recents, so focus mode has to
  // add the project's own chats — hiding alone just empties the sidebar.
  const MAX_INJECTED = 25;

  class ProjectChatDeclutter {
    constructor() {
      this.chats = new Map(); // chatUuid → { project, name, updatedAt }
      this.orgId = null;
      this.settings = { mode: 'hideProjects', focusProjectId: null };
      this.sweepQueued = false;
      this.queueSweep = this.queueSweep.bind(this);
    }

    async start() {
      this.settings = await this.readSettings();
      this.listenForSettingChanges();

      await this.resolveOrgId();
      await this.reloadChats();

      this.watchSidebar();
      this.sweep();

      setInterval(() => this.reloadChats().then(this.queueSweep), REFRESH_MS);
    }

    readSettings() {
      return new Promise(resolve => {
        const done = (r) => {
          r = r || {};
          // Back-compat: older versions used { hideProjectChats: bool }.
          let mode = r.mode;
          if (!mode) {
            mode = (r.hideProjectChats === false) ? 'off' : 'hideProjects';
          }
          resolve({
            mode,
            focusProjectId: r.focusProjectId || null,
          });
        };
        const res = api.storage.sync.get(STORAGE_KEYS);
        if (res?.then) res.then(done);
        else api.storage.sync.get(STORAGE_KEYS, done);
      });
    }

    listenForSettingChanges() {
      api.storage?.onChanged?.addListener(async () => {
        this.settings = await this.readSettings();
        this.sweep();
      });
    }

    async resolveOrgId() {
      const fromUrl = location.href.match(/organizations?\/([a-f0-9-]+)/i);
      if (fromUrl) { this.orgId = fromUrl[1]; return; }
      try {
        const r = await fetch('/api/organizations', { credentials: 'include' });
        const orgs = await r.json();
        if (!Array.isArray(orgs)) { this.orgId = null; return; }
        const chatOrg = orgs.find(o => o?.capabilities?.includes?.('chat'));
        this.orgId = (chatOrg || orgs[0])?.uuid ?? null;
      } catch {
        this.orgId = null;
      }
    }

    async fetchChats(starred) {
      const url = `/api/organizations/${this.orgId}`
                + `/chat_conversations?limit=2000&starred=${starred}`;
      const r = await fetch(url, { credentials: 'include' });
      const list = await r.json();
      return Array.isArray(list) ? list : [];
    }

    async reloadChats() {
      if (!this.orgId) await this.resolveOrgId();
      if (!this.orgId) return;
      try {
        const [unstarred, starred] = await Promise.all([
          this.fetchChats(false),
          this.fetchChats(true),
        ]);
        const next = new Map();
        for (const c of [...unstarred, ...starred]) {
          if (!c?.uuid) continue;
          next.set(c.uuid, {
            project: c.project_uuid || null,
            name: c.name || 'Untitled',
            updatedAt: c.updated_at || c.created_at || '',
          });
        }
        this.chats = next;
      } catch { /* transient */ }
    }

    watchSidebar() {
      if (!document.body) return;
      new MutationObserver(this.queueSweep)
        .observe(document.body, { childList: true, subtree: true });
    }

    queueSweep() {
      if (this.sweepQueued) return;
      this.sweepQueued = true;
      requestAnimationFrame(() => {
        this.sweepQueued = false;
        this.sweep();
      });
    }

    shouldHide(chatUuid) {
      const { mode, focusProjectId } = this.settings;
      const projectId = this.chats.get(chatUuid)?.project ?? null;
      if (mode === 'hideProjects') return projectId !== null;
      if (mode === 'focusProject' && focusProjectId) {
        return projectId !== focusProjectId;
      }
      return false;
    }

    applyVisibility(row, hide) {
      const isHidden = row.hasAttribute(HIDDEN_ATTR);
      if (hide && !isHidden) {
        row.setAttribute(HIDDEN_ATTR, '');
        row.style.display = 'none';
      } else if (!hide && isHidden) {
        row.removeAttribute(HIDDEN_ATTR);
        row.style.display = '';
      }
    }

    // Sidebar rows Claude never rendered. Cloning a real row inherits its
    // styling, and the clone's <a href> navigates on its own — React's
    // handlers don't survive cloneNode, but a plain link doesn't need them.
    buildRow(template, uuid, name) {
      const row = template.cloneNode(true);
      row.setAttribute('data-row-key', `chat:${uuid}`);
      row.setAttribute(INJECTED_ATTR, '');
      row.removeAttribute(HIDDEN_ATTR);
      row.style.display = '';

      const link = row.querySelector('a');
      if (link) {
        link.setAttribute('href', `/chat/${uuid}`);
        // Row menus ("...") are React-driven and dead on a clone — drop them.
        for (const b of row.querySelectorAll('button')) b.remove();
      }

      // Replace the template's title text, wherever it sits in the subtree.
      const scope = link || row;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let first = null, node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue.trim()) continue;
        if (first) node.nodeValue = '';
        else { node.nodeValue = name; first = node; }
      }
      if (!first) scope.textContent = name;

      return row;
    }

    injectFocusRows() {
      const { mode, focusProjectId } = this.settings;
      const injected = document.querySelectorAll(`[${INJECTED_ATTR}]`);

      if (mode !== 'focusProject' || !focusProjectId) {
        for (const el of injected) el.remove();
        return;
      }

      // Claude's own rows. If one is already there, don't duplicate it.
      const real = [...document.querySelectorAll(CHAT_ROW_SELECTOR)]
        .filter(el => !el.hasAttribute(INJECTED_ATTR));
      const template = real[0];
      if (!template) return; // sidebar not rendered yet

      const realIds = new Set(
        real.map(el => el.getAttribute('data-row-key').slice('chat:'.length))
      );

      const wanted = [...this.chats.entries()]
        .filter(([uuid, meta]) => meta.project === focusProjectId && !realIds.has(uuid))
        .sort((a, b) => String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)))
        .slice(0, MAX_INJECTED);
      const wantedIds = new Set(wanted.map(([uuid]) => uuid));

      const alreadyInjected = new Set();
      for (const el of injected) {
        const uuid = el.getAttribute('data-row-key').slice('chat:'.length);
        if (wantedIds.has(uuid)) alreadyInjected.add(uuid);
        else el.remove(); // stale: renamed, moved project, or now rendered by Claude
      }

      const anchor = real[real.length - 1];
      const container = anchor.parentElement;
      if (!container) return;

      let after = anchor;
      for (const [uuid, meta] of wanted) {
        if (alreadyInjected.has(uuid)) continue;
        const row = this.buildRow(template, uuid, meta.name);
        after.insertAdjacentElement('afterend', row);
        after = row;
      }
    }

    sweep() {
      // A Project page's own chat list must remain fully visible; the global
      // sidebar rows are still filtered there. Project pages live at
      // /project/{id} and /cowork/project/{id}.
      const onProjectPage = location.pathname.includes('/project/');

      // 1. Sidebar rows: data-row-key="chat:{uuid}" (sidebar only).
      for (const row of document.querySelectorAll(CHAT_ROW_SELECTOR)) {
        const id = row.getAttribute('data-row-key').slice('chat:'.length);
        this.applyVisibility(row, this.shouldHide(id));
      }

      // 2. Cowork sessions belong to no project, so focus mode hides them too.
      // They dominate the sidebar, and leaving them would drown the project's
      // own chats. Other modes leave them alone.
      const focusing = this.settings.mode === 'focusProject'
                    && !!this.settings.focusProjectId;
      for (const row of document.querySelectorAll(COWORK_ROW_SELECTOR)) {
        this.applyVisibility(row, focusing);
      }

      // 3. Link-based lists: Recents page tables (and any legacy markup).
      for (const link of document.querySelectorAll(CHAT_LINK_SELECTOR)) {
        const row = link.closest('tr, li');
        if (!row) continue;
        const id = link.getAttribute('href').slice('/chat/'.length);
        this.applyVisibility(row, !onProjectPage && this.shouldHide(id));
      }

      this.injectFocusRows();
    }
  }

  const go = () => new ProjectChatDeclutter().start();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', go, { once: true });
  } else {
    go();
  }
})();
