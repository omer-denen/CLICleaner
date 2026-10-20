import { lstat, rename, rm, stat, readdir } from 'node:fs/promises';
import type { ChildProcess } from 'node:child_process';
import { longPath, isDenied, isLongPathError } from '../util/longpath.ts';
import { debug, error as logError, info, warn } from '../util/log.ts';
import type { DeleteTarget, Cluster } from '../core/types.ts';
import { assertSafeTarget } from './guard.ts';
import { gitTrackerFor } from '../core/git.ts';

/**
 * Silme katmani.
 *
 * Guvenlik ilkeleri:
 *  1. Hicbir sey dogrudan KALICI silinmez varsayilan olarak.
 *  2. Silmeden once yol KILIT MI kontrol edilir (atomik rename denemesi).
 *  3. Her islem gunluklenir (journal) -> undo mumkun.
 *  4. 'older' hedeflerinde yas filtresi DOSYA bazinda uygulanir;
 *     yeni dosyalar korunur.
 */

export type DeleteMode = 'recycle' | 'purge';

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high';

/**
 * Silme plani: onay ekraninda gosterilecek butun butunluk.
 * Silme ancak plan onaylandiktan sonra yurutulur.
 */
export interface PlannedTarget {
  target: DeleteTarget;
  bytes: number;
}

export interface PlannedCluster {
  title: string;
  reason: string;
  risk: RiskLevel;
  targets: PlannedTarget[];
}

export interface DeletePlan {
  mode: DeleteMode;
  clusters: PlannedCluster[];
  targets: PlannedTarget[];
  totalBytes: number;
}

/** Kume risk seviyesine gore onay planina cevrilir. */
export function buildPlan(
  clusters: Cluster[],
  mode: DeleteMode,
  only?: string[],
): DeletePlan {
  const f = only?.map((o) => o.toLowerCase());

  const planned: PlannedCluster[] = [];
  let total = 0;

  for (const c of clusters) {
    if (c.verdict.kind === 'report-only' || c.verdict.kind === 'keep') continue;
    if (f && f.length > 0) {
      const hit = f.some(
        (o) => c.key.toLowerCase().includes(o) || c.title.toLowerCase().includes(o),
      );
      if (!hit) continue;
    }
    const targets = (c.deleteTargets ?? []).filter((t) => t.bytes > 0);
    if (targets.length === 0) continue;
    // Guvenlik kapisi: korunan yollarin atasi olan hedefler plana
    // hicbir zaman girmez. Kontrol burada, kullanici onayindan ONCE.
    for (const t of targets) assertSafeTarget(t);

    const bytes = targets.reduce((a, t) => a + t.bytes, 0);
    planned.push({
      title: c.title,
      reason: c.verdict.consequence,
      risk: c.verdict.risk,
      targets: targets.map((t) => ({ target: t, bytes: t.bytes })),
    });
    total += bytes;
  }

  return {
    mode,
    clusters: planned,
    targets: planned.flatMap((p) => p.targets),
    totalBytes: total,
  };
}

export interface DeleteResult {
  target: DeleteTarget;
  removed: number;
  bytesFreed: number;
  skipped: Array<{ path: string; reason: string }>;
  failed: Array<{ path: string; reason: string }>;
}

export interface JournalEntry {
  at: number;
  mode: DeleteMode;
  action: 'deleted' | 'skipped' | 'failed';
  path: string;
  bytes: number;
  reason?: string;
}

/**
 * Sembolik bag veya junction (reparse point) mi?
 *
 * KRITIK: boyle bir yolun "icerigi" hedef klasordur. Silme islemi
 * hedefi degil, bagin kendisini kaldirmali — hatta en guvenlisi hic
 * dokunmamaktir. `npm link`, `pnpm` ve gelistirici kurulumlari bunu
 * yaygin kullanir; yanlis davranis BASKA bir projenin kodunu siler.
 */
async function isReparsePoint(path: string): Promise<boolean> {
  try {
    return (await lstat(longPath(path))).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Klasor kilit mi? Atomik rename dener (dosya sistemi bunu garantiler). */
export async function isLocked(path: string): Promise<boolean> {
  const tmp = `${path}.clicleaner-locktest-${Date.now()}`;
  try {
    await rename(longPath(path), longPath(tmp));
    // basarili: geri al
    await rename(longPath(tmp), longPath(path));
    return false;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') return true;
    void isDenied(err);
    void isLongPathError(err);
    return false;
  }
}

/**
 * Bir silme hedefini isler.
 *
 * kind='whole'  -> klasorun tamami
 * kind='older'  -> yalnizca minAgeDays eski dosyalar
 *
 * Geri donusum modunda: butun dosyalar tek tek geri donusum kutusuna
 * gonderilir. Boylece kota asilirsa yalnizca bir kismi tasinir,
 * hicbir sey kalici silinmez.
 */
export async function deleteTarget(
  target: DeleteTarget,
  mode: DeleteMode,
  now = Date.now(),
): Promise<DeleteResult> {
  // Savunma katmani: buildPlan'i atlayan dogrudan cagrilar da korunur.
  assertSafeTarget(target);

  const res: DeleteResult = { target, removed: 0, bytesFreed: 0, skipped: [], failed: [] };

  // Git farkindaligi (T27): tek depo cozumu + bellekteki kume.
  // Dosya basina yukari yurume veya git sureci BASLATILMAZ.
  const git = gitTrackerFor(target.path);
  if (target.kind === 'whole' && git.isTrackedAnyUnder(target.path)) {
    res.skipped.push({ path: target.path, reason: 'git tarafindan takip ediliyor (tracked)' });
    return res;
  }

  // Sembolik bag / junction: hedefi degil bagin kendisini silmek
  // gerekir; en guvenlisi hic dokunmamaktir. npm link ile bagli bir
  // kaynak projenin kodu bu yolla korunur.
  if (await isReparsePoint(target.path)) {
    res.skipped.push({ path: target.path, reason: 'sembolik bag/junction (hedef korunur)' });
    return res;
  }

  if (target.kind === 'whole') {
    const w = await measure(target.path);
    res.bytesFreed = w;
    res.removed = 1;

    info('hedef isleniyor', {
      path: target.path,
      mode,
      sizeMB: Math.round(w / 1048576),
    });

    if (mode === 'purge') {
      try {
        await rm(longPath(target.path), { recursive: true, force: true, maxRetries: 3 });
        info('kalici silindi', { path: target.path, bytes: w });
      } catch (err) {
        logError('kalici silme basarisiz', { path: target.path, err: describe(err) });
        res.failed.push({ path: target.path, reason: describe(err) });
      }
      return res;
    }

    // Geri donusum kutusu: kota yetiyorsa klasorun tamami
    const fits = await recycleBinHasRoom(w);
    debug('geri donusum kutusu k kontrolu', { path: target.path, sizeMB: Math.round(w / 1048576), fits });

    if (fits) {
      try {
        await recycleViaShell(target.path, true);
        info('geri donusum kutusuna tasindi', { path: target.path, bytes: w });
      } catch (err) {
        const msg = describe(err);
        logError('geri donusum kutusuna gonderilemedi', { path: target.path, err: msg });
        // Kota dolu / cok buyuk: kalici silme YAPMA, kullaniciya bildir
        res.failed.push({
          path: target.path,
          reason: `${msg} — geri donusum kutusuna sigmiyor; --purge ile kalici sil`,
        });
        res.bytesFreed = 0;
        res.removed = 0;
      }
    } else {
      // Kota yetmiyor: dosya dosya gondermeyi dene
      // (TEK geri donusum sureci kullanilir)
      const files = await collectFiles(target.path);
      let moved = 0;
      const bin = recycle();
      let quotaChecked = false;
      for (const f of files) {
        try {
          const st = await lstat(longPath(f));
          if (st.isSymbolicLink()) {
            res.skipped.push({ path: f, reason: 'sembolik bag/junction (hedef korunur)' });
            continue;
          }
          if (!quotaChecked) {
            quotaChecked = true;
            if (!(await recycleBinHasRoom(0))) {
              res.skipped.push({ path: f, reason: 'geri donusum kutusu dolu' });
              continue;
            }
          }
          const rr = await bin.send(f);
          if (rr.ok) {
            res.bytesFreed += st.size;
            moved++;
          } else if (/kilitli|being used|erişim/i.test(rr.reason)) {
            res.skipped.push({ path: f, reason: 'dosya kilitli' });
          } else if (rr.reason === 'dosya zaten yok') {
            moved++;
          } else {
            warn('geri donusum kutusuna gonderilemedi', { path: f, reason: rr.reason });
            res.skipped.push({ path: f, reason: rr.reason });
          }
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
            res.skipped.push({ path: f, reason: 'dosya kilitli' });
          } else {
            res.skipped.push({ path: f, reason: describe(err) });
          }
        }
      }
      res.removed = moved;
      if (moved > 0) {
        // Bosalan klasorleri temizle (artik icleri bos)
        try {
          await rm(longPath(target.path), { recursive: true, force: true, maxRetries: 1 });
        } catch {
          /* icinde dosya kalmis olabilir, sorun degil */
        }
      }
    }
    return res;
  }

  // --- 'older': yas filtresi ---
  // 116.956 dosya oldugu icin BURADA dosya basina surec acilmaz.
  // Tek geri donusum surecu kullanilir ve dosyalar tek tek akitilir.
  const minMs = (target.minAgeDays ?? 0) * 86400_000;
  const files = await collectFiles(target.path);

  // Once yas filtresi: yalnizca hedeflenen dosyalar
  const eligible: Array<{ path: string; size: number }> = [];
  for (const f of files) {
    try {
      const st = await lstat(longPath(f));
      // Reparse point: boyutu/mtime'i HEDEFE ait olur; silmek de
      // hedefi etkileyebilir. Dokunulmaz.
      if (st.isSymbolicLink()) {
        res.skipped.push({ path: f, reason: 'sembolik bag/junction (hedef korunur)' });
        continue;
      }
      if (git.isTracked(f)) {
        res.skipped.push({ path: f, reason: 'git tarafindan takip ediliyor (tracked)' });
        continue;
      }
      // minAgeDays: 0 "yas filtresi yok" demektir. Kosulu `minMs > 0` ile
      // sinirlamak gerekir: Windows dosya zaman damgasi saat tikine
      // yuvarlandigi icin yeni yazilan bir dosyanin mtime'i Date.now()'dan
      // birkac ms ILERIDE kalabilir; bu durumda `now - mtime` negatif olur
      // ve dosya yanlislikla "cok yeni" sayilirdi.
      if (minMs > 0 && now - st.mtimeMs < minMs) {
        res.skipped.push({ path: f, reason: 'cok yeni' });
        continue;
      }
      eligible.push({ path: f, size: st.size });
    } catch {
      /* erisilemedi */
    }
  }

  if (eligible.length === 0) return res;

  if (mode === 'purge') {
    // Kalici silme: dogrudan rm, surec gerekmez (cok daha hizli)
    const CONC = 16;
    for (let i = 0; i < eligible.length; i += CONC) {
      await Promise.all(
        eligible.slice(i, i + CONC).map(async (e) => {
          try {
            await rm(longPath(e.path), { force: true, maxRetries: 1 });
            res.bytesFreed += e.size;
            res.removed++;
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
              res.skipped.push({ path: e.path, reason: 'dosya kilitli (uygulama acik)' });
            } else {
              res.failed.push({ path: e.path, reason: describe(err) });
            }
          }
        }),
      );
    }
    return res;
  }

  // Geri donusum kutusu: TEK surec, N dosya
  const bin = recycle();
  const CONC = 1; // tek surec sirali beslenir
  for (let i = 0; i < eligible.length; i += CONC) {
    for (const e of eligible.slice(i, i + 64)) {
      const r = await bin.send(e.path);
      if (r.ok) {
        res.bytesFreed += e.size;
        res.removed++;
      } else if (/permission|kilitli|being used|erişim/i.test(r.reason)) {
        res.skipped.push({ path: e.path, reason: 'dosya kilitli (uygulama acik)' });
      } else if (r.reason === 'dosya zaten yok') {
        res.removed++;
      } else {
        res.failed.push({ path: e.path, reason: r.reason });
      }
    }
  }
  return res;
}

/**
 * GERI DONUSUM KUTUSUNA TOPLU TASIMA.
 *
 * Kritik tasarim karari: Dosya BASINA PowerShell sureci baslatmak
 * performans olarak felakettir. 116.956 dosyalik bir klasorde bu
 * 117.000 kez `powershell.exe` demektir — saatlerce surer ve
 * surec sifiri birakir.
 *
 * Cozum: TEK bir PowerShell sureci baslatilir ve dosyalar oraya
 * stdin uzerinden akitilir. Tek baslatma, N dosya.
 */
export class RecycleBin {
  private child: ChildProcess | null = null;
  private queue: string[] = [];
  private pending = new Map<string, { ok: boolean; reason: string }>();
  private ready = false;
  private starting: Promise<void> | null = null;

  private async ensureStarted(): Promise<void> {
    if (this.child && this.ready) return;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      const { spawn } = await import('node:child_process');

      // DIKKAT: PowerShell'in ReadLine ciktisi "\r\n" ile gelir.
      // Ayirici olarak '\n' kullanmak yeterlidir ama tampon temizligi
      // icin '\r' de atilir.
      const script = [
        "$ErrorActionPreference = 'Continue'",
        'Add-Type -AssemblyName Microsoft.VisualBasic',
        "Write-Output 'READY'",
        'while ($true) {',
        '  $line = [Console]::In.ReadLine()',
        "  if ($null -eq $line) { break }",
        // PING yalnizca hazirlik dogrulamasidir; cevap uretmez ve
        // donguyu bozmaz. (Daha once 'quit' ile ayni guvenlik kontrolune
        // takiliyordu ve surec hemen kapaniyordu.)
        "  if ($line -eq '__PING__') { continue }",
        "  if ($line -eq '__QUIT__') { break }",
        '  try {',
        '    if (Test-Path -LiteralPath $line) {',
        '      $i = Get-Item -LiteralPath $line -Force',
        '      if ($i.PSIsContainer) {',
        '        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(',
        "          $line, 'OnlyErrorDialogs', 'SendToRecycleBin')",
        '      } else {',
        '        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(',
        "          $line, 'OnlyErrorDialogs', 'SendToRecycleBin')",
        '      }',
        "      Write-Output 'OK'",
        '    } else {',
        "      Write-Output 'GONE'",
        '    }',
        '  } catch {',
        "    Write-Output ('ERR:' + $_.Exception.Message)",
        '  }',
        '}',
      ].join('\n');

      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.child = child;

      let buf = '';
      child.stdout!.setEncoding('utf8');
      child.stdout!.on('data', (chunk: string) => {
        buf += chunk;
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line === '') continue;
          if (line === 'READY') {
            this.ready = true;
            continue;
          }
          const item = this.queue.shift();
          if (item) {
            this.pending.set(item, {
              ok: line.startsWith('OK') || line === 'GONE',
              reason: line === 'GONE' ? 'dosya zaten yok' : line.replace(/^ERR:/, ''),
            });
          }
        }
      });
      child.stderr!.resume(); // hata ciktisini yoksay

      // once betigi gonder, sonra READY bekle
      child.stdin!.write(script + '\n');
      child.stdin!.write('__PING__\n');

      // Surec olurken haber ver (bu bir nokta olcum noktasi:
      // surec acilamazsa butun silme sessizce basarisiz olur)
      debug('geri donusum sureci baslatiliyor', { pid: child.pid });

      // READY gelene kadar bekle (sonsuz dongu guvenligi ile)
      for (let i = 0; i < 200; i++) {
        if (this.ready) {
          info('geri donusum kutusu hazir', { pid: child.pid });
          return;
        }
        if (child.exitCode !== null) {
          logError('PowerShell erken sonlandi', { exitCode: child.exitCode, pid: child.pid });
          throw new Error(`PowerShell erken sonlandi (kod ${child.exitCode})`);
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      logError('PowerShell hazir olmadi', { pid: child.pid });
      throw new Error('PowerShell hazir olmadi (10 saniye zaman asimi)');
    })();

    try {
      return await this.starting;
    } catch (err) {
      this.starting = null;
      this.child?.kill();
      this.child = null;
      logError('geri donusum sureci kurulamadi', { err: String(err) });
      throw err;
    }
  }

  /** Tek bir yolu geri donusum kutusuna gonderir. */
  async send(path: string): Promise<{ ok: boolean; reason: string }> {
    await this.ensureStarted();
    if (!this.child || this.child.killed) return { ok: false, reason: 'surec kapali' };

    this.queue.push(path);
    try {
      this.child.stdin!.write(path + '\n');
    } catch {
      this.queue.pop();
      return { ok: false, reason: 'yazilamadi' };
    }

    // Cevap bekle. Geri donusum kutusu yavas olabilir (ozellikle
    // buyuk klasorlerde), bu yuzden surun bitmesi beklenmez.
    for (let i = 0; i < 120_000; i++) {
      const r = this.pending.get(path);
      if (r) {
        this.pending.delete(path);
        return r;
      }
      if (this.child.exitCode !== null) {
        logError('geri donusum sureci sonlandi', { path, exitCode: this.child.exitCode });
        return { ok: false, reason: 'surec sonlandi' };
      }
      await new Promise((r) => setImmediate(r));
    }
    logError('geri donusum zaman asimi', { path });
    return { ok: false, reason: 'zaman asimi' };
  }

  close(): void {
    if (!this.child) return;
    try {
      this.child.stdin!.write('__QUIT__\n');
      this.child.stdin!.end();
    } catch {
      /* yoksay */
    }
    this.child.kill();
    this.child = null;
    this.ready = false;
    this.starting = null;
  }
}

let sharedBin: RecycleBin | null = null;
export function recycle(): RecycleBin {
  if (!sharedBin) sharedBin = new RecycleBin();
  return sharedBin;
}
export function closeRecycle(): void {
  sharedBin?.close();
  sharedBin = null;
}

/**
 * Tek yol icin geri donusum kutusu (uyumluluk katmani).
 * Tercih edilen yol: recycle().send() toplu kullanimi.
 */
async function recycleViaShell(path: string, isDir: boolean): Promise<void> {
  void isDir;
  const r = await recycle().send(path);
  if (!r.ok) throw new Error(r.reason || 'geri donusum kutusuna gonderilemedi');
}

/**
 * Geri donusum kutusunda yer var mi?
 *
 * ONCELEME: Bu bir SORGUDUR ve bir kez cagrilir, dosya basina degil.
 * 117.000 dosya icin 117.000 kez sorgulamak ayni felaketi uretirdi.
 * Sonuc onbellege alinir.
 */
let roomCache: { hasRoom: boolean; at: number } | null = null;

export async function recycleBinHasRoom(needBytes: number): Promise<boolean> {
  // 5 dakika icinde hesaplanan sonucu tekrar kullan
  if (roomCache && Date.now() - roomCache.at < 300_000 && needBytes === 0) {
    return roomCache.hasRoom;
  }
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    const ps = `
$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName Microsoft.VisualBasic
$shell = New-Object -ComObject Shell.Application
$bin = $shell.Namespace(10)
$size = 0
if ($bin) {
  foreach ($i in $bin.Items()) {
    $s = $bin.GetDetailsOf($i, 1)
    if ($s) { $size += [double]($s -replace '[^0-9.]','') }
  }
}
$free = (Get-PSDrive C).Free
# Geri donusum kutusu kotalari: en fazla diskin %5'i veya 10 GB
$quota = [Math]::Min($free * 0.05, 10GB)
Write-Output ('SIZE=' + [Math]::Round($size))
Write-Output ('QUOTA=' + [Math]::Round($quota))
Write-Output ('FREE=' + [Math]::Round($free))
`;
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout: 60_000,
    });
    const get = (k: string) => {
      const m = new RegExp(`${k}=([0-9.]+)`).exec(stdout);
      return m ? Number(m[1]) : NaN;
    };
    const quota = get('QUOTA');
    const size = get('SIZE');
    if (Number.isNaN(quota)) return true; // bilinemiyorsa engel olma
    const freeQuota = Math.max(0, quota - size);
    // 1 GB pay birak: kotanin tamami doluysa hicbir sey giremez
    const hasRoom = needBytes <= freeQuota - 1024 * 1024 * 1024;
    if (needBytes === 0) roomCache = { hasRoom, at: Date.now() };
    return hasRoom;
  } catch {
    return true; // bilinemiyorsa izin ver
  }
}

async function measure(path: string): Promise<number> {
  let total = 0;
  const stack = [path];
  while (stack.length) {
    const dir = stack.pop()!;
    let ents;
    try {
      ents = await readdir(longPath(dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const full = `${dir}\\${e.name}`;
      if (e.isDirectory()) stack.push(full);
      else {
        try {
          const st = await stat(longPath(full));
          total += st.size;
        } catch {
          /* atla */
        }
      }
    }
  }
  return total;
}

/**
 * Klasordeki dosyalari toplar.
 *
 * 116.956 dosyalik bir agac 100k limitine takilirsa SILME ISLEMESI
 * YARIM KALIR ve kullaniciya yanlis bilgi verilir. Bu yuzden esik
 * yoktur; liste akis halinde uretilir.
 */
async function collectFiles(root: string, max = Number.MAX_SAFE_INTEGER): Promise<string[]> {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < max) {
    const dir = stack.pop()!;
    let ents;
    try {
      ents = await readdir(longPath(dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const full = `${dir}\\${e.name}`;
      if (e.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

function describe(err: unknown): string {
  const e = err as NodeJS.ErrnoException & { stderr?: string };
  return e.code ? `${e.code}: ${e.message.split('\n')[0]}` : String(err).slice(0, 120);
}

/** Silme gunlugu: geri alma icin. */
export class Journal {
  private entries: JournalEntry[] = [];

  add(e: JournalEntry): void {
    this.entries.push(e);
  }

  all(): JournalEntry[] {
    return this.entries;
  }

  async save(dir: string): Promise<string> {
    const { writeFile } = await import('node:fs/promises');
    const path = `${dir}\\clicleaner-journal-${Date.now()}.json`;
    await writeFile(path, JSON.stringify(this.entries, null, 2), 'utf8');
    return path;
  }
}