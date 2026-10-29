'use strict';
const { BrowserWindow, screen, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const IS_WIN = process.platform === 'win32';
const W = 36;
const H = 30;

// PowerShell helper (Windows): locates a target window by title or pid,
// reports its rect plus the emulator side toolbar rect, and can make our
// HUD window an "owned" window of the target so it stays glued to it in z-order.
const PS_SCRIPT = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public class DDWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtr")] public static extern IntPtr SetWindowLongPtr64(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll", EntryPoint="SetWindowLong")] public static extern int SetWindowLong32(IntPtr h, int i, int v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  public static List<IntPtr> WindowsOf(uint pid) { var l = new List<IntPtr>(); EnumWindows((h, p) => { uint q; GetWindowThreadProcessId(h, out q); if (q == pid && IsWindowVisible(h)) l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static IntPtr SetOwner(IntPtr h, IntPtr owner) { if (IntPtr.Size == 8) return SetWindowLongPtr64(h, -8, owner); return new IntPtr(SetWindowLong32(h, -8, owner.ToInt32())); }
}
"@
function Rect($h) { $r = New-Object DDWin+RECT; [DDWin]::GetWindowRect($h, [ref]$r) | Out-Null; return $r }
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $parts = $line.Split('|')
  if ($parts.Length -lt 3) { continue }
  $cmd = $parts[0]; $key = $parts[1]; $arg = $parts[2]
  try {
    if ($cmd -eq 'find') {
      if ($arg.StartsWith('pid=')) { $p = Get-Process -Id ([int]$arg.Substring(4)) -ErrorAction SilentlyContinue }
      else { $t = $arg.Substring(6); $p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$t*" } | Select-Object -First 1 }
      if (-not $p -or $p.MainWindowHandle -eq 0) { Write-Output "find|$key|none"; continue }
      $main = $p.MainWindowHandle
      $r = Rect $main
      $m = [DDWin]::IsIconic($main)
      $tb = 'none'
      foreach ($h in [DDWin]::WindowsOf([uint32]$p.Id)) {
        if ($h -eq $main) { continue }
        $q = Rect $h
        $w = $q.R - $q.L; $hh = $q.B - $q.T
        if ($w -gt 20 -and $w -lt 400 -and $hh -gt 100 -and [Math]::Abs($q.L - $r.R) -lt 40) { $tb = "$($q.L) $($q.T) $($q.R) $($q.B)"; break }
      }
      Write-Output "find|$key|$($main.ToInt64())|$($r.L) $($r.T) $($r.R) $($r.B)|$m|$tb"
    } elseif ($cmd -eq 'own') {
      $hud = [IntPtr]::new([long]$arg); $owner = [IntPtr]::new([long]$parts[3])
      [DDWin]::SetOwner($hud, $owner) | Out-Null
      [DDWin]::SetWindowPos($hud, [IntPtr]::Zero, 0, 0, 0, 0, 0x0037) | Out-Null
      Write-Output "own|$key|ok"
    }
  } catch { Write-Output "$cmd|$key|error" }
}
`;

/**
 * Small signal-bars window glued to each running profile's window.
 * Windows: owned by the emulator/browser window (follows it, hides with it,
 * never floats over other apps). Other platforms: always-on-top fallback.
 */
class HudManager {
  constructor({ getLang }) {
    this.huds = new Map();
    this.getLang = getLang;
    this.ps = null;
    this.timer = null;
  }

  show(key, { name, kind, title, pid }) {
    this.hide(key);
    const win = new BrowserWindow({
      width: W, height: H, frame: false, transparent: true, alwaysOnTop: !IS_WIN, skipTaskbar: true, resizable: false, movable: false,
      focusable: false, hasShadow: false, show: false, minimizable: false, maximizable: false, fullscreenable: false,
      webPreferences: { preload: path.join(__dirname, '..', 'hud-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    const hud = { key, win, name, kind, title, pid, owned: false, ownerHwnd: null, loaded: false, last: null };
    this.huds.set(key, hud);
    win.loadFile(path.join(__dirname, '..', 'renderer', 'hud.html'));
    win.webContents.on('did-finish-load', () => { hud.loaded = true; this._send(hud, { name, quality: (hud.last && hud.last.quality) || 'unknown', ...(hud.last || {}) }); if (!IS_WIN) this._placeFallback(hud); });
    win.on('closed', () => { if (this.huds.get(key) === hud) this.huds.delete(key); });
    if (IS_WIN) this._ensureTracker();
    return hud;
  }

  update(key, signal) {
    const hud = this.huds.get(key);
    if (!hud) return;
    hud.last = signal;
    if (hud.loaded) this._send(hud, { name: hud.name, ...signal });
  }

  hide(key) {
    const hud = this.huds.get(key);
    if (!hud) return;
    this.huds.delete(key);
    try { if (!hud.win.isDestroyed()) hud.win.destroy(); } catch (_) { /* ignore */ }
    if (!this.huds.size) this._stopTracker();
  }

  hideAll() { for (const key of [...this.huds.keys()]) this.hide(key); }

  _send(hud, data) { if (!hud.win.isDestroyed()) hud.win.webContents.send('hud:update', { lang: this.getLang(), ...data }); }

  _placeFallback(hud) {
    const area = screen.getPrimaryDisplay().workArea;
    try { hud.win.setPosition(area.x + area.width - W - 12, area.y + 12); hud.win.showInactive(); } catch (_) { /* ignore */ }
  }

  _hwnd(win) {
    try { const b = win.getNativeWindowHandle(); return b.length >= 8 ? b.readBigUInt64LE(0).toString() : String(b.readUInt32LE(0)); } catch (_) { return null; }
  }

  // ---- Windows tracker ----
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
        while ((i = buf.indexOf('\n')) !== -1) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this._onLine(line); }
      });
      this.ps.on('exit', () => { this.ps = null; });
      this.ps.on('error', () => { this.ps = null; });
      this.timer = setInterval(() => this._poll(), 600);
    } catch (_) { this.ps = null; }
  }

  _stopTracker() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.ps) { try { this.ps.stdin.end(); this.ps.kill(); } catch (_) { /* ignore */ } this.ps = null; }
  }

  _write(line) { if (this.ps && this.ps.stdin.writable) { try { this.ps.stdin.write(`${line}\n`); } catch (_) { /* ignore */ } } }

  _poll() {
    for (const hud of this.huds.values()) {
      if (hud.win.isDestroyed()) continue;
      const target = hud.kind === 'profile' ? `title=${hud.title}` : `pid=${hud.pid}`;
      if (hud.kind === 'profile' && !hud.title) continue;
      if (hud.kind !== 'profile' && !hud.pid) continue;
      this._write(`find|${hud.key}|${target}`);
    }
  }

  _onLine(line) {
    const parts = line.split('|');
    if (parts[0] !== 'find' || parts.length < 3) return;
    const hud = this.huds.get(parts[1]);
    if (!hud || hud.win.isDestroyed()) return;
    if (parts[2] === 'none' || parts[2] === 'error') { if (hud.win.isVisible()) hud.win.hide(); return; }
    const [, , mainHwnd, mainRect, minimized, tbRect] = parts;
    if (minimized === 'True') { if (hud.win.isVisible()) hud.win.hide(); return; }
    const [l, t, r, b] = mainRect.split(' ').map(Number);
    let px; let py;
    if (hud.kind === 'profile') {
      if (tbRect && tbRect !== 'none') {
        const [tl, tt, tr, tb] = tbRect.split(' ').map(Number);
        void tt;
        px = tl + (tr - tl) / 2; py = tb; // centered under the toolbar, right below "..."
        const p = this._toDip(px, py);
        px = p.x - W / 2; py = p.y + 6;
      } else {
        const p = this._toDip(r, t);
        px = p.x + 24; py = p.y + (this._toDip(r, b).y - p.y) * 0.62;
      }
    } else {
      const p = this._toDip(l, b);
      px = p.x + 10; py = p.y - H - 10; // inside the browser window, bottom-left corner
    }
    const pos = this._clamp(px, py);
    const [cx, cy] = hud.win.getPosition();
    if (Math.abs(cx - pos.x) > 1 || Math.abs(cy - pos.y) > 1) { try { hud.win.setPosition(Math.round(pos.x), Math.round(pos.y)); } catch (_) { /* ignore */ } }
    if (!hud.win.isVisible()) hud.win.showInactive();
    if (!hud.owned || hud.ownerHwnd !== mainHwnd) {
      const mine = this._hwnd(hud.win);
      if (mine) { this._write(`own|${hud.key}|${mine}|${mainHwnd}`); hud.owned = true; hud.ownerHwnd = mainHwnd; }
    }
  }

  _toDip(x, y) { return screen.screenToDipPoint ? screen.screenToDipPoint({ x, y }) : { x, y }; }

  _clamp(x, y) {
    const d = screen.getDisplayNearestPoint({ x, y }).bounds;
    return { x: Math.min(Math.max(x, d.x), d.x + d.width - W), y: Math.min(Math.max(y, d.y), d.y + d.height - H) };
  }
}

module.exports = { HudManager };
