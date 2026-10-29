'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Where AVDs live. Honour the same variables the emulator itself uses.
function avdHome(custom) {
  if (custom) return custom;
  if (process.env.ANDROID_AVD_HOME) return process.env.ANDROID_AVD_HOME;
  const base = process.env.ANDROID_USER_HOME || (process.env.ANDROID_SDK_HOME
    ? path.join(process.env.ANDROID_SDK_HOME, '.android')
    : path.join(os.homedir(), '.android'));
  return path.join(base, 'avd');
}

function iniText(obj) {
  return Object.keys(obj).sort().map((k) => `${k}=${obj[k]}`).join('\n') + '\n';
}

function cpuArchForAbi(abi) {
  if (abi.startsWith('arm64')) return 'arm64';
  if (abi.startsWith('arm')) return 'arm';
  if (abi === 'x86') return 'x86';
  return 'x86_64';
}

/**
 * Create an AVD on disk without avdmanager (no Java needed).
 * @param {object} o
 * @param {string} o.avdId          folder-safe id, e.g. dd_a1b2c3
 * @param {string} o.displayName
 * @param {object} o.image          entry from sdk.listSystemImages
 * @param {object} o.device         entry from meta.DEVICES
 * @param {number} o.ram            MB
 * @param {string} [o.home]         custom AVD home
 */
function createAvd(o) {
  const home = avdHome(o.home);
  const dir = path.join(home, `${o.avdId}.avd`);
  fs.mkdirSync(dir, { recursive: true });
  const cfg = {
    'AvdId': o.avdId,
    'PlayStore.enabled': o.image.playStore ? 'true' : 'false',
    'abi.type': o.image.abi,
    'avd.ini.displayname': o.displayName,
    'avd.ini.encoding': 'UTF-8',
    'disk.dataPartition.size': `${o.storage || 8}G`,
    'fastboot.chosenSnapshotFile': '',
    'fastboot.forceChosenSnapshotBoot': 'no',
    'fastboot.forceColdBoot': 'no',
    'fastboot.forceFastBoot': 'yes',
    'hw.accelerometer': 'yes',
    'hw.arc': 'false',
    'hw.audioInput': 'yes',
    'hw.battery': 'yes',
    'hw.camera.back': 'virtualscene',
    'hw.camera.front': 'emulated',
    'hw.cpu.arch': cpuArchForAbi(o.image.abi),
    'hw.cpu.ncore': String(o.cores || 4),
    'hw.dPad': 'no',
    'hw.device.manufacturer': o.device.manufacturer,
    'hw.device.name': o.device.id,
    'hw.gps': 'yes',
    'hw.gpu.enabled': 'yes',
    'hw.gpu.mode': 'auto',
    'hw.initialOrientation': 'Portrait',
    'hw.keyboard': 'yes',
    'hw.lcd.density': String(o.device.density),
    'hw.lcd.height': String(o.device.height),
    'hw.lcd.width': String(o.device.width),
    'hw.mainKeys': 'no',
    'hw.ramSize': String(o.ram || o.device.ram),
    'hw.sdCard': 'yes',
    'hw.sensors.orientation': 'yes',
    'hw.sensors.proximity': 'yes',
    'hw.trackBall': 'no',
    'image.sysdir.1': o.image.sysdir,
    'runtime.network.latency': 'none',
    'runtime.network.speed': 'full',
    'sdcard.size': '512M',
    'showDeviceFrame': 'no',
    'skin.dynamic': 'yes',
    'skin.name': `${o.device.width}x${o.device.height}`,
    'skin.path': '_no_skin',
    'tag.display': o.image.tagDisplay,
    'tag.id': o.image.tag,
    'vm.heapSize': '256',
  };
  fs.writeFileSync(path.join(dir, 'config.ini'), iniText(cfg), 'utf8');
  fs.writeFileSync(path.join(home, `${o.avdId}.ini`), [
    'avd.ini.encoding=UTF-8',
    `path=${dir}`,
    `path.rel=avd/${o.avdId}.avd`,
    `target=${o.image.platform}`,
    '',
  ].join('\n'), 'utf8');
  return { dir, home };
}

function updateDisplayName(avdId, displayName, home) {
  const file = path.join(avdHome(home), `${avdId}.avd`, 'config.ini');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter((l) => !l.startsWith('avd.ini.displayname='));
  lines.push(`avd.ini.displayname=${displayName}`);
  fs.writeFileSync(file, lines.filter(Boolean).join('\n') + '\n', 'utf8');
}

// Asynchronous so a multi-GB phone never blocks the UI. The emulator may still
// hold file locks for a moment after exiting (Windows), hence the retries.
async function deleteAvd(avdId, home) {
  const h = avdHome(home);
  await fs.promises.rm(path.join(h, `${avdId}.avd`), { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
  await fs.promises.rm(path.join(h, `${avdId}.ini`), { force: true, maxRetries: 12, retryDelay: 250 });
}

function avdLocked(avdId, home) {
  return fs.existsSync(path.join(avdHome(home), `${avdId}.avd`, 'hardware-qemu.ini.lock'));
}

function avdExists(avdId, home) {
  return fs.existsSync(path.join(avdHome(home), `${avdId}.avd`, 'config.ini'));
}

function avdSizeBytes(avdId, home) {
  const dir = path.join(avdHome(home), `${avdId}.avd`);
  let total = 0;
  const walk = (d) => {
    for (const name of (() => { try { return fs.readdirSync(d); } catch (_) { return []; } })()) {
      const p = path.join(d, name);
      try {
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p); else total += st.size;
      } catch (_) { /* ignore */ }
    }
  };
  walk(dir);
  return total;
}

module.exports = { avdHome, createAvd, deleteAvd, avdExists, avdLocked, updateDisplayName, avdSizeBytes };
