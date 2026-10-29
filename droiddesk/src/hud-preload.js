'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hud', {
  onUpdate: (cb) => ipcRenderer.on('hud:update', (_e, d) => cb(d)),
  close: () => ipcRenderer.send('hud:close'),
});
