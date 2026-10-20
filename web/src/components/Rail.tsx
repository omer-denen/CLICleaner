import { formatBytes } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';
import { CATEGORY_ORDER, type CategoryKey, type CategoryStat } from '../util/categories.ts';

/**
 * Sol sutun — kontrol merkezi (T42 / D3, P0).
 *
 * Amac: "simdi ne durumdayim?" sorusunu tek bakista yanitlamak.
 *   - Saglik: taranan bayt, geri kazanilir pay, ajan kirliligi.
 *   - Kategoriler: kanittan turetilen filtreler (AI Debris / Orphaned CLI /
 *     Ghost Envs / Diger) + "Tumu".
 *   - Plan durumu: secim, plan rozeti ve iki PLAN butonu.
 *
 * Burada HICBIR sey silinmez. Butonlar yalnizca PLAN uretir; uygulama
 * ayrica yazili onay ister (iki asamali onay korunur).
 */

export type PlanState = 'idle' | 'planning' | 'confirm' | 'deleting';

interface RailProps {
  stats: Record<CategoryKey, CategoryStat>;
  active: CategoryKey | 'all';
  onSelect: (key: CategoryKey | 'all') => void;
  totalBytes: number;
  reclaimableBytes: number;
  aiRatio: number;
  selectedCount: number;
  selectedBytes: number;
  planState: PlanState;
  onPlan: () => void;
  onPlanAll: () => void;
  hasScan: boolean;
  scopeCount: number;
}

const CATEGORY_LABEL: Record<CategoryKey, string> = {
  'ai-debris': 'AI Debris',
  'orphaned-cli': 'Orphaned CLI',
  'ghost-envs': 'Ghost Envs',
  other: 'Diğer',
};

function Meter({
  label,
  value,
  frac,
  tone,
}: {
  label: string;
  value: string;
  frac: number;
  tone: 'accent' | 'green' | 'purple';
}) {
  const pct = Math.max(0, Math.min(1, frac));
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="dim">{label}</span>
        <span className="mono">{value}</span>
      </div>
      <div className="meter-bar" role="presentation">
        <i className={`tone-${tone}`} style={{ width: `${(pct * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}

export function Rail({
  stats,
  active,
  onSelect,
  totalBytes,
  reclaimableBytes,
  aiRatio,
  selectedCount,
  selectedBytes,
  planState,
  onPlan,
  onPlanAll,
  hasScan,
  scopeCount,
}: RailProps) {
  const { t } = useI18n();

  const planBadge =
    planState === 'deleting'
      ? t('Uygulanıyor')
      : planState === 'confirm'
        ? t('Onay bekliyor')
        : planState === 'planning'
          ? t('Plan hazırlanıyor')
          : selectedCount > 0
            ? t('{n} seçili', { n: selectedCount })
            : t('0 seçili');

  const reclaimFrac = totalBytes > 0 ? reclaimableBytes / totalBytes : 0;

  return (
    <aside className="rail" aria-label={t('Kontrol merkezi')}>
      <div className="rail-head">
        <span className="logo">CLICleaner</span>
        <span className="dim small">{t('kanıt görünür, silme onaylı')}</span>
      </div>

      <section className="rail-block rail-health">
        <h3 className="rail-title">{t('Sağlık')}</h3>
        <Meter
          label={t('Taranan')}
          value={hasScan ? formatBytes(totalBytes) : '--'}
          frac={hasScan ? 1 : 0}
          tone="accent"
        />
        <Meter
          label={t('Geri kazanılır')}
          value={hasScan ? formatBytes(reclaimableBytes) : '--'}
          frac={reclaimFrac}
          tone="green"
        />
        <Meter
          label={t('Ajan kirliliği')}
          value={hasScan ? `%${Math.round(aiRatio * 100)}` : '--'}
          frac={aiRatio}
          tone="purple"
        />
      </section>

      <section className="rail-block rail-cats">
        <h3 className="rail-title">{t('Kategoriler')}</h3>
        <button
          className={`rail-cat${active === 'all' ? ' active' : ''}`}
          onClick={() => onSelect('all')}
          aria-pressed={active === 'all'}
        >
          <span className="rail-cat-name">{t('Tümü')}</span>
          <span className="rail-cat-meta mono">
            {hasScan ? `${stats['ai-debris'].count + stats['orphaned-cli'].count + stats['ghost-envs'].count + stats.other.count} · ${formatBytes(totalBytes)}` : '--'}
          </span>
        </button>
        {CATEGORY_ORDER.map((key) => {
          const s = stats[key];
          return (
            <button
              key={key}
              className={`rail-cat cat-${key}${active === key ? ' active' : ''}`}
              onClick={() => onSelect(key)}
              aria-pressed={active === key}
            >
              <span className="rail-cat-name">{t(CATEGORY_LABEL[key])}</span>
              <span className="rail-cat-meta mono">
                {hasScan ? `${s.count} · ${formatBytes(s.bytes)}` : '--'}
              </span>
            </button>
          );
        })}
      </section>

      <section className="rail-block rail-plan">
        <h3 className="rail-title">{t('Plan')}</h3>
        <div className={`plan-badge state-${planState}`}>{planBadge}</div>
        <div className="dim small">
          {selectedCount > 0
            ? t('{bytes} seçili · {clusters} küme', {
                bytes: formatBytes(selectedBytes),
                clusters: selectedCount,
              })
            : t('Hiçbir şey seçili değil.')}
        </div>
        <button
          className="btn"
          onClick={onPlan}
          disabled={selectedCount === 0 || planState === 'planning' || planState === 'deleting'}
          title={t('Seçili bulgular için gerekçeli plan üret; hiçbir şey taşınmaz')}
        >
          {t('Plan oluştur')}
        </button>
        <button
          className="btn btn-primary"
          onClick={onPlanAll}
          disabled={!hasScan || scopeCount === 0 || planState === 'planning' || planState === 'deleting'}
          title={t('Kapsamdaki tüm bulgular için plan üret; doğrudan silme yok')}
        >
          {t('Tümünü planla')}
        </button>
        <p className="rail-note">
          {t('Plan bir adımdır, silme değil. Uygulama için ayrıca yazılı onay gerekir.')}
        </p>
      </section>
    </aside>
  );
}
