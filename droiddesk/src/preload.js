'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel, cb) => {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('droid', {
  app: { info: () => invoke('app:info') },
  settings: { get: () => invoke('settings:get'), set: (patch) => invoke('settings:set', patch) },
  shell: { openExternal: (url) => invoke('shell:openExternal', url), openPath: (p) => invoke('shell:openPath', p) },
  dialog: {
    pickFolder: (title) => invoke('dialog:pickFolder', title),
    saveFile: (opts) => invoke('dialog:saveFile', opts),
    openFile: (opts) => invoke('dialog:openFile', opts),
  },
  meta: { all: () => invoke('meta:all') },
  update: { status: () => invoke('update:status'), check: () => invoke('update:check'), install: () => invoke('update:install'), onStatus: (cb) => on('update:status', cb) },
  sdk: {
    status: () => invoke('sdk:status'),
    java: () => invoke('sdk:java'),
    install: (opts) => invoke('sdk:install', opts),
    onLog: (cb) => on('sdk:log', cb),
  },
  groups: {
    list: () => invoke('groups:list'),
    create: (name) => invoke('groups:create', name),
    rename: (id, name) => invoke('groups:rename', id, name),
    delete: (id) => invoke('groups:delete', id),
  },
  proxies: {
    list: () => invoke('proxies:list'),
    create: (p) => invoke('proxies:create', p),
    bulkCreate: (text) => invoke('proxies:bulkCreate', text),
    update: (id, p) => invoke('proxies:update', id, p),
    delete: (id) => invoke('proxies:delete', id),
    check: (id) => invoke('proxies:check', id),
    test: (p) => invoke('proxies:test', p),
    parse: (s) => invoke('proxies:parse', s),
  },
  browsers: {
    detect: () => invoke('browsers:detect'),
    list: () => invoke('browsers:list'),
    create: (p) => invoke('browsers:create', p),
    update: (id, p) => invoke('browsers:update', id, p),
    move: (ids, groupId) => invoke('browsers:move', ids, groupId),
    delete: (ids) => invoke('browsers:delete', ids),
    start: (id) => invoke('browsers:start', id),
    stop: (id) => invoke('browsers:stop', id),
    log: (id) => invoke('browsers:log', id),
    size: (id) => invoke('browsers:size', id),
    folder: (id) => invoke('browsers:folder', id),
    checkProxy: (id) => invoke('browsers:checkProxy', id),
    onStatus: (cb) => on('browser:status', cb),
    onLog: (cb) => on('browser:log', cb),
  },
  profiles: {
    list: () => invoke('profiles:list'),
    statuses: () => invoke('profiles:statuses'),
    create: (p) => invoke('profiles:create', p),
    update: (id, p) => invoke('profiles:update', id, p),
    move: (ids, groupId) => invoke('profiles:move', ids, groupId),
    delete: (ids) => invoke('profiles:delete', ids),
    start: (id, opts) => invoke('profiles:start', id, opts),
    stop: (id) => invoke('profiles:stop', id),
    log: (id) => invoke('profiles:log', id),
    size: (id) => invoke('profiles:size', id),
    export: (ids) => invoke('profiles:export', ids),
    checkProxy: (id) => invoke('profiles:checkProxy', id),
    onStatus: (cb) => on('profile:status', cb),
    onLog: (cb) => on('profile:log', cb),
  },
});
