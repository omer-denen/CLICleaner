/**
 * CLI envanteri icin Markdown rapor ureticisi.
 *
 * SALT SUNUM: hicbir dosya okumaz, hicbir komut calistirmaz. Yalnizca
 * CliInventory verisini paylasilabilir bir Markdown metnine cevirir.
 * Kararlar (atil/bozuk/duplicate) tarama katmaninda verilir; burada
 * yalnizca insan okur bicime dokulur.
 */

import type { CliInventory, CliTool } from './cli-inventory-types.ts';
import { formatBytes, formatDate, formatDateTime } from '../util/format.ts';

/** Kaynak etiketi; terminal ciktisi ve rapor ayni sozlugu kullanir. */
export const SOURCE_LABEL: Record<string, string> = {
  'npm-global': 'npm -g',
  'uv-tool': 'uv tool',
  'dotnet-tool': 'dotnet tool',
  'pip-user': 'pip --user',
  standalone: 'bagimsiz',
};

const STATUS_LABEL: Record<CliTool['status'], string> = {
  unused: 'Atıl',
  recent: 'Yakında kullanıldı',
  unknown: 'Doğrulama gerekiyor',
  protected: 'Korunuyor',
};

function src(t: CliTool): string {
  return SOURCE_LABEL[t.source] ?? t.source;
}

function code(s: string): string {
  return '`' + s + '`';
}

/** Tablo hucresi icinde boru/ satir sonu kacisi. */
function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function idleText(t: CliTool): string {
  return Number.isFinite(t.idleDays) ? `${Math.max(0, Math.floor(t.idleDays))} gün` : 'bilinmiyor';
}

/** Son sinyal tarihi (shim erisimi veya durum klasoru yazimi). */
function lastSignalAt(t: CliTool): number {
  return Math.max(t.lastAccessAt, t.lastStateAt);
}

function toolSection(t: CliTool): string[] {
  const lines: string[] = [];
  const signal = lastSignalAt(t);
  lines.push(`### ${t.command} — ${src(t)}`);
  lines.push('');
  lines.push(
    `- Paket: ${code(`${t.packageName}@${t.version || '?'}`)} · Boyut: ${formatBytes(t.totalBytes)} · Güven: ${t.confidence}`,
  );
  lines.push(`- Kurulum: ${code(t.installPath)}`);
  lines.push(
    `- Son sinyal: ${idleText(t)} önce${signal > 0 ? ` (${formatDate(signal)})` : ''}`,
  );
  if (t.activeShim === false) {
    lines.push('- Not: gölgede kalan kurulum (aktif shim başka paketi gösteriyor)');
  } else if (t.activeShim === true && t.shimTarget) {
    lines.push(`- Aktif shim hedefi: ${code(t.shimTarget)}`);
  }
  if (t.health === 'broken') {
    const ev = t.healthEvidence && t.healthEvidence.length > 0 ? ` — ${t.healthEvidence.join('; ')}` : '';
    lines.push(`- **Bozuk / yarım kurulum**${ev}`);
  }
  if (t.installTrace) {
    const at = t.installTrace.at > 0 ? formatDateTime(t.installTrace.at) : t.installTrace.logFile;
    lines.push(`- Kurulum izi: ${code(t.installTrace.command)} (${at})${t.installTrace.cwd ? ` · cwd: ${code(t.installTrace.cwd)}` : ''}`);
    if (t.installTrace.agentHint) lines.push(`- Ajan izi: ${t.installTrace.agentHint}`);
  }
  lines.push('');
  if (t.evidence.length > 0) {
    lines.push('Kanıt:');
    for (const e of t.evidence) lines.push(`- ${e}`);
    lines.push('');
  }
  if (t.health === 'broken' && t.repair) {
    lines.push(`Onarım: ${code(t.repair.display)}`);
    lines.push('');
  }
  if (t.uninstall) {
    lines.push(`Kaldırma: ${code(t.uninstall.display)}`);
    lines.push('');
  }
  return lines;
}

export function renderInventoryMarkdown(inv: CliInventory, generatedAt: number = Date.now()): string {
  const unused = inv.tools.filter((t) => t.status === 'unused');
  const unknown = inv.tools.filter((t) => t.status === 'unknown');
  const recent = inv.tools.filter((t) => t.status === 'recent');
  const protectedTools = inv.tools.filter((t) => t.status === 'protected');
  const broken = inv.tools.filter((t) => t.health === 'broken');
  const stale = inv.tools.flatMap((t) => t.stalePaths.map((p) => ({ tool: t, path: p })));
  const unusedBytes = unused.reduce((s, t) => s + (t.totalBytes || 0), 0);

  const L: string[] = [];

  L.push('# CLICleaner — CLI envanteri');
  L.push('');
  L.push(`Tarama: ${formatDateTime(inv.scannedAt)} · Rapor: ${formatDateTime(generatedAt)}`);
  L.push(`Atıllık eşiği: ${inv.unusedDays} gün · Depo: ${inv.roots.length} dizin`);
  L.push('');

  // ── Ozet ──────────────────────────────────────────────────────────
  L.push('## Özet');
  L.push('');
  L.push('| Durum | Adet |');
  L.push('| --- | ---: |');
  L.push(`| Atıl | ${unused.length} |`);
  L.push(`| Doğrulama gerekiyor | ${unknown.length} |`);
  L.push(`| Yakında kullanıldı | ${recent.length} |`);
  L.push(`| Korunuyor | ${protectedTools.length} |`);
  L.push(`| **Toplam** | **${inv.tools.length}** |`);
  L.push('');
  if (unused.length > 0) {
    L.push(`Atıl araçların toplam boyutu: **${formatBytes(unusedBytes)}**`);
    L.push('');
  }
  if (broken.length > 0) {
    L.push(`Bozuk / yarım kurulum: **${broken.length}**`);
    L.push('');
  }
  for (const n of inv.notes) L.push(`> Not: ${n}`);
  if (inv.notes.length > 0) L.push('');

  // ── Onerilen komutlar ────────────────────────────────────────────
  if (unused.some((t) => t.uninstall) || broken.some((t) => t.repair)) {
    L.push('## Önerilen komutlar');
    L.push('');
    if (unused.some((t) => t.uninstall)) {
      L.push('Kaldırma — paket yöneticisinin kendi komutuyla:');
      L.push('');
      for (const t of unused) {
        if (!t.uninstall) continue;
        L.push(`- ${code(t.uninstall.display)}  `);
        L.push(`  ${t.command} — ${formatBytes(t.totalBytes)}, son sinyal ${idleText(t)} önce`);
      }
      L.push('');
    }
    if (broken.some((t) => t.repair)) {
      L.push('Onarım — bozuk / yarım kurulumlar:');
      L.push('');
      for (const t of broken) {
        if (!t.repair) continue;
        L.push(`- ${code(t.repair.display)}  `);
        L.push(`  ${t.command} — ${src(t)}`);
      }
      L.push('');
    }
  }

  // ── Atil araclar (detay) ─────────────────────────────────────────
  if (unused.length > 0) {
    L.push('## Atıl araçlar');
    L.push('');
    L.push(`${inv.unusedDays}+ gündür hiçbir kullanım sinyali yok. Kaldırma yalnızca kullanıcı onayıyla yapılır; bu rapor hiçbir şey silmez.`);
    L.push('');
    for (const t of unused) L.push(...toolSection(t));
  }

  // ── Bozuk kurulumlar ─────────────────────────────────────────────
  if (broken.length > 0) {
    L.push('## Bozuk / yarım kurulumlar');
    L.push('');
    L.push('Geçerli PE başlığı bulunamadı (stub bin). Onarım paket yöneticisinin kendi `install` komutuyla yapılır.');
    L.push('');
    for (const t of broken) L.push(...toolSection(t));
  }

  // ── Coklu kurulum ────────────────────────────────────────────────
  if (inv.duplicates.length > 0) {
    L.push('## Aynı komutun çoklu kurulumu');
    L.push('');
    L.push('Karar burada verilmez; yalnızca hangi kurulumun tutulacağı kanıtla önerilir.');
    L.push('');
    for (const d of inv.duplicates) {
      const keep = inv.tools.find((t) => t.id === d.keepId);
      L.push(`### ${code(d.command)}`);
      L.push('');
      L.push(
        `- Tutulacak: ${keep ? `${code(`${keep.packageName}@${keep.version || '?'}`)} (${src(keep)})` : code(d.keepId)}${d.activeId && keep && d.activeId === keep.id ? ' — aktif shim bunu gösteriyor' : ''}`,
      );
      L.push(`- Gerekçe: ${d.reason}`);
      for (const rid of d.removeIds) {
        const r = inv.tools.find((t) => t.id === rid);
        if (!r) continue;
        L.push(
          `- Kaldırılacak: ${code(`${r.packageName}@${r.version || '?'}`)} (${src(r)})${r.uninstall ? ` — ${code(r.uninstall.display)}` : ' — paket yöneticisi yok, elle'}`,
        );
      }
      L.push('');
    }
  }

  // ── Eski surum kalintilari ───────────────────────────────────────
  if (stale.length > 0) {
    L.push('## Eski sürüm kalıntıları');
    L.push('');
    for (const s of stale) L.push(`- ${s.tool.command} (${src(s.tool)}) → ${code(s.path)}`);
    L.push('');
  }

  // ── Shim sorunlari (T17) ─────────────────────────────────────────
  if (inv.shimIssues.length > 0) {
    L.push('## Shim sorunları');
    L.push('');
    L.push('Shim ağı ile kurulumlar tutarsız. **SALT OKUNUR** kanıt; bu rapor hiçbir shim\'i silmez.');
    L.push('');
    for (const s of inv.shimIssues) {
      const kind =
        s.kind === 'orphan-shim'
          ? 'Öksüz shim (hedef yok)'
          : s.kind === 'missing-shim'
            ? 'Shim yok (paket kurulu)'
            : 'Boş scope';
      L.push(`- **${kind}:** ${code(s.path)} — ${s.detail}`);
    }
    L.push('');
  }

  // ── PATH golgeleme (T17) ─────────────────────────────────────────
  if (inv.pathShadows.length > 0) {
    L.push('## PATH gölgeleme');
    L.push('');
    L.push('Aynı komut PATH\'te birden fazla kez bulunuyor; yalnızca ilki çalışır, kalanlar ölü ağırlıktır.');
    L.push('');
    for (const s of inv.pathShadows) {
      L.push(`### ${code(s.command)}`);
      L.push('');
      L.push(s.detail);
      L.push('');
      s.entries.forEach((e, i) => {
        L.push(`${i + 1}. ${i === 0 ? '**çalışır**' : 'gölgede'} — ${code(e.path)} (${e.label})`);
      });
      L.push('');
    }
  }

  // ── PATH kaynaklari (T35) ────────────────────────────────────────
  const pc = inv.pathChannels;
  if (pc) {
    L.push('## PATH kaynakları (User / Machine)');
    L.push('');
    L.push('PATH, kullanıcı (HKCU) ve makine (HKLM) kayıtlarının birleşimidir. **SALT OKUNUR**: bu rapor PATH değiştirmez.');
    L.push('');
    L.push(`- User PATH: ${pc.userDirs.length} dizin`);
    L.push(`- Machine PATH: ${pc.machineDirs.length} dizin`);
    L.push(`- Birleştirilmiş PATH: ${pc.mergedDirs} tekil dizin`);
    if (pc.duplicates.length > 0) {
      L.push('');
      L.push('### Çakışmalar');
      L.push('');
      for (const d of pc.duplicates) {
        L.push(`- ${code(d.path)} — ${d.detail} (${d.sources.join(' + ')})`);
      }
    }
    if (pc.missing.length > 0) {
      L.push('');
      L.push('### Diskte olmayan dizinler');
      L.push('');
      for (const m of pc.missing.slice(0, 20)) {
        L.push(`- ${code(m.path)} (${m.source === 'user' ? 'User' : 'Machine'})`);
      }
    }
    if (pc.note) {
      L.push('');
      L.push(`Not: ${pc.note}`);
    }
    L.push('');
  }

  // ── Tum araclar tablosu ──────────────────────────────────────────
  L.push('## Tüm araçlar');
  L.push('');
  L.push('| Komut | Kaynak | Sürüm | Durum | Son sinyal | Boyut | Güven |');
  L.push('| --- | --- | --- | --- | ---: | ---: | --- |');
  const sorted = [...inv.tools].sort((a, b) => b.totalBytes - a.totalBytes);
  for (const t of sorted) {
    const flags = [
      t.health === 'broken' ? 'bozuk' : '',
      t.activeShim === false ? 'gölgede' : '',
    ].filter(Boolean).join(', ');
    L.push(
      `| ${cell(t.command)} | ${cell(src(t))} | ${cell(t.version || '?')} | ${STATUS_LABEL[t.status]}${flags ? ` (${flags})` : ''} | ${idleText(t)} | ${formatBytes(t.totalBytes)} | ${t.confidence} |`,
    );
  }
  L.push('');

  L.push('---');
  L.push('');
  L.push(`Depolar: ${inv.roots.length > 0 ? inv.roots.map((r) => code(r)).join(', ') : '-'}`);
  L.push('');
  L.push('Bu rapor **SALT OKUNUR** bir taramanın çıktısıdır; hiçbir komut çalıştırılmadı, hiçbir dosya silinmedi.');
  L.push('');

  return L.join('\n');
}
