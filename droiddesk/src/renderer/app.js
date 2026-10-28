'use strict';
/* global I18N */
(function () {
  const t = (k, v) => I18N.t(k, v);
  const api = window.droid;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    info: null,
    settings: null,
    meta: { devices: [], countries: [], versions: {} },
    sdk: null,
    groups: [],
    proxies: [],
    profiles: [],
    browsers: [],
    detectedBrowsers: [],
    selected: new Set(),
    bselected: new Set(),
    bfilterGroup: 'all',
    bfilterText: '',
    filterGroup: 'all',
    filterText: '',
    viewMode: 'grid',
    view: 'profiles',
    logsOpenFor: null,
    installing: false,
    installLog: [],
    update: { state: 'idle', version: null, percent: 0, error: '' },
  };

  // ------------------------------------------------------------ helpers
  async function call(promise, { silent } = {}) {
    const res = await promise;
    if (!res.ok) {
      if (!silent) toast(errMsg(res.error), 'err');
      throw new Error(res.error);
    }
    return res.data;
  }
  function errMsg(code) {
    if (!code) return t('err_UNKNOWN');
    const key = `err_${String(code).replace(/^.*?(E[A-Z]+).*$/, '$1')}`;
    const direct = `err_${code}`;
    if (t(direct) !== direct) return t(direct);
    if (t(key) !== key) return t(key);
    return code;
  }
  function toast(msg, kind = 'info', ms = 4200) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
  }
  function country(code) { return state.meta.countries.find((c) => c.code === code) || { code, name: code, flag: '', locale: 'en-US', timezone: 'UTC' }; }
  function flag(code) { return `<span class="fi fi-${esc(String(code).toLowerCase())}" title="${esc(country(code).name)}"></span>`; }
  function groupName(id) { const g = state.groups.find((x) => x.id === id); return g ? g.name : t('ungrouped'); }
  function proxyOf(p) {
    if (p.proxyMode === 'saved') return state.proxies.find((x) => x.id === p.proxyId) || null;
    if (p.proxyMode === 'inline') return p.proxy;
    return null;
  }
  function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleString(I18N.getLang()); }
  function fmtBytes(n) { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return `${n.toFixed(i ? 1 : 0)} ${u[i]}`; }
  const ICON = {
    phone: '<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    android: '<svg viewBox="0 0 24 24"><path d="M17.6 9.5H6.4v8.1c0 .6.5 1.1 1.1 1.1H9v3.2c0 .6.5 1.1 1.1 1.1s1.1-.5 1.1-1.1v-3.2h1.6v3.2c0 .6.5 1.1 1.1 1.1s1.1-.5 1.1-1.1v-3.2h1.5c.6 0 1.1-.5 1.1-1.1V9.5zM4.3 9.5c-.6 0-1.1.5-1.1 1.1v5.2c0 .6.5 1.1 1.1 1.1s1.1-.5 1.1-1.1v-5.2c0-.6-.5-1.1-1.1-1.1zm15.4 0c-.6 0-1.1.5-1.1 1.1v5.2c0 .6.5 1.1 1.1 1.1s1.1-.5 1.1-1.1v-5.2c0-.6-.5-1.1-1.1-1.1zM15.5 3.8l1-1.6c.1-.1 0-.3-.1-.3-.1-.1-.3 0-.3.1l-1 1.6c-.9-.4-1.9-.6-3.1-.6s-2.2.2-3.1.6l-1-1.6c-.1-.1-.2-.2-.3-.1-.1.1-.2.2-.1.3l1 1.6C6.6 4.7 5.4 6.5 5.4 8.6h13.2c0-2.1-1.2-3.9-3.1-4.8zM9.3 6.6c-.4 0-.7-.3-.7-.7s.3-.7.7-.7.7.3.7.7-.3.7-.7.7zm5.4 0c-.4 0-.7-.3-.7-.7s.3-.7.7-.7.7.3.7.7-.3.7-.7.7z"/></svg>',
    net: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
    list: '<svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    tag: '<svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    play: '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    dots: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    log: '<svg viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    snow: '<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/><line x1="19.1" y1="4.9" x2="4.9" y2="19.1"/></svg>',
  };

  // ------------------------------------------------------------ i18n apply
  function applyI18n() {
    $$('[data-i18n]').forEach((el) => { const k = el.dataset.i18n; if (t(k) !== k) el.textContent = t(k); });
    $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    $$('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.documentElement.lang = I18N.getLang();
  }

  // ------------------------------------------------------------ loading
  async function loadAll() {
    const [info, settings, meta, sdk, groups, proxies, profiles, browsers, detectedBrowsers] = await Promise.all([
      call(api.app.info()), call(api.settings.get()), call(api.meta.all()), call(api.sdk.status()),
      call(api.groups.list()), call(api.proxies.list()), call(api.profiles.list()), call(api.browsers.list()), call(api.browsers.detect()),
    ]);
    Object.assign(state, { info, settings, meta, sdk, groups, proxies, profiles, browsers, detectedBrowsers });
    I18N.setLang(settings.language || 'pt-BR');
    state.viewMode = settings.viewMode === 'list' ? 'list' : 'grid';
    applyI18n();
    renderAll();
  }
  async function reloadProfiles() { state.profiles = await call(api.profiles.list()); for (const id of [...state.selected]) if (!state.profiles.some((p) => p.id === id)) state.selected.delete(id); renderProfiles(); }
  async function reloadBrowsers() { state.browsers = await call(api.browsers.list()); for (const id of [...state.bselected]) if (!state.browsers.some((p) => p.id === id)) state.bselected.delete(id); renderBrowsers(); }
  async function reloadProxies() { state.proxies = await call(api.proxies.list()); renderProxies(); renderCounts(); }
  async function reloadGroups() { state.groups = await call(api.groups.list()); renderGroupFilter(); renderCounts(); }
  async function reloadSdk() { state.sdk = await call(api.sdk.status()); renderSdkPill(); if (state.view === 'settings') renderSettings(); }

  function renderAll() {
    renderCounts(); renderSdkPill(); renderGroupFilter(); renderProfiles(); renderBrowsers(); renderProxies(); renderSettings(); renderHelp();
    $('#version').textContent = `DroidDesk v${state.info.version} · ${state.info.platform}/${state.info.arch}`;
    $$('#view-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.viewMode));
  }
  function renderCounts() {
    $('#count-profiles').textContent = state.profiles.length;
    $('#count-proxies').textContent = state.proxies.length;
    $('#count-browsers').textContent = state.browsers.length;
    $('#count-groups').textContent = state.groups.length;
  }
  function renderSdkPill() {
    const s = state.sdk;
    const dot = $('#sdk-dot');
    dot.className = `dot ${s.ready ? 'ok' : (s.hasEmulator ? 'warn' : 'bad')}`;
    $('#sdk-text').textContent = s.ready ? `${t('sdk_ready')} · ${t('images_count', { n: s.images.length })}` : t('sdk_missing');
    $('#sdk-setup-link').style.display = s.ready ? 'none' : '';
  }
  function renderGroupFilter() {
    const html = `<option value="all">${esc(t('all_groups'))}</option><option value="none">${esc(t('ungrouped'))}</option>` +
      state.groups.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    for (const [id, key] of [['#filter-group', 'filterGroup'], ['#bfilter-group', 'bfilterGroup']]) {
      const sel = $(id); const cur = state[key];
      sel.innerHTML = html;
      sel.value = [...sel.options].some((o) => o.value === cur) ? cur : 'all';
      state[key] = sel.value;
    }
  }

  // ------------------------------------------------------------ profiles view
  function filteredProfiles() {
    const q = state.filterText.trim().toLowerCase();
    return state.profiles.filter((p) => {
      if (state.filterGroup === 'none' && p.groupId) return false;
      if (state.filterGroup !== 'all' && state.filterGroup !== 'none' && p.groupId !== state.filterGroup) return false;
      if (q && !(`${p.serial} ${p.name} ${p.tags.join(' ')} ${p.country} ${p.device.model}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function proxyChip(p) {
    const px = proxyOf(p);
    if (!px) return `<span class="chip lan">${esc(t('lan'))}</span><span class="sub">${esc(t('no_proxy'))}</span>`;
    const bad = px.lastCheck && px.lastCheck.ok === false;
    const label = `${px.type.toUpperCase()} ${px.host}:${px.port}`;
    const geo = px.lastCheck && px.lastCheck.ok ? ` · ${px.lastCheck.countryCode || ''} ${px.lastCheck.ip || ''}` : '';
    return `<span class="chip proxy ${bad ? 'bad' : ''}">${esc(px.type.toUpperCase())}</span><span class="sub" title="${esc(label)}">${esc(px.host)}:${esc(px.port)}${esc(geo)}</span>`;
  }
  // Small warning when the proxy's detected country differs from the profile's country.
  function proxyGeoWarn(p) {
    const px = proxyOf(p);
    if (!px || !px.lastCheck || !px.lastCheck.ok || !px.lastCheck.countryCode || px.lastCheck.countryCode === p.country) return '';
    return `<span class="chip" style="color:var(--yellow);border-color:var(--yellow)" title="${esc(t('geo_mismatch', { country: px.lastCheck.country }))}">⚠ ${esc(px.lastCheck.countryCode)}</span>`;
  }
  function statusBadge(p) { return `<span class="status ${esc(p.status)}">${esc(t(`status_${p.status}`))}</span>`; }

  function renderProfiles() {
    const root = $('#profiles-content');
    const list = filteredProfiles();
    $('#total-count').textContent = t('total_records', { n: list.length });
    $('#selected-count').textContent = state.selected.size ? t('selected', { n: state.selected.size }) : '';
    $('#select-all').checked = list.length > 0 && list.every((p) => state.selected.has(p.id));
    renderCounts();
    if (!state.profiles.length) {
      root.innerHTML = `<div class="empty"><div class="ill">${ICON.phone}</div><h3>${esc(t('no_profiles_title'))}</h3><p>${esc(t('no_profiles_text'))}</p>
        ${state.sdk.ready ? `<button class="btn primary" id="empty-new">${esc(t('new_profile'))}</button>` : `<button class="btn primary" data-view="settings">${esc(t('go_settings'))}</button>`}</div>`;
      const b = $('#empty-new'); if (b) b.onclick = () => openProfileModal(null);
      return;
    }
    if (!list.length) { root.innerHTML = `<div class="empty"><p>${esc(t('no_results'))}</p></div>`; return; }
    if (state.viewMode === 'list') {
      root.innerHTML = `<table class="list"><thead><tr><th></th><th>#</th><th>${esc(t('col_profile'))}</th><th>${esc(t('col_status'))}</th><th>${esc(t('col_device'))}</th><th>${esc(t('android'))}</th><th>${esc(t('col_country'))}</th><th>${esc(t('col_proxy'))}</th><th>${esc(t('col_group'))}</th><th>${esc(t('col_tags'))}</th><th>${esc(t('col_actions'))}</th></tr></thead><tbody>` +
        list.map((p) => `<tr data-id="${esc(p.id)}" class="${state.selected.has(p.id) ? 'selected' : ''}">
          <td><input type="checkbox" class="checkbox sel" ${state.selected.has(p.id) ? 'checked' : ''}></td>
          <td>${p.serial}</td><td><b>${esc(p.name)}</b></td><td>${statusBadge(p)}</td>
          <td>${esc(p.device.manufacturer)} ${esc(p.device.model)}</td><td><span class="android">${ICON.android}${esc(p.androidVersion)}</span></td>
          <td>${flag(p.country)}${esc(country(p.country).name)}</td><td><span class="row" style="display:inline-flex;gap:6px;align-items:center">${proxyChip(p)}</span></td>
          <td>${esc(groupName(p.groupId))}</td><td><span class="tags">${p.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join('') || '--'}</span></td>
          <td><div class="actions">${actionButtons(p)}<button class="menu-btn" data-menu>${ICON.dots}</button></div></td></tr>`).join('') + '</tbody></table>';
    } else {
      root.innerHTML = `<div class="grid">${list.map(cardHtml).join('')}</div>`;
    }
    bindProfileEvents(root);
  }
  function actionButtons(p) {
    if (p.status === 'stopped') return `<button class="btn success sm" data-act="start">${ICON.play}<span>${esc(t('start'))}</span></button>`;
    if (p.status === 'running') return `<button class="btn outline sm" data-act="stop">${ICON.stop}<span>${esc(t('stop'))}</span></button>`;
    return `<button class="btn outline sm" disabled><span class="spin"></span><span>${esc(t(`status_${p.status}`))}</span></button>`;
  }
  function cardHtml(p) {
    const sel = state.selected.has(p.id);
    return `<div class="card ${sel ? 'selected' : ''} ${p.status === 'running' ? 'running' : ''}" data-id="${esc(p.id)}">
      <div class="head"><input type="checkbox" class="checkbox sel" ${sel ? 'checked' : ''}><div class="title"><span class="num">${p.serial}.</span> ${esc(p.name)}</div>${statusBadge(p)}</div>
      <div class="row">${ICON.phone}<span class="muted">${esc(p.device.manufacturer)} ${esc(p.device.model)}</span><span class="sub">· ${esc(t('port'))} ${p.port}</span></div>
      <div class="row">${ICON.pin}${flag(p.country)}<span>${esc(country(p.country).name)}</span><span class="sub">· ${esc(p.timezone)}</span>${proxyGeoWarn(p)}</div>
      <div class="row">${ICON.android}<span class="android">${esc(t('android'))} ${esc(p.androidVersion)}</span><span class="sub">· ${esc(t('ram'))} ${p.ram} MB · ${esc(t('storage'))} ${p.storage} GB</span></div>
      <div class="row">${ICON.net}${proxyChip(p)}</div>
      <div class="row">${ICON.list}<span>${esc(groupName(p.groupId))}</span></div>
      <div class="row">${ICON.tag}<span class="tags">${p.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join('') || '<span class="sub">--</span>'}</span></div>
      <div class="actions">${actionButtons(p)}<span class="sep"></span><button class="menu-btn" data-menu title="⋮">${ICON.dots}</button></div>
    </div>`;
  }
  function bindProfileEvents(root) {
    $$('[data-id]', root).forEach((el) => {
      const id = el.dataset.id;
      $('.sel', el).addEventListener('change', (e) => { if (e.target.checked) state.selected.add(id); else state.selected.delete(id); renderProfiles(); });
      const start = $('[data-act="start"]', el); if (start) start.onclick = () => startProfile(id);
      const stop = $('[data-act="stop"]', el); if (stop) stop.onclick = () => stopProfile(id);
      $('[data-menu]', el).onclick = (e) => { e.stopPropagation(); openMenu(e.currentTarget, id); };
      el.addEventListener('dblclick', (e) => { if (!e.target.closest('button,input')) openProfileModal(id); });
    });
  }

  // ------------------------------------------------------------ actions
  async function startProfile(id, opts = {}) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p || p.status !== 'stopped') return;
    if (!state.sdk.ready) { toast(t('err_SDK_MISSING'), 'err'); showView('settings'); return; }
    p.status = 'starting'; renderProfiles();
    try { await call(api.profiles.start(id, opts)); toast(t('toast_started', { name: p.name }), 'ok'); }
    catch (_) { p.status = 'stopped'; renderProfiles(); }
  }
  async function stopProfile(id) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p || p.status === 'stopped') return;
    p.status = 'stopping'; renderProfiles();
    try { await call(api.profiles.stop(id)); } catch (_) { /* toast already shown */ }
  }
  async function deleteProfiles(ids) {
    if (!ids.length) return;
    if (!(await confirmModal(t('confirm_delete_profiles', { n: ids.length }), t('yes_delete'), true))) return;
    try { await call(api.profiles.delete(ids)); ids.forEach((id) => state.selected.delete(id)); toast(t('toast_deleted'), 'ok'); await reloadProfiles(); } catch (_) { /* shown */ }
  }
  async function checkProfileProxy(id) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p) return;
    try {
      const r = await call(api.profiles.checkProxy(id));
      if (r.direct) toast(t('toast_direct'), 'warn');
      else if (r.ok) toast(`${p.name}: ${t('toast_proxy_ok', { ip: r.ip, country: r.country, ms: r.latency })}`, 'ok');
      else toast(`${p.name}: ${t('toast_proxy_fail', { err: errMsg(r.error) })}`, 'err');
      state.proxies = await call(api.proxies.list()); renderProfiles(); renderProxies();
    } catch (_) { /* shown */ }
  }
  async function exportProfiles(ids) {
    try {
      const json = await call(api.profiles.export(ids && ids.length ? ids : null));
      const path = await call(api.dialog.saveFile({ title: t('export'), defaultPath: 'droiddesk-profiles.json', content: json, filters: [{ name: 'JSON', extensions: ['json'] }] }));
      if (path) toast(t('toast_exported', { path }), 'ok');
    } catch (_) { /* shown */ }
  }
  async function bulk(action) {
    const ids = [...state.selected];
    if (action === 'export') return exportProfiles(ids);
    if (!ids.length) { toast(t('selected', { n: 0 }), 'warn'); return; }
    if (action === 'start') { for (const id of ids) await startProfile(id); }
    else if (action === 'stop') { await Promise.all(ids.map((id) => stopProfile(id))); }
    else if (action === 'delete') { await deleteProfiles(ids); }
    else if (action === 'move') { await openMoveModal(ids); }
    else if (action === 'checkproxy') { for (const id of ids) await checkProfileProxy(id); }
  }

  // ------------------------------------------------------------ context menu
  function openMenu(anchor, id) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p) return;
    const ctx = $('#ctx');
    const running = p.status !== 'stopped';
    ctx.innerHTML = `
      ${!running ? `<button data-m="start">${ICON.play}${esc(t('start'))}</button><button data-m="cold">${ICON.snow}${esc(t('cold_boot'))}</button>` : `<button data-m="stop">${ICON.stop}${esc(t('stop'))}</button>`}
      <button data-m="edit">${ICON.edit}${esc(t('edit'))}</button>
      <button data-m="check">${ICON.check}${esc(t('check_proxy'))}</button>
      <button data-m="logs">${ICON.log}${esc(t('logs'))}</button>
      <button data-m="folder">${ICON.folder}${esc(t('open_folder'))}</button>
      <hr><button data-m="delete" class="danger">${ICON.trash}${esc(t('delete'))}</button>`;
    const r = anchor.getBoundingClientRect();
    ctx.classList.add('open');
    const w = 220; const h = ctx.offsetHeight;
    ctx.style.left = `${Math.min(r.left, window.innerWidth - w - 8)}px`;
    ctx.style.top = `${r.bottom + h > window.innerHeight ? r.top - h : r.bottom + 4}px`;
    ctx.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      closeMenu();
      const m = b.dataset.m;
      if (m === 'start') startProfile(id);
      else if (m === 'cold') startProfile(id, { cold: true });
      else if (m === 'stop') stopProfile(id);
      else if (m === 'edit') openProfileModal(id);
      else if (m === 'check') checkProfileProxy(id);
      else if (m === 'logs') openLogsModal(id);
      else if (m === 'folder') api.shell.openPath(`${state.info.avdHome.replace(/[\\/]$/, '')}${state.info.platform === 'win32' ? '\\' : '/'}${p.avdId}.avd`);
      else if (m === 'delete') deleteProfiles([id]);
    };
  }
  function closeMenu() { $('#ctx').classList.remove('open'); }
  document.addEventListener('click', closeMenu);
  window.addEventListener('blur', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); if ($('#modal-bg').classList.contains('open') && !state.installing) closeModal(); } });

  // ------------------------------------------------------------ modal plumbing
  let modalResolve = null;
  function openModal(html, { size = '' } = {}) {
    const m = $('#modal');
    m.className = `modal ${size}`;
    m.innerHTML = html;
    $('#modal-bg').classList.add('open');
    const first = $('input:not([type=checkbox]):not([type=radio]),select,textarea', m); if (first) setTimeout(() => first.focus(), 30);
    return m;
  }
  function closeModal() { $('#modal-bg').classList.remove('open'); $('#modal').innerHTML = ''; state.logsOpenFor = null; if (modalResolve) { const r = modalResolve; modalResolve = null; r(false); } }
  $('#modal-bg').addEventListener('mousedown', (e) => { if (e.target === e.currentTarget && !state.installing) closeModal(); });
  function confirmModal(text, okLabel, danger) {
    return new Promise((resolve) => {
      modalResolve = resolve;
      const m = openModal(`<div class="m-head"><h3>${esc(t('confirm'))}</h3></div><div class="m-body"><p style="margin:0;line-height:1.5">${esc(text)}</p></div>
        <div class="m-foot"><button class="btn outline" data-x="cancel">${esc(t('cancel'))}</button><button class="btn ${danger ? 'danger outline' : 'primary'}" data-x="ok">${esc(okLabel || t('confirm'))}</button></div>`, { size: 'sm' });
      $('[data-x="cancel"]', m).onclick = () => closeModal();
      $('[data-x="ok"]', m).onclick = () => { modalResolve = null; closeModal(); resolve(true); };
    });
  }
  function proxyFields(prefix, v = {}) {
    return `<div class="form-grid">
      <div class="field full"><label>${esc(t('f_quick_paste'))}</label><div class="inline"><input class="input" id="${prefix}-paste" placeholder="host:port:user:pass"><button class="btn outline" type="button" id="${prefix}-paste-btn">${esc(t('apply'))}</button></div></div>
      <div class="field"><label>${esc(t('f_type'))}</label><select class="select" id="${prefix}-type">${['http', 'https', 'socks5', 'socks4'].map((x) => `<option value="${x}" ${v.type === x ? 'selected' : ''}>${x.toUpperCase()}</option>`).join('')}</select></div>
      <div class="field"><label>${esc(t('f_host'))}</label><input class="input" id="${prefix}-host" value="${esc(v.host || '')}" placeholder="proxy.exemplo.com"></div>
      <div class="field"><label>${esc(t('f_port'))}</label><input class="input" id="${prefix}-port" type="number" min="1" max="65535" value="${esc(v.port || '')}" placeholder="8080"></div>
      <div class="field"><label>${esc(t('f_user'))}</label><input class="input" id="${prefix}-user" value="${esc(v.username || '')}" autocomplete="off"></div>
      <div class="field"><label>${esc(t('f_pass'))}</label><input class="input" id="${prefix}-pass" type="password" value="${esc(v.password || '')}" autocomplete="off"></div>
      <div class="field"><label>&nbsp;</label><button class="btn outline" type="button" id="${prefix}-test">${ICON.check}<span>${esc(t('test'))}</span></button></div>
      <div class="test-result full" id="${prefix}-result"></div>
    </div>`;
  }
  function readProxyFields(prefix, m) {
    return { type: $(`#${prefix}-type`, m).value, host: $(`#${prefix}-host`, m).value.trim(), port: parseInt($(`#${prefix}-port`, m).value, 10), username: $(`#${prefix}-user`, m).value, password: $(`#${prefix}-pass`, m).value };
  }
  function bindProxyFields(prefix, m) {
    $(`#${prefix}-paste-btn`, m).onclick = async () => {
      const parsed = await call(api.proxies.parse($(`#${prefix}-paste`, m).value), { silent: true }).catch(() => null);
      if (!parsed) { toast(t('err_INVALID_PROXY'), 'err'); return; }
      $(`#${prefix}-type`, m).value = parsed.type; $(`#${prefix}-host`, m).value = parsed.host; $(`#${prefix}-port`, m).value = parsed.port;
      $(`#${prefix}-user`, m).value = parsed.username; $(`#${prefix}-pass`, m).value = parsed.password; $(`#${prefix}-paste`, m).value = '';
    };
    $(`#${prefix}-paste`, m).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $(`#${prefix}-paste-btn`, m).click(); } });
    $(`#${prefix}-test`, m).onclick = async () => {
      const btn = $(`#${prefix}-test`, m); const out = $(`#${prefix}-result`, m);
      btn.disabled = true; btn.querySelector('span').textContent = t('testing'); out.className = 'test-result full';
      try {
        const r = await call(api.proxies.test(readProxyFields(prefix, m)), { silent: true });
        out.className = 'test-result full ok'; out.textContent = `✔ ${r.ip} · ${r.country} (${r.countryCode}) · ${r.city || ''} · ${r.isp || ''} · ${r.latency} ms · ${r.timezone}`;
        out.dataset.country = r.countryCode || ''; out.dataset.timezone = r.timezone || '';
        m.__lastProxyCheck = r;
        if (prefix === 'pfx') applyGeoToProfileForm(m, r);
      } catch (err) { out.className = 'test-result full bad'; out.textContent = `✖ ${errMsg(err.message)}`; }
      btn.disabled = false; btn.querySelector('span').textContent = t('test');
    };
  }

  // Set country / locale / timezone from a proxy check result (like GeeLark does).
  function applyGeoToProfileForm(m, r) {
    if (!r || !r.countryCode) return;
    const sel = $('#pf-country', m); if (!sel) return;
    const c = state.meta.countries.find((x) => x.code === r.countryCode);
    if (!c) { toast(t('geo_unknown', { country: r.country || r.countryCode }), 'warn'); return; }
    sel.value = c.code;
    $('#pf-locale', m).value = c.locale;
    $('#pf-tz', m).value = r.timezone || c.timezone;
    toast(t('geo_applied', { country: c.name }), 'ok');
  }

  // ------------------------------------------------------------ profile modal
  function openProfileModal(id) {
    const p = id ? state.profiles.find((x) => x.id === id) : null;
    if (!p && !state.sdk.images.length) { toast(t('no_images'), 'err'); showView('settings'); return; }
    const devices = state.meta.devices;
    const images = state.sdk.images;
    const dev = p ? null : devices[0];
    const v = p || { name: '', groupId: state.filterGroup !== 'all' && state.filterGroup !== 'none' ? state.filterGroup : null, tags: [], country: 'BR', locale: 'pt-BR', timezone: 'America/Sao_Paulo', deviceName: '', notes: '', proxyMode: 'none', proxyId: null, proxy: null, ram: dev.ram, storage: 8 };
    const m = openModal(`<div class="m-head"><h3>${esc(p ? t('profile_modal_edit') : t('profile_modal_new'))}</h3></div>
      <form class="m-body" id="pf">
        <div class="form-grid">
          <div class="field"><label>${esc(t('f_name'))}</label><input class="input" id="pf-name" value="${esc(v.name)}" required maxlength="60"></div>
          <div class="field"><label>${esc(t('f_group'))}</label><select class="select" id="pf-group"><option value="">${esc(t('ungrouped'))}</option>${state.groups.map((g) => `<option value="${esc(g.id)}" ${v.groupId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
          <div class="field full"><label>${esc(t('f_tags'))}</label><input class="input" id="pf-tags" value="${esc(v.tags.join(', '))}" placeholder="tiktok, loja, teste"></div>
        </div>
        <div class="panel"><h4>${esc(t('f_device'))}</h4>
          ${p ? `<div class="hint">${esc(t('hw_locked'))}</div>` : ''}
          <div class="form-grid">
            <div class="field"><label>${esc(t('f_device'))}</label><select class="select" id="pf-device" ${p ? 'disabled' : ''}>${p ? `<option>${esc(p.device.manufacturer)} ${esc(p.device.model)}</option>` : devices.map((d) => `<option value="${d.id}">${esc(d.name)} · ${d.width}x${d.height}</option>`).join('')}</select></div>
            <div class="field"><label>${esc(t('f_image'))}</label><select class="select" id="pf-image" ${p ? 'disabled' : ''}>${p ? `<option>Android ${esc(p.androidVersion)} (${esc(p.abi)})</option>` : images.map((i) => `<option value="${esc(i.id)}">Android ${esc(state.meta.versions[i.api] || i.api)} (API ${i.api}) · ${esc(i.tagDisplay)} · ${esc(i.abi)}</option>`).join('')}</select></div>
            <div class="field"><label>${esc(t('f_ram'))}</label><input class="input" id="pf-ram" type="number" min="1024" max="8192" step="256" value="${esc(v.ram)}" ${p ? 'disabled' : ''}></div>
            <div class="field"><label>${esc(t('f_storage'))}</label><input class="input" id="pf-storage" type="number" min="2" max="64" value="${esc(v.storage)}" ${p ? 'disabled' : ''}></div>
            <div class="field full"><label>${esc(t('f_device_name'))}</label><input class="input" id="pf-devname" value="${esc(v.deviceName)}" placeholder="Galaxy S23 de Ana"></div>
          </div>
        </div>
        <div class="panel"><h4>${esc(t('f_country'))}</h4>
          <div class="hint" style="font-size:12px;color:var(--text-3)">${esc(t('country_hint'))}</div>
          <div class="form-grid">
            <div class="field"><label>${esc(t('f_country'))}</label><select class="select" id="pf-country">${state.meta.countries.map((c) => `<option value="${c.code}" ${v.country === c.code ? 'selected' : ''}>${c.flag} ${esc(c.name)}</option>`).join('')}</select></div>
            <div class="field"><label>${esc(t('f_locale'))}</label><input class="input" id="pf-locale" value="${esc(v.locale)}"></div>
            <div class="field full"><label>${esc(t('f_timezone'))}</label><input class="input" id="pf-tz" value="${esc(v.timezone)}" list="tz-list"><datalist id="tz-list">${state.meta.countries.map((c) => `<option value="${c.timezone}">`).join('')}</datalist></div>
          </div>
        </div>
        <div class="panel"><h4>${esc(t('f_proxy'))}</h4>
          <div class="radios">${['none', 'saved', 'inline'].map((mode) => `<label><input type="radio" name="pf-pmode" value="${mode}" ${v.proxyMode === mode ? 'checked' : ''}><span>${esc(t(`proxy_${mode}`))}</span></label>`).join('')}</div>
          <div id="pf-saved" class="field" style="display:none"><label>${esc(t('f_proxy_select'))}</label><select class="select" id="pf-proxy-id">${state.proxies.map((x) => `<option value="${esc(x.id)}" ${v.proxyId === x.id ? 'selected' : ''}>${esc(x.name)} · ${x.type.toUpperCase()} ${esc(x.host)}:${x.port}${x.lastCheck && x.lastCheck.ok ? ` · ${esc(x.lastCheck.countryCode)} ${esc(x.lastCheck.ip)}` : ''}</option>`).join('')}</select>${state.proxies.length ? '' : `<div class="hint">${esc(t('no_proxies'))}</div>`}</div>
          <div id="pf-inline" style="display:none">${proxyFields('pfx', v.proxy || {})}</div>
        </div>
        <div class="field"><label>${esc(t('f_notes'))}</label><textarea class="input" id="pf-notes" rows="2">${esc(v.notes)}</textarea></div>
      </form>
      <div class="m-foot"><button class="btn outline" type="button" id="pf-cancel">${esc(t('cancel'))}</button><button class="btn primary" type="submit" form="pf" id="pf-save">${esc(p ? t('save') : t('create'))}</button></div>`);
    const updateMode = () => { const mode = $('input[name="pf-pmode"]:checked', m).value; $('#pf-saved', m).style.display = mode === 'saved' ? '' : 'none'; $('#pf-inline', m).style.display = mode === 'inline' ? '' : 'none'; };
    $$('input[name="pf-pmode"]', m).forEach((r) => r.addEventListener('change', updateMode)); updateMode();
    bindProxyFields('pfx', m);
    if (v.proxy && v.proxy.lastCheck && v.proxy.lastCheck.ok) {
      const out = $('#pfx-result', m); const lc = v.proxy.lastCheck;
      out.className = 'test-result full ok'; out.textContent = `✔ ${lc.ip} · ${lc.country} (${lc.countryCode}) · ${lc.city || ''} · ${lc.latency} ms`;
    }
    const syncSaved = () => { const px = state.proxies.find((x) => x.id === $('#pf-proxy-id', m).value); if (px && px.lastCheck && px.lastCheck.ok) applyGeoToProfileForm(m, px.lastCheck); };
    $('#pf-proxy-id', m).addEventListener('change', syncSaved);
    $$('input[name="pf-pmode"]', m).forEach((r) => r.addEventListener('change', () => { if (r.value === 'saved' && r.checked) syncSaved(); }));
    if (!p) {
      $('#pf-device', m).addEventListener('change', (e) => { const d = devices.find((x) => x.id === e.target.value); if (d) $('#pf-ram', m).value = d.ram; });
    }
    $('#pf-country', m).addEventListener('change', (e) => { const c = country(e.target.value); $('#pf-locale', m).value = c.locale; $('#pf-tz', m).value = c.timezone; });
    $('#pf-cancel', m).onclick = () => closeModal();
    $('#pf', m).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#pf-save', m); btn.disabled = true; btn.textContent = p ? t('saving') : t('creating');
      const mode = $('input[name="pf-pmode"]:checked', m).value;
      const input = {
        name: $('#pf-name', m).value, groupId: $('#pf-group', m).value || null,
        tags: $('#pf-tags', m).value.split(',').map((x) => x.trim()).filter(Boolean),
        country: $('#pf-country', m).value, locale: $('#pf-locale', m).value.trim(), timezone: $('#pf-tz', m).value.trim(),
        deviceName: $('#pf-devname', m).value, notes: $('#pf-notes', m).value,
        proxyMode: mode, proxyId: mode === 'saved' ? $('#pf-proxy-id', m).value : null, proxy: mode === 'inline' ? { ...readProxyFields('pfx', m), lastCheck: m.__lastProxyCheck || (v.proxy && v.proxy.lastCheck) || null } : null,
      };
      if (!p) Object.assign(input, { deviceId: $('#pf-device', m).value, imageId: $('#pf-image', m).value, ram: $('#pf-ram', m).value, storage: $('#pf-storage', m).value });
      try {
        if (p) await call(api.profiles.update(p.id, input)); else await call(api.profiles.create(input));
        closeModal(); toast(t('toast_saved'), 'ok'); await reloadProfiles();
      } catch (_) { btn.disabled = false; btn.textContent = p ? t('save') : t('create'); }
    };
  }

  // ------------------------------------------------------------ move / groups modals
  function openMoveModal(ids, kind = 'profile') {
    return new Promise((resolve) => {
      modalResolve = resolve;
      const m = openModal(`<div class="m-head"><h3>${esc(t('move_title', { n: ids.length }))}</h3></div><div class="m-body">
        <div class="field"><label>${esc(t('f_group'))}</label><select class="select" id="mv-group"><option value="">${esc(t('ungrouped'))}</option>${state.groups.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('new_group_placeholder'))}</label><div class="inline"><input class="input" id="mv-new" placeholder="${esc(t('new_group_placeholder'))}"><button class="btn outline" id="mv-add">${esc(t('add'))}</button></div></div></div>
        <div class="m-foot"><button class="btn outline" id="mv-cancel">${esc(t('cancel'))}</button><button class="btn primary" id="mv-ok">${esc(t('move'))}</button></div>`, { size: 'sm' });
      $('#mv-cancel', m).onclick = () => closeModal();
      $('#mv-add', m).onclick = async () => {
        try { const g = await call(api.groups.create($('#mv-new', m).value)); await reloadGroups(); const sel = $('#mv-group', m); sel.insertAdjacentHTML('beforeend', `<option value="${esc(g.id)}">${esc(g.name)}</option>`); sel.value = g.id; $('#mv-new', m).value = ''; } catch (_) { /* shown */ }
      };
      $('#mv-ok', m).onclick = async () => {
        try {
          if (kind === 'browser') { await call(api.browsers.move(ids, $('#mv-group', m).value || null)); } else { await call(api.profiles.move(ids, $('#mv-group', m).value || null)); }
          modalResolve = null; closeModal(); toast(t('toast_moved'), 'ok'); if (kind === 'browser') await reloadBrowsers(); else await reloadProfiles(); resolve(true);
        } catch (_) { /* shown */ }
      };
    });
  }
  function openGroupsModal() {
    const render = () => {
      const m = $('#modal');
      $('#gr-list', m).innerHTML = state.groups.length ? state.groups.map((g) => `<div class="row" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)" data-gid="${esc(g.id)}">
        <input class="input" value="${esc(g.name)}" style="flex:1"><span class="sub" style="color:var(--text-3);font-size:12px;white-space:nowrap">${esc(t('profiles_in_group', { n: state.profiles.filter((p) => p.groupId === g.id).length + state.browsers.filter((p) => p.groupId === g.id).length }))}</span>
        <button class="btn outline sm" data-g="rename">${esc(t('rename'))}</button><button class="btn danger sm" data-g="delete">${ICON.trash}</button></div>`).join('') : `<p class="hint" style="color:var(--text-3)">${esc(t('no_groups'))}</p>`;
      $$('[data-gid]', m).forEach((row) => {
        const gid = row.dataset.gid; const g = state.groups.find((x) => x.id === gid);
        $('[data-g="rename"]', row).onclick = async () => { try { await call(api.groups.rename(gid, $('input', row).value)); await reloadGroups(); renderProfiles(); renderBrowsers(); render(); toast(t('toast_saved'), 'ok'); } catch (_) { /* shown */ } };
        $('[data-g="delete"]', row).onclick = async () => {
          const m2 = $('#modal').innerHTML; // keep modal; use native-like inline confirm via window.confirm replacement
          if (!(await inlineConfirm(row, t('confirm_delete_group', { name: g.name })))) return;
          try { await call(api.groups.delete(gid)); await reloadGroups(); await reloadProfiles(); await reloadBrowsers(); render(); toast(t('toast_deleted'), 'ok'); } catch (_) { /* shown */ }
          void m2;
        };
      });
    };
    const m = openModal(`<div class="m-head"><h3>${esc(t('groups_title'))}</h3></div><div class="m-body">
      <div class="field"><div class="inline"><input class="input" id="gr-new" placeholder="${esc(t('new_group_placeholder'))}"><button class="btn primary" id="gr-add">${esc(t('add'))}</button></div></div>
      <div id="gr-list"></div></div><div class="m-foot"><button class="btn outline" id="gr-close">${esc(t('close'))}</button></div>`, { size: 'sm' });
    $('#gr-close', m).onclick = () => closeModal();
    const add = async () => { try { await call(api.groups.create($('#gr-new', m).value)); $('#gr-new', m).value = ''; await reloadGroups(); render(); } catch (_) { /* shown */ } };
    $('#gr-add', m).onclick = add;
    $('#gr-new', m).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    render();
  }
  // Small inline confirmation that replaces a row's buttons temporarily.
  function inlineConfirm(row, text) {
    return new Promise((resolve) => {
      const prev = row.innerHTML;
      row.innerHTML = `<span style="flex:1;font-size:13px">${esc(text)}</span><button class="btn danger sm" data-c="y">${esc(t('yes_delete'))}</button><button class="btn outline sm" data-c="n">${esc(t('cancel'))}</button>`;
      $('[data-c="y"]', row).onclick = () => resolve(true);
      $('[data-c="n"]', row).onclick = () => { row.innerHTML = prev; resolve(false); };
    });
  }

  // ------------------------------------------------------------ logs modal
  function openLogsModal(id, kind = 'profile') {
    const p = (kind === 'browser' ? state.browsers : state.profiles).find((x) => x.id === id); if (!p) return;
    state.logsOpenFor = `${kind}:${id}`;
    const src = kind === 'browser' ? api.browsers : api.profiles;
    const m = openModal(`<div class="m-head"><h3>${esc(t('log_title', { name: p.name }))}</h3><button class="btn outline sm" id="lg-copy">${esc(t('copy'))}</button></div>
      <div class="m-body"><div class="console" id="lg-console"></div></div><div class="m-foot"><button class="btn outline" id="lg-close">${esc(t('close'))}</button></div>`, { size: 'lg' });
    $('#lg-close', m).onclick = () => closeModal();
    $('#lg-copy', m).onclick = () => { navigator.clipboard.writeText($('#lg-console', m).textContent).then(() => toast(t('toast_copied'), 'ok')); };
    call(src.log(id)).then((lines) => { const c = $('#lg-console'); if (!c) return; c.textContent = lines.length ? lines.join('\n') : t('log_empty'); c.scrollTop = c.scrollHeight; });
  }
  function appendLog(e, kind = 'profile') {
    if (state.logsOpenFor !== `${kind}:${e.profileId}`) return;
    const c = $('#lg-console'); if (!c) return;
    if (c.textContent === t('log_empty')) c.textContent = '';
    c.textContent += (c.textContent ? '\n' : '') + e.line; c.scrollTop = c.scrollHeight;
  }

  // ------------------------------------------------------------ browsers view
  const ICON_BROWSER = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>';
  function browserName(p) {
    if (p.browserId && p.browserId !== 'auto') { const b = state.detectedBrowsers.find((x) => x.id === p.browserId || x.path === p.browserId); if (b) return b.name; return p.browserId; }
    return state.detectedBrowsers[0] ? `${state.detectedBrowsers[0].name}` : t('not_found');
  }
  function filteredBrowsers() {
    const q = state.bfilterText.trim().toLowerCase();
    return state.browsers.filter((p) => {
      if (state.bfilterGroup === 'none' && p.groupId) return false;
      if (state.bfilterGroup !== 'all' && state.bfilterGroup !== 'none' && p.groupId !== state.bfilterGroup) return false;
      if (q && !(`${p.serial} ${p.name} ${p.tags.join(' ')} ${p.country}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function renderBrowsers() {
    const root = $('#browsers-content');
    const list = filteredBrowsers();
    $('#btotal-count').textContent = t('total_records', { n: list.length });
    $('#bselected-count').textContent = state.bselected.size ? t('selected', { n: state.bselected.size }) : '';
    $('#bselect-all').checked = list.length > 0 && list.every((p) => state.bselected.has(p.id));
    renderCounts();
    if (!state.browsers.length) {
      root.innerHTML = `<div class="empty"><div class="ill">${ICON_BROWSER}</div><h3>${esc(t('no_browsers_title'))}</h3><p>${esc(t('no_browsers_text'))}</p>${state.detectedBrowsers.length ? `<button class="btn primary" id="bempty-new">${esc(t('new_browser'))}</button>` : `<div class="note warn" style="display:inline-block">${esc(t('no_browser_found'))}</div>`}</div>`;
      const b = $('#bempty-new'); if (b) b.onclick = () => openBrowserModal(null);
      return;
    }
    if (!list.length) { root.innerHTML = `<div class="empty"><p>${esc(t('no_results'))}</p></div>`; return; }
    root.innerHTML = `<div class="grid">${list.map(browserCardHtml).join('')}</div>`;
    $$('[data-bid]', root).forEach((el) => {
      const id = el.dataset.bid;
      $('.sel', el).addEventListener('change', (e) => { if (e.target.checked) state.bselected.add(id); else state.bselected.delete(id); renderBrowsers(); });
      const start = $('[data-act="start"]', el); if (start) start.onclick = () => startBrowser(id);
      const stop = $('[data-act="stop"]', el); if (stop) stop.onclick = () => stopBrowser(id);
      $('[data-menu]', el).onclick = (e) => { e.stopPropagation(); openBrowserMenu(e.currentTarget, id); };
      el.addEventListener('dblclick', (e) => { if (!e.target.closest('button,input')) openBrowserModal(id); });
    });
  }
  function browserCardHtml(p) {
    const sel = state.bselected.has(p.id);
    return `<div class="card ${sel ? 'selected' : ''} ${p.status === 'running' ? 'running' : ''}" data-bid="${esc(p.id)}">
      <div class="head"><input type="checkbox" class="checkbox sel" ${sel ? 'checked' : ''}><div class="title"><span class="num">${p.serial}.</span> ${esc(p.name)}</div>${statusBadge(p)}</div>
      <div class="row">${ICON_BROWSER}<span class="muted">${esc(browserName(p))}</span><span class="sub">· ${p.width}x${p.height}</span></div>
      <div class="row">${ICON.pin}${flag(p.country)}<span>${esc(country(p.country).name)}</span><span class="sub">· ${esc(p.timezone)}</span>${proxyGeoWarn(p)}</div>
      <div class="row">${ICON.net}${proxyChip(p)}</div>
      <div class="row">${ICON.list}<span>${esc(groupName(p.groupId))}</span></div>
      <div class="row">${ICON.tag}<span class="tags">${p.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join('') || '<span class="sub">--</span>'}</span></div>
      <div class="actions">${actionButtons(p)}<span class="sep"></span><button class="menu-btn" data-menu title="⋮">${ICON.dots}</button></div>
    </div>`;
  }
  async function startBrowser(id) {
    const p = state.browsers.find((x) => x.id === id);
    if (!p || p.status !== 'stopped') return;
    p.status = 'starting'; renderBrowsers();
    try { await call(api.browsers.start(id)); toast(t('toast_started', { name: p.name }), 'ok'); }
    catch (_) { p.status = 'stopped'; renderBrowsers(); }
  }
  async function stopBrowser(id) {
    const p = state.browsers.find((x) => x.id === id);
    if (!p || p.status === 'stopped') return;
    p.status = 'stopping'; renderBrowsers();
    try { await call(api.browsers.stop(id)); } catch (_) { /* shown */ }
  }
  async function deleteBrowsers(ids) {
    if (!ids.length) return;
    if (!(await confirmModal(t('confirm_delete_profiles', { n: ids.length }), t('yes_delete'), true))) return;
    try { await call(api.browsers.delete(ids)); ids.forEach((id) => state.bselected.delete(id)); toast(t('toast_deleted'), 'ok'); await reloadBrowsers(); } catch (_) { /* shown */ }
  }
  async function checkBrowserProxy(id) {
    const p = state.browsers.find((x) => x.id === id); if (!p) return;
    try {
      const r = await call(api.browsers.checkProxy(id));
      if (r.direct) toast(t('toast_direct'), 'warn');
      else if (r.ok) toast(`${p.name}: ${t('toast_proxy_ok', { ip: r.ip, country: r.country, ms: r.latency })}`, 'ok');
      else toast(`${p.name}: ${t('toast_proxy_fail', { err: errMsg(r.error) })}`, 'err');
      state.proxies = await call(api.proxies.list()); await reloadBrowsers(); renderProxies();
    } catch (_) { /* shown */ }
  }
  async function bulkBrowsers(action) {
    const ids = [...state.bselected];
    if (!ids.length) { toast(t('selected', { n: 0 }), 'warn'); return; }
    if (action === 'start') { for (const id of ids) await startBrowser(id); }
    else if (action === 'stop') { await Promise.all(ids.map((id) => stopBrowser(id))); }
    else if (action === 'delete') { await deleteBrowsers(ids); }
    else if (action === 'move') { await openMoveModal(ids, 'browser'); }
    else if (action === 'checkproxy') { for (const id of ids) await checkBrowserProxy(id); }
  }
  function openBrowserMenu(anchor, id) {
    const p = state.browsers.find((x) => x.id === id); if (!p) return;
    const ctx = $('#ctx');
    const running = p.status !== 'stopped';
    ctx.innerHTML = `
      ${!running ? `<button data-m="start">${ICON.play}${esc(t('start'))}</button>` : `<button data-m="stop">${ICON.stop}${esc(t('stop'))}</button>`}
      <button data-m="edit">${ICON.edit}${esc(t('edit'))}</button>
      <button data-m="check">${ICON.check}${esc(t('check_proxy'))}</button>
      <button data-m="logs">${ICON.log}${esc(t('logs'))}</button>
      <button data-m="folder">${ICON.folder}${esc(t('open_folder_browser'))}</button>
      <hr><button data-m="delete" class="danger">${ICON.trash}${esc(t('delete'))}</button>`;
    const r = anchor.getBoundingClientRect();
    ctx.classList.add('open');
    const h = ctx.offsetHeight;
    ctx.style.left = `${Math.min(r.left, window.innerWidth - 228)}px`;
    ctx.style.top = `${r.bottom + h > window.innerHeight ? r.top - h : r.bottom + 4}px`;
    ctx.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      closeMenu();
      const m = b.dataset.m;
      if (m === 'start') startBrowser(id);
      else if (m === 'stop') stopBrowser(id);
      else if (m === 'edit') openBrowserModal(id);
      else if (m === 'check') checkBrowserProxy(id);
      else if (m === 'logs') openLogsModal(id, 'browser');
      else if (m === 'folder') api.browsers.folder(id);
      else if (m === 'delete') deleteBrowsers([id]);
    };
  }
  function openBrowserModal(id) {
    const p = id ? state.browsers.find((x) => x.id === id) : null;
    if (!p && !state.detectedBrowsers.length) { toast(t('no_browser_found'), 'err'); showView('settings'); return; }
    const v = p || { name: '', groupId: state.bfilterGroup !== 'all' && state.bfilterGroup !== 'none' ? state.bfilterGroup : null, tags: [], browserId: 'auto', country: 'BR', locale: 'pt-BR', timezone: 'America/Sao_Paulo', width: 1280, height: 800, startUrl: '', notes: '', proxyMode: 'none', proxyId: null, proxy: null };
    const m = openModal(`<div class="m-head"><h3>${esc(p ? t('browser_modal_edit') : t('browser_modal_new'))}</h3></div>
      <form class="m-body" id="bf">
        <div class="form-grid">
          <div class="field"><label>${esc(t('f_name'))}</label><input class="input" id="bf-name" value="${esc(v.name)}" required maxlength="60"></div>
          <div class="field"><label>${esc(t('f_group'))}</label><select class="select" id="bf-group"><option value="">${esc(t('ungrouped'))}</option>${state.groups.map((g) => `<option value="${esc(g.id)}" ${v.groupId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
          <div class="field full"><label>${esc(t('f_tags'))}</label><input class="input" id="bf-tags" value="${esc(v.tags.join(', '))}" placeholder="facebook, loja, teste"></div>
          <div class="field"><label>${esc(t('f_browser'))}</label><select class="select" id="bf-browser"><option value="auto">${esc(t('browser_auto'))}</option>${state.detectedBrowsers.map((b) => `<option value="${esc(b.id)}" ${v.browserId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
          <div class="field"><label>${esc(t('f_window'))}</label><div class="inline"><input class="input" id="bf-width" type="number" min="400" max="3840" value="${esc(v.width)}"><input class="input" id="bf-height" type="number" min="300" max="2160" value="${esc(v.height)}"></div></div>
          <div class="field full"><label>${esc(t('f_start_url'))}</label><input class="input" id="bf-url" value="${esc(v.startUrl)}" placeholder="https://"></div>
        </div>
        <div class="panel"><h4>${esc(t('f_country'))}</h4>
          <div class="hint" style="font-size:12px;color:var(--text-3)">${esc(t('country_hint'))} ${esc(t('browser_tz_hint'))}</div>
          <div class="form-grid">
            <div class="field"><label>${esc(t('f_country'))}</label><select class="select" id="pf-country">${state.meta.countries.map((c) => `<option value="${c.code}" ${v.country === c.code ? 'selected' : ''}>${c.flag} ${esc(c.name)}</option>`).join('')}</select></div>
            <div class="field"><label>${esc(t('f_locale'))}</label><input class="input" id="pf-locale" value="${esc(v.locale)}"></div>
            <div class="field full"><label>${esc(t('f_timezone'))}</label><input class="input" id="pf-tz" value="${esc(v.timezone)}" list="tz-list2"><datalist id="tz-list2">${state.meta.countries.map((c) => `<option value="${c.timezone}">`).join('')}</datalist></div>
          </div>
        </div>
        <div class="panel"><h4>${esc(t('f_proxy'))}</h4>
          <div class="radios">${['none', 'saved', 'inline'].map((mode) => `<label><input type="radio" name="pf-pmode" value="${mode}" ${v.proxyMode === mode ? 'checked' : ''}><span>${esc(t(`proxy_${mode}`))}</span></label>`).join('')}</div>
          <div id="pf-saved" class="field" style="display:none"><label>${esc(t('f_proxy_select'))}</label><select class="select" id="pf-proxy-id">${state.proxies.map((x) => `<option value="${esc(x.id)}" ${v.proxyId === x.id ? 'selected' : ''}>${esc(x.name)} · ${x.type.toUpperCase()} ${esc(x.host)}:${x.port}${x.lastCheck && x.lastCheck.ok ? ` · ${esc(x.lastCheck.countryCode)} ${esc(x.lastCheck.ip)}` : ''}</option>`).join('')}</select>${state.proxies.length ? '' : `<div class="hint">${esc(t('no_proxies'))}</div>`}</div>
          <div id="pf-inline" style="display:none">${proxyFields('pfx', v.proxy || {})}</div>
        </div>
        <div class="field"><label>${esc(t('f_notes'))}</label><textarea class="input" id="bf-notes" rows="2">${esc(v.notes)}</textarea></div>
      </form>
      <div class="m-foot"><button class="btn outline" type="button" id="bf-cancel">${esc(t('cancel'))}</button><button class="btn primary" type="submit" form="bf" id="bf-save">${esc(p ? t('save') : t('create'))}</button></div>`);
    const updateMode = () => { const mode = $('input[name="pf-pmode"]:checked', m).value; $('#pf-saved', m).style.display = mode === 'saved' ? '' : 'none'; $('#pf-inline', m).style.display = mode === 'inline' ? '' : 'none'; };
    $$('input[name="pf-pmode"]', m).forEach((r) => r.addEventListener('change', updateMode)); updateMode();
    bindProxyFields('pfx', m);
    if (v.proxy && v.proxy.lastCheck && v.proxy.lastCheck.ok) { const out = $('#pfx-result', m); const lc = v.proxy.lastCheck; out.className = 'test-result full ok'; out.textContent = `✔ ${lc.ip} · ${lc.country} (${lc.countryCode}) · ${lc.city || ''} · ${lc.latency} ms`; }
    const syncSaved = () => { const px = state.proxies.find((x) => x.id === $('#pf-proxy-id', m).value); if (px && px.lastCheck && px.lastCheck.ok) applyGeoToProfileForm(m, px.lastCheck); };
    $('#pf-proxy-id', m).addEventListener('change', syncSaved);
    $$('input[name="pf-pmode"]', m).forEach((r) => r.addEventListener('change', () => { if (r.value === 'saved' && r.checked) syncSaved(); }));
    $('#pf-country', m).addEventListener('change', (e) => { const c = country(e.target.value); $('#pf-locale', m).value = c.locale; $('#pf-tz', m).value = c.timezone; });
    $('#bf-cancel', m).onclick = () => closeModal();
    $('#bf', m).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#bf-save', m); btn.disabled = true; btn.textContent = p ? t('saving') : t('creating');
      const mode = $('input[name="pf-pmode"]:checked', m).value;
      const input = {
        name: $('#bf-name', m).value, groupId: $('#bf-group', m).value || null,
        tags: $('#bf-tags', m).value.split(',').map((x) => x.trim()).filter(Boolean),
        browserId: $('#bf-browser', m).value, width: $('#bf-width', m).value, height: $('#bf-height', m).value, startUrl: $('#bf-url', m).value.trim(),
        country: $('#pf-country', m).value, locale: $('#pf-locale', m).value.trim(), timezone: $('#pf-tz', m).value.trim(), notes: $('#bf-notes', m).value,
        proxyMode: mode, proxyId: mode === 'saved' ? $('#pf-proxy-id', m).value : null,
        proxy: mode === 'inline' ? { ...readProxyFields('pfx', m), lastCheck: m.__lastProxyCheck || (v.proxy && v.proxy.lastCheck) || null } : null,
      };
      try {
        if (p) await call(api.browsers.update(p.id, input)); else await call(api.browsers.create(input));
        closeModal(); toast(t('toast_saved'), 'ok'); await reloadBrowsers();
      } catch (_) { btn.disabled = false; btn.textContent = p ? t('save') : t('create'); }
    };
  }

  // ------------------------------------------------------------ proxies view
  function renderProxies() {
    const root = $('#proxies-content');
    if (!state.proxies.length) { root.innerHTML = `<div class="empty"><div class="ill">${ICON.net}</div><h3>${esc(t('proxies_title'))}</h3><p>${esc(t('no_proxies'))}</p><button class="btn primary" id="px-empty-new">${esc(t('new_proxy'))}</button></div>`; $('#px-empty-new').onclick = () => openProxyModal(null); return; }
    const usedBy = (id) => [...state.profiles, ...state.browsers].filter((p) => p.proxyMode === 'saved' && p.proxyId === id);
    root.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t('col_name'))}</th><th>${esc(t('col_type'))}</th><th>${esc(t('col_address'))}</th><th>${esc(t('col_auth'))}</th><th>${esc(t('col_status'))}</th><th>${esc(t('col_ip'))}</th><th>${esc(t('col_used'))}</th><th>${esc(t('col_actions'))}</th></tr></thead><tbody>` +
      state.proxies.map((x) => {
        const lc = x.lastCheck;
        const status = !lc ? `<span class="badge">${esc(t('never_checked'))}</span>` : lc.ok ? `<span class="badge ok">● ${esc(t('ok'))} · ${esc(t('latency', { ms: lc.latency }))}</span>` : `<span class="badge bad" title="${esc(errMsg(lc.error))}">● ${esc(t('failed'))}</span>`;
        const geo = lc && lc.ok ? `${flag(lc.countryCode)}${esc(lc.ip)} · ${esc(lc.city || '')} ${esc(lc.country || '')}` : (lc && !lc.ok ? `<span style="color:var(--text-3)">${esc(errMsg(lc.error))}</span>` : '—');
        const used = usedBy(x.id);
        return `<tr data-pid="${esc(x.id)}"><td><b>${esc(x.name)}</b></td><td><span class="badge type">${esc(x.type)}</span></td><td class="mono">${esc(x.host)}:${x.port}</td><td class="mono">${x.username ? esc(x.username) + ' / ••••' : '—'}</td><td>${status}</td><td>${geo}</td>
          <td>${used.length ? used.map((p) => `<span class="chip" title="${esc(p.name)}">${p.serial}. ${esc(p.name)}</span>`).join(' ') : '—'}</td>
          <td><div class="actions" style="display:flex;gap:6px"><button class="btn outline sm" data-px="check">${ICON.check}<span>${esc(t('check'))}</span></button><button class="btn outline sm" data-px="edit">${ICON.edit}</button><button class="btn danger sm" data-px="delete">${ICON.trash}</button></div></td></tr>`;
      }).join('') + '</tbody></table></div>';
    $$('[data-pid]', root).forEach((row) => {
      const id = row.dataset.pid; const x = state.proxies.find((y) => y.id === id);
      $('[data-px="check"]', row).onclick = () => checkProxy(id, row);
      $('[data-px="edit"]', row).onclick = () => openProxyModal(id);
      $('[data-px="delete"]', row).onclick = async () => { if (!(await confirmModal(t('confirm_delete_proxy', { name: x.name }), t('yes_delete'), true))) return; try { await call(api.proxies.delete(id)); toast(t('toast_deleted'), 'ok'); await reloadProxies(); renderProfiles(); } catch (_) { /* shown */ } };
    });
  }
  async function checkProxy(id, row) {
    const btn = row && $('[data-px="check"]', row); if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`; }
    try { await call(api.proxies.check(id)); } catch (_) { /* shown */ }
    await reloadProxies(); renderProfiles(); renderBrowsers();
  }
  function openProxyModal(id) {
    const x = id ? state.proxies.find((y) => y.id === id) : null;
    const m = openModal(`<div class="m-head"><h3>${esc(x ? t('proxy_modal_edit') : t('proxy_modal_new'))}</h3></div><form class="m-body" id="pxf">
      <div class="field"><label>${esc(t('f_proxy_name'))}</label><input class="input" id="px-name" value="${esc(x ? x.name : '')}" maxlength="60"></div>${proxyFields('px', x || {})}</form>
      <div class="m-foot"><button class="btn outline" type="button" id="px-cancel">${esc(t('cancel'))}</button><button class="btn primary" type="submit" form="pxf" id="px-save">${esc(x ? t('save') : t('create'))}</button></div>`);
    bindProxyFields('px', m);
    $('#px-cancel', m).onclick = () => closeModal();
    $('#pxf', m).onsubmit = async (e) => {
      e.preventDefault();
      const input = { name: $('#px-name', m).value, ...readProxyFields('px', m), resetCheck: true };
      try { if (x) await call(api.proxies.update(x.id, input)); else await call(api.proxies.create(input)); closeModal(); toast(t('toast_saved'), 'ok'); await reloadProxies(); renderProfiles(); } catch (_) { /* shown */ }
    };
  }
  function openImportModal() {
    const m = openModal(`<div class="m-head"><h3>${esc(t('import_title'))}</h3></div><div class="m-body"><div class="hint" style="font-size:12px;color:var(--text-2)">${esc(t('import_hint'))}</div><textarea class="input" id="im-text" rows="10" placeholder="1.2.3.4:8080:user:pass&#10;socks5://user:pass@5.6.7.8:1080" style="font-family:var(--mono)"></textarea></div>
      <div class="m-foot"><button class="btn outline" id="im-cancel">${esc(t('cancel'))}</button><button class="btn primary" id="im-ok">${esc(t('import'))}</button></div>`);
    $('#im-cancel', m).onclick = () => closeModal();
    $('#im-ok', m).onclick = async () => { try { const created = await call(api.proxies.bulkCreate($('#im-text', m).value)); closeModal(); toast(t('toast_imported', { n: created.length }), created.length ? 'ok' : 'warn'); await reloadProxies(); } catch (_) { /* shown */ } };
  }

  // ------------------------------------------------------------ settings view
  async function renderSettings() {
    const s = state.sdk; const root = $('#settings-content');
    const yesno = (ok, label) => `<span class="badge ${ok ? 'ok' : 'bad'}">${ok ? '●' : '○'} ${esc(label)}</span>`;
    const apis = [36, 35, 34, 33, 32, 31, 30, 29, 28];
    root.innerHTML = `
      <div class="panel"><h4>${esc(t('language'))}</h4><div class="kv"><div class="k">${esc(t('language'))}</div><div class="v"><select class="select" id="st-lang"><option value="pt-BR" ${I18N.getLang() === 'pt-BR' ? 'selected' : ''}>Português (Brasil)</option><option value="en" ${I18N.getLang() === 'en' ? 'selected' : ''}>English</option></select></div></div></div>
      <div class="panel"><h4>${esc(t('upd_section'))}</h4><div class="kv">
        <div class="k">${esc(t('upd_current'))}</div><div class="v">v${esc(state.info.version)}</div>
        <div class="k">${esc(t('col_status'))}</div><div class="v" id="upd-status">${esc(updateText())}</div>
        <div class="k"></div><div class="v"><button class="btn outline sm" id="upd-check" ${state.update.state === 'checking' || state.update.state === 'downloading' ? 'disabled' : ''}>${esc(t('upd_check'))}</button>${state.update.state === 'downloaded' ? `<button class="btn primary sm" id="upd-install">${esc(t('upd_install'))}</button>` : ''}</div>
      </div></div>
      <div class="panel"><h4>${esc(t('browser_section'))}</h4><div class="kv">
        <div class="k">${esc(t('browsers_found'))}</div><div class="v" style="flex-wrap:wrap">${state.detectedBrowsers.length ? state.detectedBrowsers.map((b) => `<span class="chip" title="${esc(b.path)}">${esc(b.name)}</span>`).join('') : yesno(false, t('not_found'))}</div>
        <div class="k">${esc(t('browser_path'))}</div><div class="v"><input class="input" id="st-browser" value="${esc(state.settings.browserPath || '')}" style="flex:1" placeholder="chrome.exe"><button class="btn outline sm" id="st-browser-browse">${esc(t('browse'))}</button><button class="btn primary sm" id="st-browser-save">${esc(t('save_path'))}</button></div>
      </div></div>
      <div class="panel"><h4>${esc(t('sdk_section'))}</h4>
        <div class="kv">
          <div class="k">${esc(t('sdk_path'))}</div><div class="v"><input class="input" id="st-sdk" value="${esc(s.sdkPath)}" style="flex:1"><button class="btn outline sm" id="st-browse">${esc(t('browse'))}</button><button class="btn primary sm" id="st-save-sdk">${esc(t('save_path'))}</button></div>
          <div class="k">${esc(t('sdk_emulator'))}</div><div class="v">${yesno(s.hasEmulator, s.hasEmulator ? t('found') : t('not_found'))}<span style="color:var(--text-3);font-size:12px">${esc(s.emulatorPath)}</span></div>
          <div class="k">${esc(t('sdk_adb'))}</div><div class="v">${yesno(s.hasAdb, s.hasAdb ? t('found') : t('not_found'))}<span style="color:var(--text-3);font-size:12px">${esc(s.adbPath)}</span></div>
          <div class="k">${esc(t('sdk_images'))}</div><div class="v" style="flex-wrap:wrap">${s.images.length ? s.images.map((i) => `<span class="chip">Android ${esc(state.meta.versions[i.api] || i.api)} · ${esc(i.tagDisplay)} · ${esc(i.abi)}</span>`).join('') : yesno(false, t('not_found'))}</div>
          <div class="k">${esc(t('java'))}</div><div class="v" id="st-java"><span class="spin"></span></div>
          <div class="k">${esc(t('avd_home'))}</div><div class="v"><span style="flex:1;font-size:12px">${esc(state.info.avdHome)}</span><button class="btn outline sm" data-open="${esc(state.info.avdHome)}">${esc(t('open'))}</button></div>
          <div class="k">${esc(t('data_dir'))}</div><div class="v"><span style="flex:1;font-size:12px">${esc(state.info.dataDir)}</span><button class="btn outline sm" data-open="${esc(state.info.dataDir)}">${esc(t('open'))}</button></div>
        </div>
      </div>
      <div class="panel"><h4>${esc(t('install_section'))}</h4>
        <div class="note">${esc(t('install_note'))}</div>
        <div class="form-grid">
          <div class="field"><label>${esc(t('f_api'))}</label><select class="select" id="st-api">${apis.map((a) => `<option value="${a}" ${a === 34 ? 'selected' : ''}>Android ${esc(state.meta.versions[a] || a)} (API ${a})</option>`).join('')}</select></div>
          <div class="field"><label>${esc(t('f_tag'))}</label><select class="select" id="st-tag"><option value="google_apis">${esc(t('tag_google_apis'))}</option><option value="google_apis_playstore">${esc(t('tag_playstore'))}</option><option value="default">${esc(t('tag_default'))}</option></select></div>
        </div>
        <div style="display:flex;gap:10px;align-items:center"><button class="btn primary" id="st-install" ${state.installing ? 'disabled' : ''}>${state.installing ? '<span class="spin"></span>' : ''}<span>${esc(state.installing ? t('installing') : t('install_now'))}</span></button><span id="st-install-msg" style="font-size:13px;color:var(--text-2)"></span></div>
        <div class="console" id="st-console" style="${state.installLog.length ? '' : 'display:none'}">${esc(state.installLog.join('\n'))}</div>
      </div>`;
    $('#upd-check', root).onclick = async () => { state.update = { ...state.update, state: 'checking' }; renderSettings(); await call(api.update.check(), { silent: true }).catch(() => {}); };
    const ui = $('#upd-install', root); if (ui) ui.onclick = () => api.update.install();
    $('#st-browser-browse', root).onclick = async () => { const r = await call(api.dialog.openFile({ title: t('browser_path'), filters: [{ name: 'Browser', extensions: state.info.platform === 'win32' ? ['exe'] : ['*'] }] })); if (r && r.path) $('#st-browser', root).value = r.path; };
    $('#st-browser-save', root).onclick = async () => { state.settings = await call(api.settings.set({ browserPath: $('#st-browser', root).value.trim() })); state.detectedBrowsers = await call(api.browsers.detect()); toast(t('toast_saved'), 'ok'); renderSettings(); renderBrowsers(); };
    $('#st-lang', root).onchange = async (e) => { await call(api.settings.set({ language: e.target.value })); I18N.setLang(e.target.value); applyI18n(); renderAll(); };
    $('#st-browse', root).onclick = async () => { const p = await call(api.dialog.pickFolder(t('sdk_path'))); if (p) $('#st-sdk', root).value = p; };
    $('#st-save-sdk', root).onclick = async () => { await call(api.settings.set({ sdkPath: $('#st-sdk', root).value.trim() })); await reloadSdk(); renderProfiles(); toast(t('toast_saved'), 'ok'); };
    $$('[data-open]', root).forEach((b) => { b.onclick = () => api.shell.openPath(b.dataset.open); });
    $('#st-install', root).onclick = () => runInstall($('#st-api', root).value, $('#st-tag', root).value);
    const java = await call(api.sdk.java(), { silent: true }).catch(() => null);
    const jv = $('#st-java', root); if (!jv) return;
    jv.innerHTML = (java ? `${yesno(true, `${t('found')} · ${java.version}`)}<span style="font-size:12px;color:var(--text-3)">${esc(java.home || 'PATH')}</span>` : `${yesno(false, t('not_found'))}<span style="font-size:12px;color:var(--text-2)">${esc(t('java_missing'))}</span><button class="btn outline sm" id="st-java-dl">${esc(t('java_download'))}</button>`)
      + `<div style="flex-basis:100%;display:flex;gap:8px;margin-top:6px"><input class="input" id="st-java-home" value="${esc(state.settings.javaHome || '')}" placeholder="${esc(t('java_home_ph'))}" style="flex:1"><button class="btn outline sm" id="st-java-browse">${esc(t('browse'))}</button><button class="btn primary sm" id="st-java-save">${esc(t('save_path'))}</button></div>`;
    jv.style.flexWrap = 'wrap';
    const dl = $('#st-java-dl', root); if (dl) dl.onclick = () => api.shell.openExternal('https://adoptium.net/temurin/releases/?version=17');
    $('#st-java-browse', root).onclick = async () => { const p = await call(api.dialog.pickFolder(t('java_home_ph'))); if (p) $('#st-java-home', root).value = p; };
    $('#st-java-save', root).onclick = async () => { state.settings = await call(api.settings.set({ javaHome: $('#st-java-home', root).value.trim() })); toast(t('toast_saved'), 'ok'); renderSettings(); };
  }
  function updateText() {
    const u = state.update;
    if (u.state === 'unsupported') return t('upd_unsupported');
    if (u.state === 'checking') return t('upd_checking');
    if (u.state === 'none') return t('upd_none');
    if (u.state === 'downloading') return t('upd_downloading', { version: u.version || '', percent: u.percent || 0 });
    if (u.state === 'downloaded') return t('upd_downloaded', { version: u.version || '' });
    if (u.state === 'error') return t('upd_error', { error: u.error || '' });
    return t('upd_idle');
  }
  async function runInstall(apiLevel, tag) {
    if (state.installing) return;
    state.installing = true; state.installLog = [];
    renderSettings();
    const c = $('#st-console'); if (c) c.style.display = '';
    try {
      await call(api.sdk.install({ api: parseInt(apiLevel, 10), tag, sdkPath: $('#st-sdk').value.trim() }));
      state.installLog.push(t('install_done'));
      toast(t('install_done'), 'ok', 8000);
    } catch (err) {
      state.installLog.push(t('install_failed', { err: errMsg(err.message) }));
      toast(t('install_failed', { err: errMsg(err.message) }), 'err', 9000);
    } finally {
      state.installing = false;
      await reloadSdk(); renderProfiles();
    }
  }
  function appendInstallLog(line) {
    state.installLog.push(line); if (state.installLog.length > 2000) state.installLog.shift();
    const c = $('#st-console'); if (c) { c.style.display = ''; c.textContent += (c.textContent ? '\n' : '') + line; c.scrollTop = c.scrollHeight; }
  }

  // ------------------------------------------------------------ help view
  function renderHelp() {
    const pt = I18N.getLang() === 'pt-BR';
    $('#help-content').innerHTML = pt ? `
      <h3>Como funciona</h3>
      <p>Cada <b>perfil</b> é um telefone Android virtual completo e isolado (próprio armazenamento, apps, logins), rodando no emulador oficial do Google. Você pode ligar vários ao mesmo tempo, cada um com seu <b>proxy</b>, <b>país</b>, <b>fuso horário</b> e <b>idioma</b>.</p>
      <h3>Primeiros passos</h3>
      <ol><li>Vá em <b>Configurações</b> e clique em <b>Baixar e instalar</b> (requer Java JDK 17 — há um botão para baixar).</li><li>Cadastre seus proxies em <b>Proxies</b> (HTTP, HTTPS, SOCKS5, com ou sem usuário/senha) e clique em <b>Verificar</b> para ver o IP e o país.</li><li>Clique em <b>Novo perfil</b>, escolha modelo, versão do Android, país e proxy.</li><li>Clique em <b>Iniciar</b>. A janela do telefone abre em alguns segundos.</li></ol>
      <h3>Proxy</h3>
      <p>Todo tráfego do telefone passa pela ponte de proxy local do DroidDesk, que encaminha para o seu proxy (inclusive SOCKS5 com autenticação, que o emulador não suporta nativamente). Perfis sem proxy usam a rede do computador (<code>LAN</code>).</p>
      <h3>Requisitos</h3>
      <ul><li>Windows 10/11 64-bit, macOS ou Linux.</li><li>Virtualização ativada na BIOS (Intel VT-x / AMD-V).</li><li>No Windows: ative <b>Windows Hypervisor Platform</b> (Painel de Controle → Programas → Ativar ou desativar recursos do Windows).</li><li>8 GB de RAM ou mais (cada telefone usa 2–4 GB).</li></ul>
      <h3>Dicas</h3>
      <ul><li><b>Cold boot</b> (menu ⋮) reinicia o telefone do zero caso ele trave ao abrir.</li><li>Dê dois cliques no cartão para editar.</li><li>Os dados dos telefones ficam na pasta AVD (veja em Configurações). Faça backup dela se quiser preservar as contas.</li></ul>` : `
      <h3>How it works</h3>
      <p>Each <b>profile</b> is a complete, isolated virtual Android phone (own storage, apps, logins) running on Google's official emulator. Run several at once, each with its own <b>proxy</b>, <b>country</b>, <b>timezone</b> and <b>language</b>.</p>
      <h3>Getting started</h3>
      <ol><li>Go to <b>Settings</b> and click <b>Download & install</b> (requires Java JDK 17 — there is a download button).</li><li>Add proxies in <b>Proxies</b> (HTTP, HTTPS, SOCKS5, with or without auth) and click <b>Check</b> to see IP and country.</li><li>Click <b>New profile</b>, choose model, Android version, country and proxy.</li><li>Click <b>Start</b>. The phone window opens in a few seconds.</li></ol>
      <h3>Proxy</h3>
      <p>All phone traffic goes through DroidDesk's local proxy bridge, which forwards to your proxy (including authenticated SOCKS5, which the emulator does not support natively). Profiles without a proxy use the computer's network (<code>LAN</code>).</p>
      <h3>Requirements</h3>
      <ul><li>Windows 10/11 64-bit, macOS or Linux.</li><li>Virtualization enabled in BIOS (Intel VT-x / AMD-V).</li><li>On Windows: enable <b>Windows Hypervisor Platform</b> (Control Panel → Programs → Turn Windows features on or off).</li><li>8 GB RAM or more (each phone uses 2–4 GB).</li></ul>
      <h3>Tips</h3>
      <ul><li><b>Cold boot</b> (⋮ menu) restarts the phone from scratch if it hangs on start.</li><li>Double-click a card to edit.</li><li>Phone data lives in the AVD folder (see Settings). Back it up to preserve accounts.</li></ul>`;
  }

  // ------------------------------------------------------------ navigation & global events
  function showView(name) {
    state.view = name;
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    $$('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'settings') reloadSdk().then(renderSettings);
    if (name === 'proxies') renderProxies();
    if (name === 'browsers') renderBrowsers();
  }
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-view]'); if (nav) { showView(nav.dataset.view); return; }
    const act = e.target.closest('[data-action="groups"]'); if (act) openGroupsModal();
  });
  $('#filter-group').addEventListener('change', (e) => { state.filterGroup = e.target.value; renderProfiles(); });
  $('#filter-text').addEventListener('input', (e) => { state.filterText = e.target.value; renderProfiles(); });
  $$('#view-mode button').forEach((b) => { b.onclick = async () => { state.viewMode = b.dataset.mode; $$('#view-mode button').forEach((x) => x.classList.toggle('active', x === b)); renderProfiles(); await api.settings.set({ viewMode: state.viewMode }); }; });
  $('#btn-new-profile').onclick = () => openProfileModal(null);
  $('#btn-refresh').onclick = async () => { await reloadSdk(); await reloadGroups(); await reloadProxies(); await reloadProfiles(); };
  $$('[data-bulk]').forEach((b) => { b.onclick = () => bulk(b.dataset.bulk); });
  $('#select-all').addEventListener('change', (e) => { const list = filteredProfiles(); list.forEach((p) => { if (e.target.checked) state.selected.add(p.id); else state.selected.delete(p.id); }); renderProfiles(); });
  $('#bfilter-group').addEventListener('change', (e) => { state.bfilterGroup = e.target.value; renderBrowsers(); });
  $('#bfilter-text').addEventListener('input', (e) => { state.bfilterText = e.target.value; renderBrowsers(); });
  $('#btn-new-browser').onclick = () => openBrowserModal(null);
  $('#btn-brefresh').onclick = async () => { state.detectedBrowsers = await call(api.browsers.detect()); await reloadGroups(); await reloadProxies(); await reloadBrowsers(); };
  $$('[data-bbulk]').forEach((b) => { b.onclick = () => bulkBrowsers(b.dataset.bbulk); });
  $('#bselect-all').addEventListener('change', (e) => { filteredBrowsers().forEach((p) => { if (e.target.checked) state.bselected.add(p.id); else state.bselected.delete(p.id); }); renderBrowsers(); });
  api.browsers.onStatus((e) => {
    const p = state.browsers.find((x) => x.id === e.profileId); if (!p) return;
    p.status = e.status;
    if (e.status === 'stopped' && e.detail) toast(`${p.name}: ${t(`exit_${e.detail}`) !== `exit_${e.detail}` ? t(`exit_${e.detail}`) : errMsg(e.detail)}`, 'err', 8000);
    renderBrowsers();
  });
  api.browsers.onLog((e) => appendLog(e, 'browser'));
  $('#btn-new-proxy').onclick = () => openProxyModal(null);
  $('#btn-import-proxies').onclick = openImportModal;
  $('#btn-check-all').onclick = async () => { for (const x of state.proxies) { try { await call(api.proxies.check(x.id), { silent: true }); } catch (_) { /* ignore */ } } await reloadProxies(); renderProfiles(); };
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { if (state.view === 'profiles') { e.preventDefault(); openProfileModal(null); } else if (state.view === 'browsers') { e.preventDefault(); openBrowserModal(null); } } });

  api.profiles.onStatus((e) => {
    const p = state.profiles.find((x) => x.id === e.profileId);
    if (!p) return;
    p.status = e.status;
    if (e.status === 'stopped' && e.detail) toast(`${p.name}: ${t(`exit_${e.detail}`) !== `exit_${e.detail}` ? t(`exit_${e.detail}`) : e.detail}`, 'err', 9000);
    else if (e.status === 'stopped') toast(t('toast_stopped', { name: p.name }), 'info');
    else if (e.status === 'running' && e.detail) toast(`${p.name}: ${t(`exit_${e.detail}`)}`, 'warn');
    renderProfiles();
  });
  api.profiles.onLog(appendLog);
  api.sdk.onLog(appendInstallLog);
  api.update.onStatus((u) => {
    const prev = state.update.state;
    state.update = u;
    if (u.state === 'downloading' && prev !== 'downloading') toast(t('toast_upd_available', { version: u.version }), 'info', 6000);
    if (u.state === 'downloaded' && prev !== 'downloaded') toast(t('toast_upd_ready', { version: u.version }), 'ok', 8000);
    if (state.view === 'settings') renderSettings();
  });
  call(api.update.status(), { silent: true }).then((u) => { state.update = u; if (state.view === 'settings') renderSettings(); }).catch(() => {});

  loadAll().catch((err) => { toast(`Init error: ${err.message}`, 'err', 10000); });
})();
