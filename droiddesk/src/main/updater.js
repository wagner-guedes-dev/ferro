'use strict';
const { app, dialog } = require('electron');

// Auto-update through GitHub Releases (electron-updater). The portable build
// cannot update itself, so it only reports that an update exists.
function setupUpdater({ send, getWindow }) {
  let autoUpdater = null;
  try { ({ autoUpdater } = require('electron-updater')); } catch (_) { return { check: async () => ({ state: 'unsupported' }), install: () => {} }; }

  const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  const supported = app.isPackaged && !portable;
  let status = { state: supported ? 'idle' : 'unsupported', version: null, percent: 0, error: '', portable };
  let manual = false;
  let timer = null;

  const update = (patch) => { status = { ...status, ...patch }; send('update:status', status); };

  if (!supported) return { check: async () => status, install: () => {}, status: () => status };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => update({ state: 'checking', error: '' }));
  autoUpdater.on('update-available', (info) => update({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('update-not-available', (info) => update({ state: 'none', version: info ? info.version : null }));
  autoUpdater.on('download-progress', (p) => update({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('error', (err) => {
    // Offline or GitHub unreachable: stay quiet unless the user asked for a check.
    update({ state: manual ? 'error' : 'idle', error: err && err.message ? err.message.split('\n')[0] : 'UPDATE_ERROR' });
    manual = false;
  });
  autoUpdater.on('update-downloaded', async (info) => {
    update({ state: 'downloaded', version: info.version, percent: 100 });
    const win = getWindow();
    const r = await dialog.showMessageBox(win || undefined, {
      type: 'info',
      title: 'DroidDesk',
      message: `A versão ${info.version} do DroidDesk foi baixada.`,
      detail: 'Deseja reiniciar agora para instalar? Feche os telefones abertos antes. Se escolher "Depois", a atualização será instalada quando você fechar o app.',
      buttons: ['Reiniciar e instalar', 'Depois'],
      defaultId: 0,
      cancelId: 1,
    });
    if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });

  const check = async (isManual) => {
    manual = !!isManual;
    try { await autoUpdater.checkForUpdates(); } catch (_) { /* reported through the error event */ }
    return status;
  };

  // First check shortly after launch, then every 4 hours.
  setTimeout(() => check(false), 8000);
  timer = setInterval(() => check(false), 4 * 60 * 60 * 1000);
  app.on('before-quit', () => { if (timer) clearInterval(timer); });

  return {
    check: () => check(true),
    install: () => { if (status.state === 'downloaded') setImmediate(() => autoUpdater.quitAndInstall(false, true)); },
    status: () => status,
  };
}

module.exports = { setupUpdater };
