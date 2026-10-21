/**
 * Kucuk, bagimsiz semver alt kumesi.
 *
 * Neden: proje "hangi kurulum daha yeni / hangi surum araligi karsilaniyor"
 * sorusunu yanitlarken iki farkli ad-hoc sayisal karsilastirma kullaniyordu.
 * Bu modul tek kaynak saglar:
 *   - semver siralamasi (prerelease dahil),
 *   - `^`, `~`, `>=`, `<=`, `>`, `<`, `=`, `*`, `x`, `-` araligi ve `||`,
 *   - `maxSatisfying`.
 *
 * Tam npm semver cozucusu DEGILDIR (workspace/protocol araliklari yok);
 * karar destegi icin gereken kismi dogru ve deterministik uygular.
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string[];
  raw: string;
}

const VERSION_RE =
  /^[v=\s]*(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

export function parseVersion(input: string): SemVer | null {
  const m = VERSION_RE.exec(input.trim());
  if (!m) return null;
  const major = Number(m[1]);
  const minor = m[2] === undefined ? 0 : Number(m[2]);
  const patch = m[3] === undefined ? 0 : Number(m[3]);
  if (![major, minor, patch].every((n) => Number.isSafeInteger(n) && n >= 0)) return null;
  return {
    major,
    minor,
    patch,
    prerelease: m[4] ? m[4].split('.') : [],
    build: m[5] ? m[5].split('.') : [],
    raw: input.trim(),
  };
}

function compareIdentifier(a: string, b: string): number {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Math.sign(Number(a) - Number(b));
  if (an) return -1; // numeric identifier < alphanumeric
  if (bn) return 1;
  return Math.sign(a.localeCompare(b));
}

/** Semver 2.0 siralama. Gecersiz surumler esit kabul edilir (0). */
export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return Math.sign(a.major - b.major);
  if (a.minor !== b.minor) return Math.sign(a.minor - b.minor);
  if (a.patch !== b.patch) return Math.sign(a.patch - b.patch);

  // Prerelease'i olan surum, olmayandan KUCUKTUR.
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (b.prerelease.length === 0 && a.prerelease.length > 0) return -1;
  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const c = compareIdentifier(x, y);
    if (c !== 0) return c;
  }
  return 0;
}

/** Gevsek karsilastirma: `v1.2.3` / `1.2` / `1.2.3+build` kabul eder. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return a.localeCompare(b);
  if (!pa) return -1;
  if (!pb) return 1;
  return compareSemVer(pa, pb);
}

export function sortVersions<T extends string>(versions: T[]): T[] {
  return [...versions].sort(compareVersions);
}

export function maxSatisfying(versions: string[], range: string): string | null {
  let best: string | null = null;
  for (const v of versions) {
    if (!satisfies(v, range)) continue;
    if (best === null || compareVersions(v, best) > 0) best = v;
  }
  return best;
}

function isWildcard(part: string | undefined): boolean {
  return part === undefined || part === '' || part === '*' || part === 'x' || part === 'X';
}

function cmp(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function testComparator(version: SemVer, op: string, target: SemVer): boolean {
  const c = compareSemVer(version, target);
  switch (op) {
    case '>':
      return c > 0;
    case '>=':
      return c >= 0;
    case '<':
      return c < 0;
    case '<=':
      return c <= 0;
    case '=':
    case '':
      return c === 0;
    default:
      return false;
  }
}

interface Comparator {
  op: string;
  version: SemVer;
  /** Alt sinir mi? (`^1.2.3` -> >=1.2.3 <2.0.0) */
  includePrerelease?: boolean;
}

function expandToken(token: string): Comparator[] {
  const t = token.trim();
  if (!t || t === '*' || t === 'x' || t === 'X') return [];

  // ^ / ~ with wildcards and partial versions
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(t);
  if (!m) return [];
  const op = m[1] ?? '';
  const body = (m[2] ?? '').trim();
  const parts = body.replace(/^v/, '').split('.');
  const majorW = isWildcard(parts[0]);
  const minorW = isWildcard(parts[1]);
  const patchW = isWildcard(parts[2]);
  if (majorW) return [];

  const major = Number(parts[0]);
  const minor = minorW ? 0 : Number((parts[1] ?? '0').replace(/[^0-9].*$/, ''));
  const patch = patchW ? 0 : Number((parts[2] ?? '0').replace(/[^0-9].*$/, ''));
  const pre = /-([0-9A-Za-z.-]+)$/.exec(parts[2] ?? '')?.[1];
  const base = parseVersion(
    `${major}.${minor}.${patch}${pre ? `-${pre}` : ''}`,
  );
  if (!base) return [];

  if (op === '^') {
    // Ilk sifir olmayan bilesen sabitlenir.
    let upper: string;
    if (major > 0) upper = `${major + 1}.0.0`;
    else if (minor > 0) upper = `0.${minor + 1}.0`;
    else upper = `0.0.${patch + 1}`;
    return [
      { op: '>=', version: base },
      { op: '<', version: parseVersion(upper)! },
    ];
  }
  if (op === '~') {
    const upper = major > 0 || minor > 0 ? `${major}.${minor + 1}.0` : `0.0.${patch + 1}`;
    return [
      { op: '>=', version: base },
      { op: '<', version: parseVersion(upper)! },
    ];
  }
  if (op === '>=' || op === '<=' || op === '>' || op === '<' || op === '=') {
    return [{ op, version: base }];
  }
  // Operatorsuz: partial ise x-range gibi davran.
  if (minorW) {
    return [
      { op: '>=', version: parseVersion(`${major}.0.0`)! },
      { op: '<', version: parseVersion(`${major + 1}.0.0`)! },
    ];
  }
  if (patchW) {
    return [
      { op: '>=', version: parseVersion(`${major}.${minor}.0`)! },
      { op: '<', version: parseVersion(`${major}.${minor + 1}.0`)! },
    ];
  }
  return [{ op: '=', version: base }];
}

function parseRangeSet(range: string): Comparator[] {
  const out: Comparator[] = [];
  const tokens = range.trim().split(/\s+/).filter(Boolean);
  // Hyphen range: `1.2.3 - 2.3.4`
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1];
    const c = tokens[i + 2];
    if (b === '-' && c) {
      out.push({ op: '>=', version: parseVersion(a) ?? parseVersion(`${a}.0.0`)! });
      out.push({ op: '<=', version: parseVersion(c) ?? parseVersion(`${c}.0.0`)! });
      i += 2;
      continue;
    }
    out.push(...expandToken(a));
  }
  return out;
}

/**
 * Aralik testi. `range` bos/`*` ise her surum uyar.
 * OR (`||`) ve AND (bosluk) desteklenir.
 */
export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version);
  if (!v) return false;
  const sets = range.split('||');
  return sets.some((set) => {
    const comparators = parseRangeSet(set);
    return comparators.every((c) => testComparator(v, c.op, c.version));
  });
}

/** Aralik gecerli mi? (UI'da erken uyari icin) */
export function validRange(range: string): boolean {
  const trimmed = range.trim();
  if (!trimmed || trimmed === '*' || trimmed === 'x') return true;
  return trimmed
    .split('||')
    .every((set) => set.trim().length === 0 || parseRangeSet(set).length > 0);
}
