/**
 * TUI tema. Renkler merkezi yerden yonetilir; boylece koyu/aci tema
 * degisikligi tek dosyadan yapilir.
 */

export const color = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  inverse: '\x1b[7m',

  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightCyan: '\x1b[96m',
};

export const glyph = {
  checked: '[x]',
  unchecked: '[ ]',
  partial: '[~]',
  recommended: '*',
  ask: '?',
  report: '-',
  branch: '|-',
  cursor: '>',
  bullet: '*',
  arrow: '->',
  dot: '.',
  ok: 'v',
  fail: 'x',
  warn: '!',
};

export const RISK_COLOR = {
  safe: color.brightGreen,
  low: color.cyan,
  medium: color.yellow,
  high: color.red,
} as const;

export const VERDICT_GLYPH = {
  recommend: { g: glyph.recommended, c: color.brightGreen },
  ask: { g: glyph.ask, c: color.brightYellow },
  'report-only': { g: glyph.report, c: color.gray },
  keep: { g: glyph.dot, c: color.gray },
} as const;

export const SECTION = {
  recommend: {
    title: 'ONERILEN  (guvenli, tek onayla temizlenir)',
    color: color.brightGreen,
  },
  ask: {
    title: 'DOGRULAMA  (once icerigi gor)',
    color: color.brightYellow,
  },
  'report-only': {
    title: 'RAPOR  (otomatik temizlenmez)',
    color: color.gray,
  },
  keep: {
    title: 'KORUNUYOR',
    color: color.gray,
  },
} as const;