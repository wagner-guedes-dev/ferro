'use strict';
const { BrowserWindow, screen, ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const IS_WIN = process.platform === 'win32';
const W = 190;
const H = 50;
const TOOLBAR_W = 84; // width of the emulator's side toolbar (DIP)

// PowerShell helper that answers "where is the window whose title contains X".
const PS_SCRIPT = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class DDWin {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
}
"@
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $line = $line.Trim()
  if ($line -eq '') { continue }
  $p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$line*" } | Select-Object -First 1
  if ($p) {
    $r = New-Object DDWin+RECT
    [DDWin]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
    $m = [DDWin]::IsIconic($p.MainWindowHandle)
    Write-Output ("$line|$($r.L) $($r.T) $($r.R) $($r.B) $m")
  } else { Write-Output ("$line|none") }
}
`;

/**
 * Floating always-on-top mini panels showing live proxy signal, one per
 * running profile. Emulator panels dock next to the emulator window (Windows)
 * and follow it; other panels float at a remembered position.
 */
class HudManager {
  constructor({ getLang, getOffset, setOffset }) {
    this.huds = new Map();
    this.getLang = getLang;
    this.getOffset = getOffset; // (key) => { dx, dy } | { x, y } | null
    this.setOffset = setOffset; // (key, value) => void
    this.ps = null;
    this.pending = new Map();
    this.timer = null;
    ipcMain.on('hud:close', (e) => {
      for (const [key, h] of this.huds) if (h.win && h.win.webContents.id === e.sender.id) { h.hiddenByUser = true; h.win.hide(); }
    });
  }

  show(key, { name, kind, title, proxyLabel }) {
    this.hide(key);
    const win = new BrowserWindow({
      width: W, height: H, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false,
      focusable: false, hasShadow: false, show: false, minimizable: false, maximizable: false, fullscreenable: false,
      webPreferences: { preload: path.join(__dirname, '..', 'hud-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true);
    const hud = { key, win, name, kind, title, proxyLabel, last: null, programmaticMove: false, found: false, hiddenByUser: false };
    this.huds.set(key, hud);
    win.loadFile(path.join(__dirname, '..', 'renderer', 'hud.html'));
    win.webContents.on('did-finish-load', () => { this._send(hud, { name, proxy: proxyLabel, quality: 'unknown' }); this._place(hud, true); });
    win.on('moved', () => { if (hud.programmaticMove) return; this._remember(hud); });
    win.on('closed', () => { if (this.huds.get(key) === hud) this.huds.delete(key); });
    if (kind === 'profile' && IS_WIN) this._ensureTracker();
    return hud;
  }

  update(key, signal) {
    const hud = this.huds.get(key);
    if (!hud) return;
    hud.last = signal;
    this._send(hud, { name: hud.name, ...signal });
  }

  hide(key) {
    const hud = this.huds.get(key);
    if (!hud) return;
    this.huds.delete(key);
    try { if (!hud.win.isDestroyed()) hud.win.destroy(); } catch (_) { /* ignore */ }
    if (!this.huds.size) this._stopTracker();
  }

  hideAll() { for (const key of [...this.huds.keys()]) this.hide(key); }

  _send(hud, data) {
    if (hud.win.isDestroyed()) return;
    hud.win.webContents.send('hud:update', { lang: this.getLang(), ...data });
  }

  // ---- placement ----
  _place(hud, initial) {
    if (hud.win.isDestroyed() || hud.hiddenByUser) return;
    if (hud.kind === 'profile' && IS_WIN) return; // tracker positions it once the emulator window exists
    const saved = this.getOffset(hud.key);
    const area = screen.getPrimaryDisplay().workArea;
    let x = area.x + area.width - W - 16;
    let y = area.y + 16;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) { x = saved.x; y = saved.y; }
    this._moveTo(hud, this._clamp(x, y));
    if (initial) hud.win.showInactive();
  }

  _clamp(x, y) {
    const d = screen.getDisplayNearestPoint({ x, y }).workArea;
    return { x: Math.min(Math.max(x, d.x), d.x + d.width - W), y: Math.min(Math.max(y, d.y), d.y + d.height - H) };
  }

  _moveTo(hud, { x, y }) {
    hud.programmaticMove = true;
    try { hud.win.setPosition(Math.round(x), Math.round(y)); } catch (_) { /* ignore */ }
    setTimeout(() => { hud.programmaticMove = false; }, 50);
  }

  _remember(hud) {
    const [x, y] = hud.win.getPosition();
    if (hud.kind === 'profile' && hud.anchor) this.setOffset(hud.key, { dx: x - hud.anchor.x, dy: y - hud.anchor.y });
    else this.setOffset(hud.key, { x, y });
  }

  // ---- window tracker (Windows): follow the emulator window ----
  _ensureTracker() {
    if (this.ps) return;
    try {
      const file = path.join(app.getPath('userData'), 'hud-tracker.ps1');
      fs.writeFileSync(file, PS_SCRIPT, 'utf8');
      this.ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      let buf = '';
      this.ps.stdout.on('data', (c) => {
        buf += String(c);
        let i;
        while ((i = buf.indexOf('\n')) !== -1) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this._onTrackerLine(line); }
      });
      this.ps.on('exit', () => { this.ps = null; });
      this.ps.on('error', () => { this.ps = null; });
      this.timer = setInterval(() => this._poll(), 700);
    } catch (_) { this.ps = null; }
  }

  _stopTracker() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.ps) { try { this.ps.stdin.end(); this.ps.kill(); } catch (_) { /* ignore */ } this.ps = null; }
  }

  _poll() {
    if (!this.ps || !this.ps.stdin.writable) return;
    for (const hud of this.huds.values()) if (hud.kind === 'profile' && hud.title) { try { this.ps.stdin.write(`${hud.title}\n`); } catch (_) { /* ignore */ } }
  }

  _onTrackerLine(line) {
    const sep = line.indexOf('|');
    if (sep === -1) return;
    const title = line.slice(0, sep);
    const rest = line.slice(sep + 1);
    const hud = [...this.huds.values()].find((h) => h.title === title);
    if (!hud || hud.win.isDestroyed() || hud.hiddenByUser) return;
    if (rest === 'none') { if (hud.win.isVisible()) hud.win.hide(); return; }
    const [l, t, r, b, min] = rest.split(' ');
    if (min === 'True') { if (hud.win.isVisible()) hud.win.hide(); return; }
    // Physical pixels -> DIP (handles display scaling).
    const topRight = screen.screenToDipPoint ? screen.screenToDipPoint({ x: Number(r), y: Number(t) }) : { x: Number(r), y: Number(t) };
    void l; void b;
    hud.anchor = topRight;
    const saved = this.getOffset(hud.key);
    const dx = saved && Number.isFinite(saved.dx) ? saved.dx : TOOLBAR_W;
    const dy = saved && Number.isFinite(saved.dy) ? saved.dy : 44;
    const pos = this._clamp(topRight.x + dx, topRight.y + dy);
    const [cx, cy] = hud.win.getPosition();
    if (Math.abs(cx - pos.x) > 1 || Math.abs(cy - pos.y) > 1) this._moveTo(hud, pos);
    if (!hud.win.isVisible()) hud.win.showInactive();
  }
}

module.exports = { HudManager };
