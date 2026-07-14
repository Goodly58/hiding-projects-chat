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
  const CHAT_LINK_SELECTOR = 'a[href^="/chat/"]';
  const HIDDEN_ATTR = 'data-cp-hidden';

  class ProjectChatDeclutter {
    constructor() {
      this.chatToProject = new Map(); // chatUuid → projectUuid | null
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
          if (c?.uuid) next.set(c.uuid, c.project_uuid || null);
        }
        this.chatToProject = next;
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
      const projectId = this.chatToProject.get(chatUuid) ?? null;
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

      // 2. Link-based lists: Recents page tables (and any legacy markup).
      for (const link of document.querySelectorAll(CHAT_LINK_SELECTOR)) {
        const row = link.closest('tr, li');
        if (!row) continue;
        const id = link.getAttribute('href').slice('/chat/'.length);
        this.applyVisibility(row, !onProjectPage && this.shouldHide(id));
      }
    }
  }

  const go = () => new ProjectChatDeclutter().start();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', go, { once: true });
  } else {
    go();
  }
})();
