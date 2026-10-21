import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { dirname, join } from 'node:path';
import { longPath } from '../util/longpath.ts';
import type { FileKind, LogSignal, OwnerSignal } from './types.ts';

/**
 * Kanit toplayici.
 *
 * KRITIK KURAL: Bu dosya hicbir uygulama adi icermez. "MuhasibPro",
 * "opencode", "claude" gibi isimler burada veya alt cagrilarda gecer.
 * Yalnizca "ne tur sey" sorusuna bakar: dosya turleri, dizin yapisi,
 * manifest icerigi, log satirlari.
 *
 * Bir uygulamanin adi dosya/dizin adindan veya icerikten cikarilir;
 * kodda ozel kural yazilmaz. Boylece yeni bir AI araci ciktiginda
 * Residue otomatik tanimaya devam eder.
 */

const MAX_TEXT_PROBE = 512 * 1024; // 512 KB'tan fazla dosya okunmaz

export interface Probe {
  owner?: OwnerSignal;
  fileKinds: FileKind[];
  markers: string[];
  logSignals: LogSignal[];
  /** Electron/Chromium onbellegi iceren klasor */
  electronCache?: boolean;
  /** SDK kurulumu isaretleri (sdk/, shared/, tools/) */
  sdkInstall?: boolean;
  /** Editor uzanti deposu: extensions/ + extensions.json */
  editorExtensions?: boolean;
  /** Cok surumlu uygulama: app-<surum> kardes klasorleri */
  appVersions?: boolean;
  /** Ajan beceri deposu: skills/ + SKILL.md */
  skillStore?: boolean;
  /** Kaynak projesi isareti: manifest (package.json, pyproject.toml...) goruldu */
  projectManifest?: boolean;
  /** Vektor/embedding deposu: index + embedding dosyalari (T29) */
  vectorStore?: boolean;
  /** Proje ici bagimlilik klasoru (T31): node_modules / .venv + manifest */
  projectArtifact?: ProjectArtifactEvidence;
  /**
   * T32: paket deposunun gercek koku (taranan klasorden farkliysa).
   * pnpm/bun ana klasorleri uygulama icerir; yalnizca depo alt klasoru
   * silme hedefi olabilir.
   */
  cacheRoot?: string;
}

/**
 * Proje ici bagimlilik klasoru kaniti (T31).
 *
 * node_modules TEK BASINA "global paket kurulumu" gibi gorunur; oysa
 * ustunde bir kaynak manifesti varsa kullanicinin projesine aittir.
 * Yeniden uretilebilirlik, kanitla belirlenir: lockfile, yamalar ve
 * yerel yol bagimliliklari.
 */
export interface ProjectArtifactEvidence {
  ecosystem: 'node' | 'python';
  projectRoot: string;
  manifest: string;
  /** Birebir yeniden kurulumu saglayan kilit dosyasi (yoksa null) */
  lockfile: string | null;
  /** Yamanmis bagimliliklar: yeniden kurulumda ek adim gerekir */
  patches: boolean;
  /** file:/link:/workspace: bagimliliklari (proje disina bagli) */
  localDeps: boolean;
}

/** Kaynak projesi manifestleri. Ad, tur bildirir; uretim kodu degildir. */
const PROJECT_MANIFEST_RE =
  /^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|composer\.json|gemfile|pom\.xml|build\.gradle|build\.gradle\.kts|setup\.py|requirements\.txt|meson\.build|cmakelists\.txt)$/i;

/** Proje kilidi: "bu bir proje" kaniti; ONBELLEK KANITI DEGILDIR. */
const LOCKFILE_RE = /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|uv\.lock|cargo\.lock|composer\.lock|gemfile\.lock)$/i;

/** Embedding/vektor indeks dosyalari (format adi; uygulama adi degil). */
const EMBEDDING_EXT_RE = /\.(faiss|lance|npy|npz|parquet|ann|hnsw|ivf)$/i;

/** Vektor DB klasor duzeni: rastgele UUID adli alt klasorler. */
const UUID_DIR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uzantiya gore anlamli tur siniflandirmasi. */
const EXT_KIND: Record<string, FileKind> = {
  onnx: 'onnx-model',
  nupkg: 'nuget-package',
  whl: 'archive',
  tgz: 'archive',
  gz: 'archive',
  zip: 'archive',
  '7z': 'archive',
  vhd: 'wsl-disk',
  vhdx: 'wsl-disk',
  dmp: 'crash-dump',
  mdmp: 'crash-dump',
  log: 'log',
  jsonl: 'log',
  db: 'sqlite',
  sqlite: 'sqlite',
  sqlite3: 'sqlite',
  ovpn: 'vpn-config',
  // Vektor/embedding indeksleri (T29). Format adi; uygulama adi degil.
  faiss: 'embedding-index',
  lance: 'embedding-index',
  npy: 'embedding-index',
  npz: 'embedding-index',
  parquet: 'embedding-index',
};

/** Native kutuphaneler icin tur: HICBIR .dll CUDA degildir. */
export type LibKind = 'cuda-runtime' | 'native-lib';

export function kindOfFile(name: string): FileKind | LibKind | null {
  // NuGet paket deposunun isaretleri yalnizca .nupkg degildir:
  // .nuspec (paket bildirimi), .nupkg.sha512 (butunluk ozeti) ve
  // .nupkg.metadata (kurulum kaydi) da ayni depoyu kanitlar.
  // Bilesik uzantilar tek bir uzanti gibi ele alinir.
  if (/\.nupkg(\.sha512|\.metadata)?$/i.test(name) || /\.nuspec$/i.test(name)) {
    return 'nuget-package';
  }

  const i = name.lastIndexOf('.');
  if (i < 0) return null;
  const ext = name.slice(i + 1).toLowerCase();
  const direct = EXT_KIND[ext];
  if (direct) return direct;
  if (ext === 'dll' || ext === 'so' || ext === 'dylib') return 'native-lib';
  // "installer" YALNIZCA gercekten kurulum dosyasi olan exe'ler icin.
  // Iki tuzak var:
  //   uninstall.exe  -> bu CIKARICI, artik degil (ters yon)
  //   postupdate.exe -> guncelleyici kalintisi, kurulum degil
  if (ext === 'exe') {
    if (/uninstall|unins\d/i.test(name)) return null;
    if (/postupdate|updater/i.test(name)) return 'installer';
    if (/setup|install/i.test(name)) return 'installer';
  }
  return null;
}

/**
 * Electron/Chromium tabanli masaustu uygulamalarinin onbellek
 * klasorleri. Bunlar UYGULAMA VERISI DEGIL, sadece yeniden uretilir.
 * Ayni klasorun icinde ayrica "Local Storage" / "Preferences" gibi
 * kalici durum da olabilir; bu yuzden isaret ayri bir tur olarak
 * toplanir ve karar katmani ayirt eder.
 */
const ELECTRON_CACHE_MARKERS = new Set([
  'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache',
  'DawnWebGPUCache', 'ShaderCache', 'GrShaderCache', 'blob_storage',
  'Service Worker', 'CacheStorage', 'Crashpad',
]);
const CUDA_DLL_RE = /^cu(dnn|blas|blaslt|fft|rand|solver|art|graph|jitlink|rtc)[a-z0-9_]*64[_-]\d+\.dll$/i;
const ORT_DLL_RE = /^onnxruntime[_-].*\.(dll|so|dylib)$/i;

/** Node modullerini tanimak icin tipik ayirt edici dosya/dizin. */
const NODE_MARKERS = new Set(['node_modules', '.bin', 'package-lock.json', 'yarn.lock', '.package-lock.json']);
const PYENV_MARKERS = new Set(['pyvenv.cfg', 'conda-meta', 'site-packages', 'Scripts', '.venv', 'venv']);
const RUNTIME_POOL_MARKERS = new Set(['envs', 'conda', 'pixi', 'uv', 'runtimed', '.conda']);
const MODEL_MARKERS = new Set(['models', 'model.onnx', 'gguf', 'safetensors', 'tokenizer.json', 'genai_config.json']);
const LOG_DIR_RE = /^logs?$|^.*\.logs?$/i;

/** Ajan calisma alani isaretleri: beceri, oturum, hafiza. */
const AGENT_DIR_MARKERS = new Set(['skills', 'sessions', 'memories', 'agents', 'plugins']);
/** Squirrel tarzi surumlu uygulama klasoru: app-1.2.3 */
const APP_VERSION_RE = /^app-\d+(?:\.\d+){1,3}(?:[-+][\w.]+)?$/i;

export async function probeDir(path: string): Promise<Probe> {
  const p: Probe = { fileKinds: [], markers: [], logSignals: [] };

  let entries;
  try {
    entries = await readdir(longPath(path), { withFileTypes: true });
  } catch {
    return p;
  }

  const names = new Set(entries.map((e) => e.name));
  let hasShim = false;

  // --- Dizin/manifest isaretleri ---
  for (const e of entries) {
    if (e.isDirectory()) {
      const n = e.name.toLowerCase();
      if (NODE_MARKERS.has(n)) p.markers.push(e.name);
      else if (PYENV_MARKERS.has(n)) p.markers.push(e.name);
      else if (RUNTIME_POOL_MARKERS.has(n)) p.markers.push(e.name);
      else if (MODEL_MARKERS.has(n)) p.markers.push(e.name);
      else if (LOG_DIR_RE.test(e.name)) p.markers.push(e.name);
      if (n === 'node_modules') p.fileKinds.push('node-modules');
      if (n === 'pyvenv.cfg') p.fileKinds.push('python-env');
      // Pac yoneticisi onbellegi semasi: _cacache, pkgs, repodata, store
      // (_npx: npm'in "bir kez calistirilan" paket deposu; yeniden uretilir.)
      if (/^(_cacache|_npx|pkgs|repodata|archives|packs|simple-v|wheels|conda-meta)$/.test(n)) {
        p.markers.push('store');
      }
      // NuGet HTTP onbellegi (v3-cache / plugins-cache): ad NuGet'e
      // ozgudur ama TEK BASINA yetmez; klasorun icinde dosya olmali.
      // ("http-cache" gibi genel adlar bilerek sayilmaz: her uygulamada
      // gecebilir ve yanlis silme hedefine yol acardi.)
      if (NUGET_CACHE_DIR_RE.test(n) && (await probeNuGetHttpCache(`${path}\\${e.name}`))) {
        p.markers.push('cachedir-tag');
        p.markers.push('store');
      }
      // Electron/Chromium onbellegi
      if (ELECTRON_CACHE_MARKERS.has(e.name)) {
        p.electronCache = true;
        p.markers.push(e.name);
      }
      // SDK kurulumu (silinmemeli)
      if (n === 'sdk' || n === 'shared' || n === 'tools' || n === 'host') {
        p.sdkInstall = true;
      }
      // Ajan calisma alani isaretleri: beceri, oturum, hafiza.
      if (AGENT_DIR_MARKERS.has(n)) p.markers.push(e.name);
      // T28: sohbet gecmisi klasorleri (ad tek basina KAPI DEGIL; yalnizca
      // --clear-history ile hedef uretilir).
      if (n === 'sessions' || n === 'history' || n === 'conversations' || n === 'chats') {
        p.markers.push('chat-history');
      }
      // T28: kural klasoru (icinde .rules / rules.json olmali).
      if (n === 'rules' && (await probeRulesDir(`${path}\\${e.name}`))) {
        p.markers.push('rules-files');
      }
      // Vektor/embedding alt klasoru (or. "<ad>.lance" veri kumesi).
      if (EMBEDDING_EXT_RE.test(e.name)) {
        p.vectorStore = true;
        p.markers.push('vector-index');
      }
    } else {
      const k = kindOfFile(e.name);
      if (k) p.fileKinds.push(k);
      if (NODE_MARKERS.has(e.name)) p.markers.push(e.name);
      if (PYENV_MARKERS.has(e.name)) p.markers.push(e.name);
      // CACHEDIR.TAG = bu klasor BIR ONBELLEKTIR (bkz. godot CACHEDIR.TAG
      // spesifikasyonu). npm, conda/rattler, uv, pip hepsi koyar.
      // Bu, "bu klasor ne?" sorusunun en guvenilir cevabi.
      if (e.name.toUpperCase() === 'CACHEDIR.TAG') p.markers.push('cachedir-tag');
      // Proje kilidi bir ONBELLEK KANITI DEGILDIR; yalnizca "bu bir
      // proje" isaretidir. npm onbellegi asil olarak _cacache/_npx
      // duzeniyle taninir (yukaridaki "store" isareti). Bu ayrim olmadan
      // package-lock.json iceren her klasor "onbellek" sayilip yanlislikla
      // silme hedefi aliyordu.
      if (LOCKFILE_RE.test(e.name)) {
        p.fileKinds.push('lockfile');
        p.projectManifest = true;
      }
      if (PROJECT_MANIFEST_RE.test(e.name)) p.projectManifest = true;
      // Embedding/vektor indeks dosyasi (format adi; uygulama adi degil).
      if (k === 'embedding-index') {
        p.vectorStore = true;
        p.markers.push('vector-index');
      }
      // Komut shim'i (npm prefix: foo.cmd / foo.ps1). Tek basina anlamsizdir;
      // yalnizca node_modules ile BIRLIKTE "global paket kurulumu" kanitidir.
      if (/\.(cmd|ps1)$/i.test(e.name)) hasShim = true;
      if (CUDA_DLL_RE.test(e.name) || ORT_DLL_RE.test(e.name)) {
        p.fileKinds.push('cuda-runtime');
      }
      // T28: kural dosyalari ve sohbet gecmisi. Bunlar yalnizca ilgili
      // bayrak verilirse silme hedefine donusur.
      if (/\.rules$/i.test(e.name)) p.markers.push('rules-files');
      if (/chat.*\.json$|[-_.]chat\.json$/i.test(e.name)) p.markers.push('chat-history');
      // Ajan beceri kilidi (kurulu becerilerin kaynagi ve hash'i).
      if (e.name.toLowerCase() === '.skill-lock.json') p.markers.push('skill-lock');
      // Squirrel tarzi guncelleyici ikilisi: surum klasorlerini yonetir.
      if (e.name.toLowerCase() === 'update.exe') p.markers.push('update-exe');
    }
  }

  // Proje ici bagimlilik klasoru (T31): node_modules / .venv + manifest.
  // Global paket kurulumuyla karismamasi icin bu kanit, shim isaretinden
  // ONCE toplanir ve karar katmaninda daha yuksek oncelik alir.
  await probeProjectArtifact(path, p);

  // Paket yoneticisi depolarini YAPIDAN tani (T32): pnpm / yarn / bun.
  // Genel "cache" adi tek basina kanit DEGILDIR.
  await probePackageManagerStore(path, p);

  // Komut shim'i + node_modules: global paket kurulumu (npm prefix).
  if (hasShim) p.markers.push('shim-dir');

  // --- Vektor/embedding deposu (T29) ---
  //
  // Ad TEK BASINA yetmez. Ya bir embedding indeks dosyasi (faiss/lance/
  // npy/parquet; yukarida isaretlendi) ya da sqlite indeks + rastgele
  // UUID adli alt klasorler (vektor DB duzeni) gorulmelidir.
  const uuidDirs = entries.filter((e) => e.isDirectory() && UUID_DIR_RE.test(e.name)).length;
  if (!p.vectorStore && uuidDirs > 0 && p.fileKinds.includes('sqlite')) {
    p.vectorStore = true;
    p.markers.push('vector-index');
  }

  // --- Surumlu uygulama deposu: app-<surum> + Update.exe ---
  //
  // Guncelleyiciler yeni surumu yanina acar ve eski klasoru
  // birakabilir. Kanit: kardes "app-1.2.3" klasorleri + updater.
  const appDirs = entries.filter((e) => e.isDirectory() && APP_VERSION_RE.test(e.name));
  const hasUpdater = entries.some((e) => e.isFile() && e.name.toLowerCase() === 'update.exe');
  if (appDirs.length > 0 && hasUpdater) {
    p.appVersions = true;
    p.markers.push('app-versions');
  }

  // --- Paket deposu konteyneri ---
  //
  // Bazi paket depolarinda (or. NuGet global paket deposu) kok
  // seviyede HICBIR isaret yoktur; kanit "<kok>\packages\<paket>\
  // <surum>\<paket>.nupkg" yolunda, iki seviye asagidadir. Bu yuzden
  // "packages" adli konteyner genel derin probe'a birakilmaz; kendi
  // sinirli kanit tarayicisiyla hemen bakilir.
  const packagesDir = entries.find(
    (e) => e.isDirectory() && e.name.toLowerCase() === 'packages',
  );
  if (packagesDir) {
    await probePackageStore(`${path}\\${packagesDir.name}`, p);
  }

  // --- Ajan beceri deposu: skills/ + SKILL.md ---
  //
  // Bir klasorde "skills" olmasi tek basina yeterli degildir (oyun
  // verilerinde de gecebilir). SKILL.md veya beceri kilidi varsa
  // kanit gercekten bir ajan calisma alanidir.
  //
  // Kokun KENDISI de bir beceri klasoru olabilir: dogrudan SKILL.md
  // iceren dizin, adi ne olursa olsun beceri kanitidir.
  if (entries.some((e) => e.isFile() && e.name.toLowerCase() === 'skill.md')) {
    p.skillStore = true;
    if (!p.markers.includes('skill-store')) p.markers.push('skill-store');
  }
  const skillsDir = entries.find(
    (e) => e.isDirectory() && e.name.toLowerCase() === 'skills',
  );
  if (skillsDir) {
    await probeSkillStore(`${path}\\${skillsDir.name}`, p);
  }

  // --- Ajan plan dosyalari: plan/ + *.md ---
  //
  // "plan" adi tek basina kanit degildir (her projede olabilir). Yalnizca
  // ayni kokte beceri deposu/kilit varsa ajan plani sayilir; boylece
  // kullanici planlari yanlislikla "ajan verisi" olarak etiketlenmez.
  if (p.skillStore || p.markers.includes('skill-lock')) {
    const planDir = entries.find((e) => e.isDirectory() && e.name.toLowerCase() === 'plan');
    if (planDir && (await dirHasMarkdown(`${path}\\${planDir.name}`))) {
      p.markers.push('agent-plan');
    }
  }

  // --- Editor uzanti deposu: extensions/ + extensions.json ---
  //
  // VS Code ve turevleri kurulu uzantilari bir manifestte tutar.
  // Manifest, hangi surumun AKTIF oldugunun tek guvenilir kaynagidir.
  const extensionsDir = entries.find(
    (e) => e.isDirectory() && e.name.toLowerCase() === 'extensions',
  );
  if (extensionsDir) {
    await probeExtensionStore(`${path}\\${extensionsDir.name}`, p);
  }

  // --- Ic ice onkleme ---
  //
  // .MuhasibPro'da yalnizca "logs" gorunur ama asil
  // onemli isaretler (CUDA DLL'leri ep/cuda-ep altinda, model agirligi
  // cache/models altinda) daha derinde. Bu yuzden "anlamli" bir isaret
  // bulunana kadar derinlemesine arama yapilir — "logs" tek basina
  // yeterli bir sinyal degildir.
  if (!hasSubstantiveSignal(p)) {
    await deepProbe(path, p, 3);
  }

  // --- package.json: gercek kimlik kaynagi ---
  const pkg = await probePackageJson(path);
  if (pkg) p.owner = pkg;

  // --- Klasor adindan kimlik (kanit, kesin gercek degil) ---
  if (!p.owner) {
    const base = path.split('\\').filter(Boolean).pop();
    if (base && !base.startsWith('.') && base.length > 2) {
      p.owner = { kind: 'directoryName', name: base };
    }
  }

  // --- log dosyalarindan uretim sinyalleri ---
  if (names.has('logs') || [...names].some((n) => LOG_DIR_RE.test(n))) {
    await probeLogs(path, p);
  }
  // kokte tek duran log (daemon.log, runtimed.log vb.)
  const rootLogs = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.log'));
  for (const l of rootLogs.slice(0, 3)) {
    await readLogFile(`${path}\\${l.name}`, p);
  }

  p.fileKinds = [...new Set(p.fileKinds)];
  p.markers = [...new Set(p.markers)];
  return p;
}

/**
 * Klasor icinde sinyali arar (BFS, sinirli derinlik + cocuk siniri).
 *
 * Maliyet kontrollu: her seviyede en fazla MAX_PROBE_CHILDREN cocuk
 * klasor incelenir ve kullanici dizini gibi devasa agaclar atlanir.
 * Boylece 10 GB'lik NuGet deposu 2 saniyede siniflanir.
 */
const MAX_PROBE_CHILDREN = 40;
const SKIP_PROBE_DIRS = new Set(['node_modules', 'site-packages', '.git', 'envs']);

/**
 * `packages` gibi devasa ve homogeneous dizinler (NuGet deposu 9.9 GB)
 * atlanirsa kanit bulunamaz. Boyle dizinlere daha derinden (ama yine
 * sinirli sayida cocukla) bakilir.
 *
 * `packages` burada DEGILDIR: o ad hem Windows uygulama paketlerinde
 * hem paket yoneticisi depolarinda gecebilir. Karisikligi onlemek icin
 * packages yalnizca `probePackageStore` ile, kanit odakli taranir.
 */
const DEEP_PROBE_DIRS = new Set(['_cacache', 'cache', 'caches']);

/**
 * Paket DEPOLARI: onlarca-yuzlerce cocuk klasoru vardir ve her biri
 * ayni turden paket icerir. Kok seviyeye bakmak yetersizdir ama
 * yuzlerce klasoru tam taraymak da gereksizdir.
 *
 * Cozum: yalnizca ilk birkac cocuga inilir ve iclerinde nupkg /
 * nuspec / sha512 isareti aranir. Bir tanesi bulunmasi yeterlidir.
 */
const STORE_PROBE_SAMPLE = 6;

/**
 * Onklemede inilmemesi gereken klasorler. Bunlar ya kullanicinin
 * gercek verisidir ya da uygulama kurulumudur; iclerindeki tek bir
 * DLL, klasorun "artik" oldugunu kanitlamaz.
 */
const NEVER_PROBE = new Set([
  'programs', 'windows', 'microsoft', 'packages', 'wsl',
  'node_modules', 'site-packages', '.git', 'envs',
]);

/**
 * Kok seviyesindeki isaret gercekten bir tur bildiriyor mu?
 * "logs" tek basina yeterli degil: .MuhasibPro'da asil varlik
 * (CUDA runtime, model agirligi) iki seviye asagida.
 */
function hasSubstantiveSignal(p: Probe): boolean {
  if (p.fileKinds.some((k) => k !== 'log' && k !== 'sqlite')) return true;
  if (p.editorExtensions || p.appVersions || p.skillStore) return true;
  // manifest / ortam isaretleri anlamli
  if (p.markers.some((m) => /node_modules|site-packages|pyvenv|conda|pixi|models|envs|ep$|store|cachedir|app-versions|skill-lock/i.test(m))) {
    return true;
  }
  return false;
}

async function deepProbe(dir: string, p: Probe, depth: number): Promise<void> {
  if (depth <= 0) return;
  let entries;
  try {
    entries = await readdir(longPath(dir), { withFileTypes: true });
  } catch {
    return;
  }

  const dirs = entries.filter((e) => e.isDirectory()).slice(0, MAX_PROBE_CHILDREN);

  for (const e of entries) {
    if (e.isDirectory()) continue;
    const k = kindOfFile(e.name);
    if (k) p.fileKinds.push(k);
    if (CUDA_DLL_RE.test(e.name) || ORT_DLL_RE.test(e.name)) {
      p.fileKinds.push('cuda-runtime');
    }
    const n = e.name.toLowerCase();
    if (e.name.toUpperCase() === 'CACHEDIR.TAG') p.markers.push('cachedir-tag');
    if (NODE_MARKERS.has(n) || PYENV_MARKERS.has(n) || RUNTIME_POOL_MARKERS.has(n) || MODEL_MARKERS.has(n)) {
      p.markers.push(e.name);
    }
    // Alt dizin adlari da isaret olabilir (rattler/pkgs, uv/cache...)
    if (/^(_cacache|_npx|pkgs|repodata|archives|packs|simple-v|wheels)$/.test(n)) {
      p.markers.push('store');
    }
  }

  for (const d of dirs) {
    const n = d.name.toLowerCase();

    // `packages` adli konteyner ozel islem gorur: ic ice paket
    // depolarinda (or. global paket deposu) kanit iki seviye asagidadir.
    // NEVER_PROBE listesindeki ayni ad, burada kanit odakli taramaya
    // donusur; genel amacli derin probe yapilmaz.
    if (n === 'packages') {
      await probePackageStore(`${dir}\\${d.name}`, p);
      if (p.fileKinds.includes('nuget-package')) return;
      continue;
    }

    if (NUGET_CACHE_DIR_RE.test(n)) {
      if (await probeNuGetHttpCache(`${dir}\\${d.name}`)) {
        p.markers.push('cachedir-tag');
        p.markers.push('store');
      }
      continue;
    }

    if (NEVER_PROBE.has(n)) continue;
    const big = DEEP_PROBE_DIRS.has(n);
    if (SKIP_PROBE_DIRS.has(n) && !big) continue;
    // Homogeneous devasa dizinler icin daha derin ama yine sinirli
    await deepProbe(`${dir}\\${d.name}`, p, big ? depth : depth - 1);
    // Kanit yeterliyse daha derine inme
    if (p.fileKinds.length >= 4) return;
  }
}

/**
 * Paket deposu konteynerini tara: `<konteyner>\<paket>\<surum>\...`
 *
 * Kanit: .nupkg / .nuspec / .nupkg.sha512 / .nupkg.metadata.
 * Yalnizca ilk STORE_PROBE_SAMPLE paket klasorune ve her birinin
 * ilk STORE_PROBE_SAMPLE surum klasorune bakilir. TEK bir kanit
 * bulunmasi yeterlidir; depo tek turden yuzlerce paket icerir.
 */
async function probePackageStore(dir: string, p: Probe): Promise<void> {
  const rootEntries = await readdirSafe(dir);
  if (!rootEntries) return;

  // DIKKAT: Konteynerin KOKUNDE duran .nupkg dosyalari depo kaniti
  // SAYILMAZ. Bazi masaustu uygulamalarinin guncelleyicisi "packages"
  // klasorunde kendi kurulum nupkg dosyalarini tutar; bu bir onbellek
  // degil, uygulamanin kendisidir. Depo kaniti ancak bir paket/surum
  // klasoru icinde aranir: packages\<paket>\<surum>\<dosya>.
  const packages = rootEntries.filter((e) => e.isDirectory()).slice(0, STORE_PROBE_SAMPLE);
  for (const pkg of packages) {
    const pkgDir = `${dir}\\${pkg.name}`;
    const pkgEntries = await readdirSafe(pkgDir);
    if (!pkgEntries) continue;

    collectPackageEvidence(pkgEntries, p);
    if (p.fileKinds.includes('nuget-package')) {
      markPackageStore(p);
      return;
    }

    // Surum klasorleri: <paket>\<surum>\<dosya>
    const versions = pkgEntries.filter((e) => e.isDirectory()).slice(0, STORE_PROBE_SAMPLE);
    for (const ver of versions) {
      const verEntries = await readdirSafe(`${pkgDir}\\${ver.name}`);
      if (!verEntries) continue;
      collectPackageEvidence(verEntries, p);
      if (p.fileKinds.includes('nuget-package')) {
        markPackageStore(p);
        return;
      }
    }
  }
}

/** Paket deposu kanitini Probe'a isler (tekrarsiz). */
function collectPackageEvidence(entries: Dirent[], p: Probe): void {
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (/\.nupkg(\.sha512|\.metadata)?$/i.test(e.name) || /\.nuspec$/i.test(e.name)) {
      if (!p.fileKinds.includes('nuget-package')) p.fileKinds.push('nuget-package');
      return;
    }
  }
}

function markPackageStore(p: Probe): void {
  if (!p.markers.includes('package-store')) p.markers.push('package-store');
}

/**
 * Ajan beceri deposu: skills/<beceri>/SKILL.md
 *
 * "skills" klasoru tek basina oyun verisi de olabilir. Kesin kanit
 * SKILL.md (veya kokteki .skill-lock.json) dosyasidir. Yalnizca
 * sinirli sayida cocuga bakilir; beceri deposu yuzlerce klasor
 * icerebilir.
 */
async function probeSkillStore(dir: string, p: Probe): Promise<void> {
  const entries = await readdirSafe(dir);
  if (!entries) return;

  if (entries.some((e) => e.isFile() && e.name.toLowerCase() === 'skill.md')) {
    p.skillStore = true;
    if (!p.markers.includes('skill-store')) p.markers.push('skill-store');
    return;
  }

  const children = entries.filter((e) => e.isDirectory()).slice(0, STORE_PROBE_SAMPLE);
  for (const c of children) {
    const files = await readdirSafe(`${dir}\\${c.name}`);
    if (files?.some((e) => e.isFile() && e.name.toLowerCase() === 'skill.md')) {
      p.skillStore = true;
      if (!p.markers.includes('skill-store')) p.markers.push('skill-store');
      return;
    }
  }
}

/**
 * Editor uzanti deposu: extensions/extensions.json
 *
 * Manifest, hangi surumun AKTIF oldugunun tek guvenilir kaynagidir.
 * Depo taninir; eski surumlerin secimi analiz katmaninda yapilir.
 */
async function probeExtensionStore(dir: string, p: Probe): Promise<void> {
  try {
    const st = await stat(longPath(`${dir}\\extensions.json`));
    if (!st.isFile()) return;
  } catch {
    return;
  }
  p.editorExtensions = true;
  p.markers.push('extensions-store');
}

/** NuGet HTTP onbellegi klasor adlari (ad tek basina kanit DEGILDIR). */
const NUGET_CACHE_DIR_RE = /^(v3-cache|plugins-cache)$/i;

/**
 * NuGet HTTP onbellegi (v3-cache / plugins-cache) mi?
 *
 * Kanit: ad NuGet'e ozgu olsa bile klasorun icinde gercek bir dosya
 * bulunmasi gerekir. Bos bir klasor "onbellek kaniti" degildir.
 */
async function probeNuGetHttpCache(dir: string): Promise<boolean> {
  const entries = await readdirSafe(dir);
  if (!entries) return false;
  return entries.some((e) => e.isFile());
}

async function readdirSafe(dir: string): Promise<Dirent[] | null> {
  try {
    return await readdir(longPath(dir), { withFileTypes: true });
  } catch {
    return null;
  }
}

/** Bir klasorde en az bir Markdown dosyasi var mi? (tek seviye) */
async function dirHasMarkdown(dir: string): Promise<boolean> {
  const entries = await readdirSafe(dir);
  return !!entries?.some((e) => e.isFile() && /\.md$/i.test(e.name));
}

/** Proje ici bagimlilik klasorleri (T31). Ad tek basina kanit degildir. */
const PROJECT_DEP_DIRS = new Set(['node_modules', '.venv', 'venv']);

/** Birebir yeniden kurulumu saglayan kilit dosyalari. */
const NODE_LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock'];
const PY_MANIFESTS = ['pyproject.toml', 'requirements.txt', 'setup.py', 'pipfile'];
const PY_LOCKFILES = ['uv.lock', 'poetry.lock', 'pipfile.lock'];

/** Proje koku aramasi bu kadar ust seviyeyi gecer (monorepo icin). */
const MAX_PROJECT_ROOT_LEVELS = 4;

/**
 * node_modules / .venv gercekten bir PROJEYE mi ait? (T31)
 *
 * Karar adla verilmez; ust dizinlerde kaynak manifesti aranir. Bulunursa
 * "proje bagimliligi" olur ve yeniden uretilebilirlik kaniti toplanir:
 *   - lockfile  -> birebir yeniden kurulum mumkun
 *   - patches/  -> yamalarin yeniden uygulanmasi gerekir
 *   - file:/link:/workspace: -> proje disina bagli yerel paketler
 *
 * Ic ice node_modules zinciri proje koku SAYILMAZ; aksi halde bir
 * bagimliligin icindeki package.json yanlis kanit olurdu.
 */
async function probeProjectArtifact(path: string, p: Probe): Promise<void> {
  const base = path.split('\\').filter(Boolean).pop()?.toLowerCase() ?? '';
  if (!PROJECT_DEP_DIRS.has(base)) return;
  const ecosystem: 'node' | 'python' = base === 'node_modules' ? 'node' : 'python';

  let dir = dirname(path);
  for (let level = 0; level < MAX_PROJECT_ROOT_LEVELS; level++) {
    const name = dir.split('\\').filter(Boolean).pop()?.toLowerCase() ?? '';
    if (name === 'node_modules' || name === '.git') return;

    const ents = await readdirSafe(dir);
    if (!ents) return;
    const names = new Set(ents.map((e) => e.name.toLowerCase()));

    const manifest =
      ecosystem === 'node'
        ? names.has('package.json') ? 'package.json' : null
        : PY_MANIFESTS.find((m) => names.has(m)) ?? null;

    if (!manifest) {
      const parent = dirname(dir);
      if (parent === dir) return;
      dir = parent;
      continue;
    }

    const lockfile =
      ecosystem === 'node'
        ? NODE_LOCKFILES.find((l) => names.has(l)) ?? null
        : PY_LOCKFILES.find((l) => names.has(l)) ?? null;

    let patches = names.has('patches');
    let localDeps = false;
    if (ecosystem === 'node') {
      const pkg = await readJsonSafe(join(dir, 'package.json'));
      if (pkg) {
        const pnpm = pkg.pnpm as Record<string, unknown> | undefined;
        const patched = pnpm?.patchedDependencies;
        if (patched && typeof patched === 'object' && Object.keys(patched).length > 0) patches = true;
        for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
          const deps = pkg[field] as Record<string, unknown> | undefined;
          if (!deps) continue;
          for (const v of Object.values(deps)) {
            if (typeof v === 'string' && /^(file:|link:|workspace:|\.{1,2}[\\/])/i.test(v)) {
              localDeps = true;
              break;
            }
          }
          if (localDeps) break;
        }
      }
    }

    p.projectArtifact = { ecosystem, projectRoot: dir, manifest, lockfile, patches, localDeps };
    p.markers.push('project-artifact', 'project-manifest', `project-deps:${ecosystem}`);
    if (lockfile) p.markers.push(`lockfile:${lockfile}`);
    if (patches) p.markers.push('patched-deps');
    if (localDeps) p.markers.push('local-path-deps');
    return;
  }
}

/**
 * `rules/` klasoru gercekten kural dosyalari mi iceriyor? (T28)
 * Genel "rules" adi tek basina kanit degildir; icerikte .rules veya
 * rules.json olmalidir. Yalnizca ilk 40 girdiye bakilir.
 */
async function probeRulesDir(dir: string): Promise<boolean> {
  const ents = await readdirSafe(dir);
  if (!ents) return false;
  return ents.slice(0, 40).some(
    (e) => e.isFile() && (/\.rules$/i.test(e.name) || e.name.toLowerCase() === 'rules.json'),
  );
}

/** Kucuk JSON dosyasini guvenli okur (manifest disi veri sayilmaz). */
async function readJsonSafe(file: string): Promise<Record<string, unknown> | null> {
  try {
    const st = await stat(longPath(file));
    if (!st.isFile() || st.size > 256 * 1024) return null;
    const j = JSON.parse(await readFile(longPath(file), 'utf8')) as unknown;
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Bilinen paket yoneticisi depolarini YAPIDAN tanir (T32).
 *
 * Onemli guvenlik kurali: pnpm ve bun ana klasorleri uygulamanin
 * kendisini de icerir (`pnpm.exe`, `bun.exe`). Bu yuzden depo kokü
 * taranan klasorden farkliysa `cacheRoot` olarak isaretlenir ve silme
 * hedefi YALNIZCA o alt klasor olur.
 */
async function probePackageManagerStore(path: string, p: Probe): Promise<void> {
  const hit =
    (await findPnpmStore(path)) ??
    (await findYarnCache(path)) ??
    (await findBunCache(path));
  if (!hit) return;
  p.markers.push('store', hit.marker);
  if (normLocal(hit.root) !== normLocal(path)) p.cacheRoot = hit.root;
}

const HEX2_RE = /^[0-9a-f]{2}$/i;
const HEX_HASH_RE = /^[0-9a-f]{20,}$/i;
const VERSION_DIR_RE = /^v\d+$/i;
/** Bun depo girdisi: `pkg@1.2.3` veya `@scope+pkg@1.2.3`. */
const PKG_AT_VERSION_RE = /^(@[^@\\/]+[+/])?[^@\\/]+@\d+\.\d+\.\d+/i;

interface StoreHit {
  root: string;
  marker: string;
}

function normLocal(p: string): string {
  return p.replace(/[\\/]+$/, '').toLowerCase();
}

async function childDirs(
  dir: string,
  match: (name: string) => boolean,
  max = 8,
): Promise<string[]> {
  const ents = await readdirSafe(dir);
  if (!ents) return [];
  return ents
    .filter((e) => e.isDirectory() && match(e.name))
    .slice(0, max)
    .map((e) => join(dir, e.name));
}

/**
 * pnpm: icerik adresli depo. Kanit `files\xx\<hash>` duzeni (iki harf
 * onek + uzun hex dosya adi) ve genelde yanindaki `index` klasoru.
 * Ad ("pnpm") tek basina kanit sayilmaz.
 */
async function findPnpmStore(root: string): Promise<StoreHit | null> {
  const base = root.split('\\').filter(Boolean).pop()?.toLowerCase() ?? '';
  const candidates: string[] = [root];
  if (base !== 'store') candidates.push(join(root, 'store'));

  const storeBase = base === 'store' ? root : join(root, 'store');
  candidates.push(...(await childDirs(storeBase, (n) => VERSION_DIR_RE.test(n))));
  // Taranan klasor dogrudan surum deposu ise (store\v10) yukarida root zaten denenir.

  for (const c of candidates) {
    if (await isPnpmFilesStore(c)) return { root: c, marker: 'pnpm-store' };
  }
  return null;
}

async function isPnpmFilesStore(dir: string): Promise<boolean> {
  const files = join(dir, 'files');
  if (!existsSync(longPath(files))) return false;
  const prefixes = (await readdirSafe(files))?.filter(
    (e) => e.isDirectory() && HEX2_RE.test(e.name),
  ).slice(0, 3) ?? [];
  if (prefixes.length === 0) return false;
  for (const pre of prefixes) {
    const kids = await readdirSafe(join(files, pre.name));
    if (kids?.some((k) => k.isFile() && HEX_HASH_RE.test(k.name))) return true;
  }
  return false;
}

/**
 * yarn: v1 icin `v6/v8` altinda `.yarn-metadata.json` tasiyan paket
 * klasorleri; Berry icin `*-npm-*.zip` arsivleri. Ikisi de yapidir.
 */
async function findYarnCache(root: string): Promise<StoreHit | null> {
  const candidates: string[] = [root, join(root, 'Cache'), join(root, 'cache')];
  for (const base of [root, join(root, 'Cache'), join(root, 'cache')]) {
    candidates.push(...(await childDirs(base, (n) => VERSION_DIR_RE.test(n))));
  }
  candidates.push(join(root, 'Berry', 'cache'), join(root, 'berry', 'cache'));

  for (const c of candidates) {
    if (await isYarnCacheDir(c)) return { root: c, marker: 'yarn-cache' };
  }
  return null;
}

async function isYarnCacheDir(dir: string): Promise<boolean> {
  const ents = await readdirSafe(dir);
  if (!ents) return false;

  // Berry: paket arsivleri (adinda -npm- gecen .zip)
  const zips = ents.filter((e) => e.isFile() && /-npm-.*\.zip$/i.test(e.name));
  if (zips.length >= 2) return true;

  // v1: paket klasorlerinde .yarn-metadata.json
  let hits = 0;
  for (const e of ents.filter((x) => x.isDirectory()).slice(0, 6)) {
    if (await hasYarnMetadata(join(dir, e.name))) {
      hits++;
      if (hits >= 2) return true;
    }
  }
  return false;
}

async function hasYarnMetadata(entry: string): Promise<boolean> {
  if (existsSync(longPath(join(entry, '.yarn-metadata.json')))) return true;
  const modules = await readdirSafe(join(entry, 'node_modules'));
  if (!modules) return false;
  return modules
    .filter((e) => e.isDirectory())
    .slice(0, 3)
    .some((e) => existsSync(longPath(join(entry, 'node_modules', e.name, '.yarn-metadata.json'))));
}

/**
 * bun: `install\cache` altinda `pkg@surum` klasorleri (her birinde
 * package.json). Rastgele bir "cache" klasoru bu yapiyi saglamaz.
 */
async function findBunCache(root: string): Promise<StoreHit | null> {
  const candidates = [join(root, 'install', 'cache'), join(root, 'cache'), root];
  for (const c of candidates) {
    if (await isBunCacheDir(c)) return { root: c, marker: 'bun-cache' };
  }
  return null;
}

async function isBunCacheDir(dir: string): Promise<boolean> {
  const ents = await readdirSafe(dir);
  if (!ents) return false;
  const dirs = ents
    .filter((e) => e.isDirectory() && PKG_AT_VERSION_RE.test(e.name))
    .slice(0, 8);
  if (dirs.length < 2) return false;

  let withPackageJson = 0;
  let withBunTag = 0;
  for (const d of dirs) {
    const kids = await readdirSafe(join(dir, d.name));
    if (kids?.some((k) => k.isFile() && k.name.toLowerCase() === 'package.json')) withPackageJson++;
    if (kids?.some((k) => k.name.toLowerCase() === '.bun-tag')) withBunTag++;
  }
  if (withPackageJson < 2) return false;

  const inInstallCache = /[\\/]install[\\/]cache[\\/]?$/i.test(dir);
  return inInstallCache || withBunTag >= 2;
}

async function probePackageJson(dir: string): Promise<OwnerSignal | null> {
  const f = `${dir}\\package.json`;
  try {
    const st = await stat(longPath(f));
    if (!st.isFile() || st.size > 64 * 1024) return null;
    const txt = await readFile(longPath(f), 'utf8');
    const j = JSON.parse(txt) as Record<string, unknown>;
    const name = typeof j.name === 'string' ? j.name : null;
    if (!name) return null;
    const version = typeof j.version === 'string' ? j.version : undefined;
    return { kind: 'packageJson', name, version };
  } catch {
    return null;
  }
}

const LOG_MARKERS: Array<{ re: RegExp; means: string }> = [
  { re: /Azure\s+Foundry|azure\.com\/api\/.*catalog|ai\.azure\.com/i, means: 'Azure AI Foundry model katalogu' },
  { re: /CUDAExecutionProvider|DirectMLExecutionProvider|OrtGpuExecutionProvider/i, means: 'GPU saglayicisi kullanildi' },
  { re: /\bDevice:\s*CPU\b|CPUExecutionProvider/i, means: 'cihaz tipi: CPU (GPU kullanilmiyor)' },
  { re: /EPs are not fully registered|DownloadAndRegisterEpsAsync|EP registration deferred/i, means: 'GPU saglayicisi kaydedilmemis' },
  { re: /onnxruntime/i, means: 'ONNX Runtime model calistirma' },
  { re: /pipe\\/i, means: 'arka plan servisi (named pipe)' },
  { re: /conda|pixi|uv pool|site-packages/i, means: 'Python ortam yoneticisi' },
  { re: /Notebook|kernel|jupyter/i, means: 'notebook calistirma ortami' },
  { re: /npm (install|ci)|npm-cache[\\/]_cacache/i, means: 'npm paket onbellegi' },
  { re: /nuget\.org|NuGet\.Config|packages folder/i, means: 'NuGet paket onbellegi' },
  { re: /WSL|distribution/i, means: 'Linux dagitimi' },
];

async function probeLogs(dir: string, p: Probe): Promise<void> {
  const logsDir = `${dir}\\logs`;
  let names: string[] = [];
  try {
    const ents = await readdir(longPath(logsDir));
    names = ents.filter((n) => n.toLowerCase().endsWith('.log')).sort().reverse();
  } catch {
    const rootLogs = await readdir(longPath(dir));
    names = rootLogs.filter((n) => n.toLowerCase().endsWith('.log')).slice(0, 3);
  }
  const newest = names.slice(0, 2);
  for (const n of newest) {
    await readLogFile(`${dir}\\${n.startsWith('logs') ? n : `logs\\${n}`}`, p, dir);
  }
}

async function readLogFile(f: string, p: Probe, root?: string): Promise<void> {
  const target = root ? `${root}\\${f.replace(`${root}\\`, '')}` : f;
  try {
    const st = await stat(longPath(target));
    if (!st.isFile() || st.size > MAX_TEXT_PROBE) return;
    const txt = await readFile(longPath(target), 'utf8');
    const lines = txt.split(/\r?\n/).filter(Boolean).slice(0, 400);
    for (const line of lines) {
      // BIR SATIR BIRDEN FAZLA isaret tasiyabilir. Ilk eslesmede
      // break etmek kanit kaybettirir: "Device: CPU,EPs: CPUExecutionProvider"
      // satiri hem cihaz tipi hem saglayici bilgisi tasiyor.
      for (const m of LOG_MARKERS) {
        if (m.re.test(line)) {
          p.logSignals.push({ line: line.trim().slice(0, 180), means: m.means });
        }
      }
    }
  } catch {
    /* okunamadi, kanit yok */
  }
}

/**
 * Dosya adindan uygulama kimligi cikar (basit, guvenilir kaynak).
 * Installer/updater adlari sahiplik ipucu verir:
 *   "@scope-app-updater" -> "app"
 */
export function ownerFromName(name: string): string | null {
  const cleaned = name.replace(/[-_.]updater$/i, '');
  const m = /^@([a-z0-9_-]+)[/-]/i.exec(cleaned);
  if (m) return m[1]!;
  return cleaned || null;
}