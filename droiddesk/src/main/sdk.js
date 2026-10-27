'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const https = require('https');
const http = require('http');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

const CMDLINE_TOOLS_BUILD = '13114758';
const CMDLINE_TOOLS_URL = `https://dl.google.com/android/repository/commandlinetools-${IS_WIN ? 'win' : IS_MAC ? 'mac' : 'linux'}-${CMDLINE_TOOLS_BUILD}_latest.zip`;

function exe(name) { return IS_WIN ? `${name}.exe` : name; }

function defaultSdkCandidates(settingsPath) {
  const home = os.homedir();
  const list = [];
  if (settingsPath) list.push(settingsPath);
  if (process.env.ANDROID_HOME) list.push(process.env.ANDROID_HOME);
  if (process.env.ANDROID_SDK_ROOT) list.push(process.env.ANDROID_SDK_ROOT);
  if (IS_WIN) {
    if (process.env.LOCALAPPDATA) list.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
    list.push(path.join(home, 'AppData', 'Local', 'Android', 'Sdk'));
  } else if (IS_MAC) {
    list.push(path.join(home, 'Library', 'Android', 'sdk'));
  } else {
    list.push(path.join(home, 'Android', 'Sdk'));
    list.push(path.join(home, 'android-sdk'));
    list.push('/opt/android-sdk');
  }
  return [...new Set(list.filter(Boolean))];
}

function defaultSdkInstallPath() {
  const home = os.homedir();
  if (IS_WIN) return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Android', 'Sdk');
  if (IS_MAC) return path.join(home, 'Library', 'Android', 'sdk');
  return path.join(home, 'Android', 'Sdk');
}

function parseProperties(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch (_) { /* ignore */ }
  return out;
}

// Scan <sdk>/system-images/android-XX/<tag>/<abi>/ for installed images.
function listSystemImages(sdkPath) {
  const root = path.join(sdkPath, 'system-images');
  const images = [];
  if (!fs.existsSync(root)) return images;
  for (const platform of safeReaddir(root)) {
    const platformDir = path.join(root, platform);
    for (const tag of safeReaddir(platformDir)) {
      const tagDir = path.join(platformDir, tag);
      for (const abi of safeReaddir(tagDir)) {
        const abiDir = path.join(tagDir, abi);
        if (!fs.existsSync(path.join(abiDir, 'system.img'))) continue;
        const props = parseProperties(path.join(abiDir, 'source.properties'));
        const api = parseInt(props['AndroidVersion.ApiLevel'] || (platform.match(/android-(\d+)/) || [])[1], 10);
        images.push({
          id: `system-images;${platform};${tag};${abi}`,
          platform,
          tag,
          abi,
          api: Number.isFinite(api) ? api : 0,
          tagDisplay: props['SystemImage.TagDisplay'] || tag,
          sysdir: `system-images/${platform}/${tag}/${abi}/`,
          playStore: tag.includes('playstore'),
        });
      }
    }
  }
  images.sort((a, b) => b.api - a.api || a.tag.localeCompare(b.tag));
  return images;
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir).filter((n) => !n.startsWith('.')); } catch (_) { return []; }
}

function sdkmanagerPath(sdkPath) {
  const candidates = [
    path.join(sdkPath, 'cmdline-tools', 'latest', 'bin', IS_WIN ? 'sdkmanager.bat' : 'sdkmanager'),
    path.join(sdkPath, 'cmdline-tools', 'bin', IS_WIN ? 'sdkmanager.bat' : 'sdkmanager'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function getStatus(settingsPath) {
  const candidates = defaultSdkCandidates(settingsPath);
  let sdkPath = candidates.find((p) => fs.existsSync(path.join(p, 'emulator', exe('emulator')))
    || fs.existsSync(path.join(p, 'platform-tools', exe('adb'))))
    || candidates[0] || defaultSdkInstallPath();
  const emulator = path.join(sdkPath, 'emulator', exe('emulator'));
  const adb = path.join(sdkPath, 'platform-tools', exe('adb'));
  const images = listSystemImages(sdkPath);
  const hostAbi = IS_MAC && process.arch === 'arm64' ? 'arm64-v8a' : 'x86_64';
  return {
    sdkPath,
    emulatorPath: emulator,
    adbPath: adb,
    hasEmulator: fs.existsSync(emulator),
    hasAdb: fs.existsSync(adb),
    hasSdkmanager: !!sdkmanagerPath(sdkPath),
    images,
    hostAbi,
    ready: fs.existsSync(emulator) && fs.existsSync(adb) && images.length > 0,
    platform: process.platform,
    arch: process.arch,
  };
}

function findJava() {
  return new Promise((resolve) => {
    const candidates = [];
    if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', exe('java')));
    candidates.push('java');
    const tryNext = (i) => {
      if (i >= candidates.length) return resolve(null);
      execFile(candidates[i], ['-version'], { windowsHide: true }, (err, stdout, stderr) => {
        if (err) return tryNext(i + 1);
        const m = String(stderr || stdout).match(/version "([^"]+)"/);
        resolve({ bin: candidates[i], version: m ? m[1] : 'unknown' });
      });
    };
    tryNext(0);
  });
}

function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const get = (u, redirects) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
          res.resume();
          return get(new URL(res.headers.location, u).toString(), redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} ao baixar ${u}`));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let got = 0;
        const out = fs.createWriteStream(dest);
        res.on('data', (chunk) => { got += chunk.length; if (onProgress) onProgress(got, total); });
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    };
    get(url, 0);
  });
}

async function ensureCmdlineTools(sdkPath, log) {
  const existing = sdkmanagerPath(sdkPath);
  if (existing) return existing;
  const AdmZip = require('adm-zip');
  fs.mkdirSync(sdkPath, { recursive: true });
  const zipFile = path.join(os.tmpdir(), `cmdline-tools-${Date.now()}.zip`);
  log(`Baixando Android command-line tools...\n${CMDLINE_TOOLS_URL}`);
  let lastPct = -1;
  await download(CMDLINE_TOOLS_URL, zipFile, (got, total) => {
    if (!total) return;
    const pct = Math.floor((got / total) * 100);
    if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; log(`  ${pct}%`); }
  });
  log('Extraindo...');
  const zip = new AdmZip(zipFile);
  const tmpDir = path.join(sdkPath, 'cmdline-tools', `.extract-${Date.now()}`);
  zip.extractAllTo(tmpDir, true);
  const latest = path.join(sdkPath, 'cmdline-tools', 'latest');
  fs.rmSync(latest, { recursive: true, force: true });
  fs.renameSync(path.join(tmpDir, 'cmdline-tools'), latest);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(zipFile, { force: true });
  if (!IS_WIN) {
    for (const f of safeReaddir(path.join(latest, 'bin'))) {
      try { fs.chmodSync(path.join(latest, 'bin', f), 0o755); } catch (_) { /* ignore */ }
    }
  }
  const found = sdkmanagerPath(sdkPath);
  if (!found) throw new Error('sdkmanager não encontrado após extração');
  return found;
}

function runSdkmanager(bin, sdkPath, args, log) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ANDROID_HOME: sdkPath, ANDROID_SDK_ROOT: sdkPath };
    const allArgs = [`--sdk_root=${sdkPath}`, ...args];
    // On Windows the .bat must run through cmd.exe, so quote every argument.
    const child = IS_WIN
      ? spawn(`"${bin}"`, allArgs.map((a) => `"${a}"`), { env, windowsHide: true, shell: true })
      : spawn(bin, allArgs, { env, windowsHide: true });
    child.stdin.on('error', () => { /* process may exit before we finish writing */ });
    let out = '';
    const feed = (chunk) => {
      const text = String(chunk);
      out += text;
      for (const line of text.split(/\r?\n/)) if (line.trim()) log(line);
      // Accept licences automatically.
      if (/\(y\/N\)/i.test(text)) child.stdin.write('y\n');
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`sdkmanager saiu com código ${code}`))));
    // Pre-feed a few "y" answers in case prompts are not echoed through stdout.
    child.stdin.write('y\ny\ny\ny\ny\ny\ny\ny\n');
  });
}

// Full installer: command-line tools -> platform-tools + emulator + system image.
async function install({ sdkPath, api = 34, tag = 'google_apis', abi }, log) {
  sdkPath = sdkPath || defaultSdkInstallPath();
  const java = await findJava();
  if (!java) throw new Error('JAVA_MISSING');
  log(`Java encontrado: ${java.version}`);
  log(`Pasta do SDK: ${sdkPath}`);
  const bin = await ensureCmdlineTools(sdkPath, log);
  const hostAbi = abi || (IS_MAC && process.arch === 'arm64' ? 'arm64-v8a' : 'x86_64');
  const image = `system-images;android-${api};${tag};${hostAbi}`;
  log('Aceitando licenças...');
  await runSdkmanager(bin, sdkPath, ['--licenses'], log).catch(() => { /* non fatal */ });
  log(`Instalando platform-tools, emulator e ${image} (pode demorar vários minutos)...`);
  await runSdkmanager(bin, sdkPath, ['--install', 'platform-tools', 'emulator', image], log);
  log('Instalação concluída.');
  return getStatus(sdkPath);
}

module.exports = { getStatus, listSystemImages, install, findJava, defaultSdkInstallPath, IS_WIN, IS_MAC, exe };
