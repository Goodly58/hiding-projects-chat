// Hiding Projects Chat — declutters Claude's sidebar.
// Modes:
//   'off'           → show everything
//   'hideProjects'  → hide chats that belong to any project (default)
//   'focusProject'  → show only chats from the selected project; hide the rest
// Firefox/Chromium MV3 compatible.

(() => {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;
  const STORAGE_KEYS = ['mode', 'focusProjectId', 'hideProjectChats'];
  const REFRESH_MS = 30_000;
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
        this.orgId = Array.isArray(orgs) ? orgs[0]?.uuid ?? null : null;
      } catch {
        this.orgId = null;
      }
    }

    async reloadChats() {
      if (!this.orgId) await this.resolveOrgId();
      if (!this.orgId) return;
      try {
        const url = `/api/organizations/${this.orgId}`
                  + `/chat_conversations?limit=100&starred=false`;
        const r = await fetch(url, { credentials: 'include' });
        const list = await r.json();
        if (!Array.isArray(list)) return;
        const next = new Map();
        for (const c of list) {
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

    sweep() {
      // Don't touch DOM when viewing a Project page — its own chat list must
      // remain fully visible.
      const onProjectPage = location.pathname.startsWith('/project/');
      const { mode, focusProjectId } = this.settings;

      const links = document.querySelectorAll(CHAT_LINK_SELECTOR);
      for (const link of links) {
        const id = link.getAttribute('href').slice('/chat/'.length);
        const row = link.closest('li');
        if (!row) continue;

        const projectId = this.chatToProject.get(id) ?? null;
        let shouldHide = false;

        if (!onProjectPage) {
          if (mode === 'hideProjects') {
            shouldHide = projectId !== null;
          } else if (mode === 'focusProject' && focusProjectId) {
            shouldHide = projectId !== focusProjectId;
          }
        }

        const isHidden = row.hasAttribute(HIDDEN_ATTR);
        if (shouldHide && !isHidden) {
          row.setAttribute(HIDDEN_ATTR, '');
          row.style.display = 'none';
        } else if (!shouldHide && isHidden) {
          row.removeAttribute(HIDDEN_ATTR);
          row.style.display = '';
        }
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
