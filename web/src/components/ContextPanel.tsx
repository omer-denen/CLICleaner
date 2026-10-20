import { useState } from 'react';
import type { Cluster } from '../../../src/core/types.ts';
import { formatBytes, formatCount } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';
import {
  ARCHETYPE_LABEL,
  CONFIDENCE_LABEL,
  REGEN_LABEL,
  RISK_LABEL,
  shortKey,
  shortPath,
  VERDICT_LABEL,
} from '../labels.ts';
import { EvidenceReader } from '../../../src/core/evidence-text.ts';
import { TargetMap } from '../../../src/core/target-map.ts';
import { TargetCommands, type SafeCommandId } from '../../../src/core/target-commands.ts';

/**
 * Sag sutun — baglam / "rontgen" paneli (T42 / D3 P2).
 *
 * Odaklanan (veya hover ile onizlenen) ogenin BUTUN kanitini tek yerde
 * gosterir: ne? ne olur? hangi kanit? hangi hedefler? guvenli komut?
 *
 * Kurallar:
 *   - Metin deterministiktir (dil modeli yok).
 *   - Panel HICBIR sey silmez; yalnizca komut gosterir/kopyalar.
 *   - Manuel komut ayri ve uyarilidir: kullanici kendi kararini verir.
 */

interface Props {
  cluster: Cluster | null;
  pinned: boolean;
  onTogglePin: () => void;
}

export function ContextPanel({ cluster, pinned, onTogglePin }: Props) {
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);

  if (!cluster) {
    return (
      <aside className="ctx" aria-label={t('Bağlam')}>
        <div className="ctx-empty">
          <p className="dim">{t('Odaklanan öğe yok.')}</p>
          <p className="dim small">
            {t('Bir satıra tıkla, ↑↓ ile gezin veya Enter ile sabitle.')}
          </p>
        </div>
      </aside>
    );
  }

  const v = cluster.verdict;
  const evidence = cluster.evidence;
  const targets = cluster.deleteTargets ?? [];
  const reading = new EvidenceReader(cluster).reading();
  const key = shortKey(cluster.key);

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1600);
    } catch {
      setCopied(null);
    }
  };

  /**
   * Komut metinleri MOTORDAN gelir (`src/core/target-commands.ts`);
   * panel yalnizca gosterir ve kopyalar. Kisaltilmis anahtar kullanilir
   * cunku kullanici onu terminale yazar.
   */
  const safeLabels: Record<SafeCommandId, string> = {
    explain: t('Karar gerekçesini aç'),
    'dry-run': t('Yalnız bu kümeyi kuru (plan)'),
  };
  const safeCommands = TargetCommands.safe(key).map((c) => ({
    ...c,
    label: safeLabels[c.id],
  }));

  const manualCommands = TargetCommands.manualList(targets);

  const targetMap = new TargetMap(targets);
  const targetsByPart = (partPath: string) => targetMap.underPart(partPath);

  return (
    <aside className="ctx" aria-label={t('Bağlam')}>
      <header className="ctx-head">
        <div className="ctx-title">
          <h2 title={cluster.title}>{cluster.title}</h2>
          <span className="mono dim">{key}</span>
        </div>
        <div className="ctx-tags">
          <span className={`tag tag-risk-${v.risk}`}>{t(RISK_LABEL[v.risk])}</span>
          <span className={`tag tag-verdict-${v.kind}`}>{t(VERDICT_LABEL[v.kind] ?? v.kind)}</span>
          <span className="tag">{t(ARCHETYPE_LABEL[cluster.archetype] ?? cluster.archetype)}</span>
          {v.regenerability && (
            <span className={`tag tag-regen-${v.regenerability}`}>
              {t(REGEN_LABEL[v.regenerability] ?? v.regenerability)}
            </span>
          )}
          {EvidenceReader.isGitTracked(cluster) && (
            <span className="tag tag-git" title={t('Git tarafından takip edilen yollar atlandı')}>
              git
            </span>
          )}
        </div>
        <button
          className={`btn small ctx-pin${pinned ? ' active' : ''}`}
          onClick={onTogglePin}
          title={pinned ? t('Sabitlemeyi kaldır') : t('Bu öğeyi sabitle')}
        >
          {pinned ? t('Sabitlendi') : t('Sabitle')}
        </button>
      </header>

      <section className="ctx-block">
        <h3>{t('Ne?')}</h3>
        <p>{v.what}</p>
        <h3>{t('Silersem ne olur?')}</h3>
        <p>{v.consequence}</p>
        {v.because.length > 0 && (
          <>
            <h3>{t('Neden bu karar?')}</h3>
            <ul className="ctx-list">
              {v.because.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </>
        )}
        {v.preconditions.length > 0 && (
          <>
            <h3>{t('Silmeden önce')}</h3>
            <ul className="ctx-list">
              {v.preconditions.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {reading.length > 0 && (
        <section className="ctx-block ctx-reading">
          <h3>{t('Kanıt yorumu')}</h3>
          <ul className="ctx-list">
            {reading.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <p className="dim small">
            {t('Bu metin kanıttan üretilir; bir dil modeli kullanılmaz.')}
          </p>
        </section>
      )}

      <section className="ctx-block">
        <h3>{t('Kanıtlar')}</h3>
        <div className="chips">
          {(evidence.fileKinds ?? []).map((k) => (
            <span className="chip" key={`k-${k}`}>
              {k}
            </span>
          ))}
          {(evidence.markers ?? []).map((m) => (
            <span className="chip chip-marker" key={`m-${m}`}>
              {m}
            </span>
          ))}
          {evidence.owner && (
            <span className="chip chip-owner">
              {t('sahip:')} {EvidenceReader.ownerLabel(evidence.owner)}
            </span>
          )}
          {v.confidence && (
            <span className="chip">{t(CONFIDENCE_LABEL[v.confidence] ?? v.confidence)}</span>
          )}
        </div>
        {(evidence.logSignals ?? []).length > 0 && (
          <ul className="logs">
            {(evidence.logSignals ?? []).map((l, i) => (
              <li key={i}>
                <span className="log-means">{l.means}</span>
                <span className="log-line">{l.line}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ctx-block">
        <h3>{t('Bağımlılık ağacı')}</h3>
        <ul className="tree">
          <li className="tree-root">
            <div className="tree-row">
              <span className="tree-label">{cluster.title}</span>
              <span className="mono dim">{formatBytes(cluster.totalBytes)}</span>
            </div>
            <ul>
              {cluster.parts.map((part) => (
                <li key={part.path}>
                  <div className="tree-row">
                    <code>{shortPath(part.path)}</code>
                    <span className="mono dim">
                      {formatBytes(part.bytes)} · {formatCount(part.files)} {t('dosya')}
                    </span>
                  </div>
                  {targetsByPart(part.path).map((target) => (
                    <div className="tree-row tree-target" key={target.path}>
                      <span className="tree-mark" aria-hidden="true">
                        ▸
                      </span>
                      <code>{shortPath(target.path)}</code>
                      <span className="mono dim">
                        {formatBytes(target.bytes)} ·{' '}
                        {target.kind === 'whole'
                          ? t('klasörün tamamı')
                          : t('yalnızca {n}+ gün eski dosyalar', { n: target.minAgeDays ?? 0 })}
                      </span>
                    </div>
                  ))}
                </li>
              ))}
              {(cluster.subparts ?? []).map((sp) => (
                <li key={sp.path}>
                  <div className="tree-row">
                    <code>{shortPath(sp.path)}</code>
                    <span className="mono dim">{formatBytes(sp.bytes)}</span>
                  </div>
                  <div className="dim small">{sp.reason}</div>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      </section>

      <section className="ctx-block">
        <h3>{t('Güvenli komut')}</h3>
        <p className="dim small">
          {t('Bunlar yalnızca plan üretir; hiçbir şeyi silmez.')}
        </p>
        {safeCommands.map((c) => (
          <div className="cmd" key={c.text}>
            <code>{c.text}</code>
            <button className="icon-btn" onClick={() => void copy(c.text, c.text)} title={t('Kopyala')}>
              {copied === c.text ? '✓' : '⧉'}
            </button>
            <span className="dim small">{c.label}</span>
          </div>
        ))}
      </section>

      {manualCommands.length > 0 && (
        <section className="ctx-block ctx-manual">
          <h3>{t('Manuel komut (PowerShell)')}</h3>
          <p className="ctx-warn">
            {t(
              'Bu komut aracın kontrolünden geçmez ve geri alınamaz. Yalnız ne silmek istediğinden eminsen kullan.',
            )}
          </p>
          {manualCommands.map((c) => (
            <div className="cmd cmd-danger" key={c.text}>
              <code>{c.text}</code>
              <button className="icon-btn" onClick={() => void copy(c.text, c.text)} title={t('Kopyala')}>
                {copied === c.text ? '✓' : '⧉'}
              </button>
              <span className="dim small">{formatBytes(c.bytes)}</span>
            </div>
          ))}
        </section>
      )}

      <footer className="ctx-foot dim small">
        {t('Son hareket')} ·{' '}
        {new Date(cluster.lastTouched).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
      </footer>
    </aside>
  );
}
