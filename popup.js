(() => {
  'use strict';
  const api = (typeof browser !== 'undefined') ? browser : chrome;
  const KEYS = ['mode', 'focusProjectId', 'hideProjectChats'];

  const modeEl = document.getElementById('mode');
  const projectRow = document.getElementById('projectRow');
  const projectEl = document.getElementById('project');
  const statusEl = document.getElementById('status');
  const hintEl = document.getElementById('hint');

  const HINTS = {
    off: 'All chats are shown. The extension is paused.',
    hideProjects: 'Chats that belong to a Project are hidden from the main sidebar. They remain accessible from inside each Project.',
    focusProject: 'Only chats from the selected Project appear in the sidebar. Everything else is hidden.',
  };

  const getStorage = (keys) => new Promise(resolve => {
    const res = api.storage.sync.get(keys);
    if (res?.then) res.then(resolve);
    else api.storage.sync.get(keys, resolve);
  });

  const setStorage = (obj) => {
    const res = api.storage.sync.set(obj);
    return res?.then ? res : Promise.resolve();
  };

  async function fetchOrgId() {
    const m = location.href.match(/organizations?\/([a-f0-9-]+)/i);
    if (m) return m[1];
    const r = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
    const orgs = await r.json();
    if (!Array.isArray(orgs)) return null;
    const chatOrg = orgs.find(o => o?.capabilities?.includes?.('chat'));
    return (chatOrg || orgs[0])?.uuid ?? null;
  }

  async function fetchProjects() {
    const orgId = await fetchOrgId();
    if (!orgId) return [];
    const r = await fetch(
      `https://claude.ai/api/organizations/${orgId}/projects`,
      { credentials: 'include' }
    );
    if (!r.ok) return [];
    const list = await r.json();
    if (!Array.isArray(list)) return [];
    return list
      .filter(p => p && p.uuid && !p.is_archived)
      .map(p => ({ uuid: p.uuid, name: p.name || '(untitled)' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderProjects(projects, selected) {
    projectEl.innerHTML = '';
    if (!projects.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No projects found';
      projectEl.appendChild(opt);
      projectEl.disabled = true;
      statusEl.textContent = 'Open claude.ai and make sure you are signed in.';
      return;
    }
    projectEl.disabled = false;
    statusEl.textContent = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a project…';
    projectEl.appendChild(placeholder);
    for (const p of projects) {
      const opt = document.createElement('option');
      opt.value = p.uuid;
      opt.textContent = p.name;
      if (p.uuid === selected) opt.selected = true;
      projectEl.appendChild(opt);
    }
    if (!selected) placeholder.selected = true;
  }

  function applyModeUI(mode) {
    hintEl.textContent = HINTS[mode] || '';
    if (mode === 'focusProject') {
      projectRow.classList.remove('hidden');
    } else {
      projectRow.classList.add('hidden');
    }
  }

  async function init() {
    const stored = await getStorage(KEYS);
    // Back-compat migration from older boolean setting.
    let mode = stored.mode;
    if (!mode) mode = (stored.hideProjectChats === false) ? 'off' : 'hideProjects';
    modeEl.value = mode;
    applyModeUI(mode);

    modeEl.addEventListener('change', async () => {
      const newMode = modeEl.value;
      applyModeUI(newMode);
      await setStorage({ mode: newMode });
      if (newMode === 'focusProject' && projectEl.options.length <= 1) {
        loadProjects(stored.focusProjectId);
      }
    });

    projectEl.addEventListener('change', async () => {
      await setStorage({ focusProjectId: projectEl.value || null });
    });

    if (mode === 'focusProject') {
      loadProjects(stored.focusProjectId);
    }
  }

  async function loadProjects(selected) {
    statusEl.textContent = 'Loading projects…';
    try {
      const projects = await fetchProjects();
      renderProjects(projects, selected);
    } catch (e) {
      statusEl.textContent = 'Could not load projects. Open claude.ai and try again.';
      console.error('[Hiding Projects Chat]', e);
    }
  }

  init();
})();
