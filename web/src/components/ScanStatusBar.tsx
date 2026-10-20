import type { ScanStatusResponse } from '../../../src/core/contract.ts';
import { useI18n } from '../i18n.tsx';
import { ageLabel } from '../labels.ts';

interface Props {
  status: ScanStatusResponse | null;
  hasPrevious: boolean;
  onShowPrevious: () => void;
  onRescan: () => void;
  onOpenSettings: () => void;
}

/**
 * Tarama durumu rozeti + 24 saat bilgi bandi.
 *
 * Tarama ASLA engellenmez: bant yalnizca bilgi verir ve iki aksiyon sunar.
 * Durum sunucudan gelir (`/api/scan/status`); onbellek suresi ayarlardan
 * degistirilebilir.
 */
export function ScanStatusBar({
  status,
  hasPrevious,
  onShowPrevious,
  onRescan,
  onOpenSettings,
}: Props) {
  const { t, lang } = useI18n();
  if (!status) return null;

  const state = status.scanning ? 'scanning' : status.state;
  // `ageMs` bir SURE; `ageLabel` zaman damgasi bekler. Yas yanlis
  // gorunmesin diye simdiki zamandan cikarilir.
  const age = status.ageMs !== null ? ageLabel(Date.now() - status.ageMs, lang) : null;
  const hoursLeft =
    status.nextRecommendedAt !== null
      ? Math.max(0, Math.ceil((status.nextRecommendedAt - Date.now()) / 3_600_000))
      : 0;

  const stateLabel =
    state === 'scanning'
      ? t('Taranıyor')
      : state === 'current'
        ? t('Güncel')
        : state === 'stale'
          ? t('Eski')
          : t('Hiç taranmadı');

  const showBanner = state === 'stale' || state === 'never';
  const message =
    state === 'never'
      ? t('Henüz tarama yapılmadı. İlk taramayı başlatabilirsin.')
      : status.dirty
        ? t('Dosyalar değişti (silme veya ayar). Sonuçlar eski olabilir; yeniden tarama önerilir.')
        : age
          ? hoursLeft > 0
            ? t(
                'Son tarama {age} yapıldı. Sonuçlar güncel olabilir. Yeniden taramak için {hours} saat sonra önerilir.',
                { age, hours: hoursLeft },
              )
            : t('Son tarama {age} yapıldı. Yeniden tarama önerilir.', { age })
          : t('Sonuçlar eski olabilir; yeniden tarama önerilir.');

  return (
    <div className="scan-status-wrap">
      <div className="scan-status-line">
        <span className={`scan-pill scan-${state}`} aria-live="polite">
          {stateLabel}
        </span>
        {age && state !== 'scanning' && (
          <span className="dim small">
            {state === 'current'
              ? t('Son tarama: {age}', { age })
              : t('Son tarama {age} yapıldı', { age })}
          </span>
        )}
        {status.clusters !== null && state === 'current' && (
          <span className="dim small">· {t('{n} küme', { n: status.clusters })}</span>
        )}
        <button type="button" className="btn small ghost scan-settings" onClick={onOpenSettings}>
          {t('Ayarlar')}
        </button>
      </div>

      {showBanner && (
        <div
          className={`alert ${status.dirty ? 'alert-warn' : 'alert-info'} scan-banner`}
          role="status"
        >
          <span>{message}</span>
          <span className="scan-banner-actions">
            {hasPrevious && (
              <button type="button" className="btn small" onClick={onShowPrevious}>
                {t('Önceki sonuçları göster')}
              </button>
            )}
            <button type="button" className="btn small btn-primary" onClick={onRescan}>
              {t(hasPrevious ? 'Yine de yeniden tara' : 'Taramayı başlat')}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
