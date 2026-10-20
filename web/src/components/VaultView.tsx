import { useCallback, useEffect, useState } from 'react';
import type { VaultListResponse } from '../../../src/core/contract.ts';
import { ApprovalRules } from '../../../src/core/approval.ts';
import { formatBytes } from '../../../src/util/format.ts';
import { getVault, purgeVault, restoreAllVault, restoreVault } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { shortPath } from '../labels.ts';

interface Props {
  active: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

/** Kasa ekrani: parti listesi, tek tik geri yukleme, kalan gun. */
export function VaultView({ active, onError, onNotice }: Props) {
  const { t } = useI18n();
  const [data, setData] = useState<VaultListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Toplu islemler: geri yukleme ve kalici bosaltma ayri onay ister. */
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmRestoreAll, setConfirmRestoreAll] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgePhrase, setPurgePhrase] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getVault());
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const restore = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const r = await restoreVault(id);
        if (!r.ok) onError(r.error ?? t('Geri yükleme başarısız.'));
        else if (r.conflict) onNotice(t('Orijinal yol doluydu; {path} olarak geri kondu.', { path: r.to }));
        else onNotice(t('Geri yüklendi: {path}', { path: r.to }));
        await load();
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    },
    [load, onError, onNotice, t],
  );

  const restoreAll = useCallback(async () => {
    setBulkBusy(true);
    try {
      const r = await restoreAllVault();
      if (r.failed > 0) onError(t('{n} kayıt geri yüklenemedi.', { n: r.failed }));
      onNotice(
        t('{n} kayıt geri yüklendi ({c} çakışma).', { n: r.restored, c: r.conflict }),
      );
      setConfirmRestoreAll(false);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  }, [load, onError, onNotice, t]);

  const purge = useCallback(async () => {
    if (!ApprovalRules.matches('vaultPurge', purgePhrase)) return;
    setBulkBusy(true);
    try {
      const r = await purgeVault(purgePhrase);
      if (r.failed > 0) onError(t('{n} parti boşaltılamadı.', { n: r.failed }));
      onNotice(
        t('Kasa boşaltıldı: {n} parti, {bytes}.', {
          n: r.batches,
          bytes: formatBytes(r.bytes),
        }),
      );
      setPurgeOpen(false);
      setPurgePhrase('');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  }, [purgePhrase, load, onError, onNotice, t]);

  return (
    <section className="vault">
      <header className="vault-head">
        <div>
          <h1>{t('Kasa')}</h1>
          <p className="dim small">
            {t('Silinen öğeler burada tutulur; istediğini geri yükleyebilirsin.')}
          </p>
        </div>
        <div className="vault-actions">
          <div className="vault-summary">
            <strong>{formatBytes(data?.totalBytes ?? 0)}</strong>
            <span className="dim small">
              {' '}
              · {t('{n} kayıt', { n: data?.entries.length ?? 0 })}
            </span>
          </div>
          <button className="btn small" onClick={() => void load()} disabled={loading}>
            {loading ? t('Yükleniyor...') : t('Yenile')}
          </button>
          {data && data.entries.length > 0 && (
            <>
              <button
                className="btn small"
                disabled={bulkBusy}
                onClick={() => setConfirmRestoreAll(true)}
              >
                {t('Kasadakileri geri al')}
              </button>
              <button
                className="btn small btn-danger"
                disabled={bulkBusy}
                onClick={() => setPurgeOpen(true)}
              >
                {t('Kasayı boşalt')}
              </button>
            </>
          )}
        </div>
      </header>

      {data && data.entries.length > 0 && (
        <div className="dim small vault-retention">
          {t('Önerilen saklama: {n} gün (otomatik silinmez).', { n: data.retentionDays })}
        </div>
      )}

      {loading && !data && <div className="empty">{t('Yükleniyor...')}</div>}

      {data && data.entries.length === 0 && (
        <div className="empty">
          <h3>{t('Kasa boş')}</h3>
          <p className="dim">{t('Silinen öğeler burada görünür.')}</p>
        </div>
      )}

      {data && data.entries.length > 0 && (
        <div className="vault-list">
          {data.entries.map((e) => (
            <div className="vault-row" key={e.id}>
              <div className="vault-row-main">
                <code title={e.originalPath}>{shortPath(e.originalPath)}</code>
                <span className="dim small">
                  {formatBytes(e.bytes)} · {t('{n} dosya', { n: e.files })}
                </span>
                <span className={`tag ${e.remainingDays <= 0 ? 'tag-warn' : ''}`}>
                  {t('Kalan {n} gün', { n: e.remainingDays })}
                </span>
                {e.originalExists && (
                  <span className="tag tag-warn">{t('Orijinal yol dolu')}</span>
                )}
              </div>
              <div className="vault-row-actions">
                <span className="dim small">
                  {new Date(e.at).toLocaleString()}
                </span>
                <button
                  className="btn small btn-primary"
                  disabled={busyId === e.id}
                  onClick={() => void restore(e.id)}
                >
                  {busyId === e.id ? t('Geri yükleniyor…') : t('Geri yükle')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmRestoreAll && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('Kasadakileri geri al')}
          onClick={() => !bulkBusy && setConfirmRestoreAll(false)}
        >
          <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>{t('Kasadakileri geri al')}</h2>
              <button
                className="icon-btn"
                onClick={() => setConfirmRestoreAll(false)}
                disabled={bulkBusy}
                aria-label={t('Kapat')}
              >
                ×
              </button>
            </header>
            <p>
              {t(
                '{n} kayıt ({bytes}) orijinal yollarına geri yüklenecek. Yol doluysa {suffix} olarak geri konur.',
                {
                  n: data?.entries.length ?? 0,
                  bytes: formatBytes(data?.totalBytes ?? 0),
                  suffix: '.restored-<zaman>',
                },
              )}
            </p>
            <footer className="modal-actions">
              <button
                className="btn"
                onClick={() => setConfirmRestoreAll(false)}
                disabled={bulkBusy}
              >
                {t('Vazgeç')}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void restoreAll()}
                disabled={bulkBusy}
              >
                {bulkBusy ? t('Geri yükleniyor…') : t('Geri yükle')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {purgeOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('Kasayı boşalt')}
          onClick={() => !bulkBusy && setPurgeOpen(false)}
        >
          <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>{t('Kasayı boşalt')}</h2>
              <button
                className="icon-btn"
                onClick={() => setPurgeOpen(false)}
                disabled={bulkBusy}
                aria-label={t('Kapat')}
              >
                ×
              </button>
            </header>
            <div className="alert alert-danger">
              {t(
                '{n} kayıt ({bytes}) kalıcı olarak silinecek. Bu işlem geri alınamaz.',
                {
                  n: data?.entries.length ?? 0,
                  bytes: formatBytes(data?.totalBytes ?? 0),
                },
              )}
            </div>
            <label className="phrase">
              <span>
                {t('Onaylamak için {phrase} yaz:', {
                  phrase: ApprovalRules.phrase('vaultPurge'),
                })}
              </span>
              <input
                type="text"
                value={purgePhrase}
                onChange={(e) => setPurgePhrase(e.target.value)}
                placeholder={ApprovalRules.phrase('vaultPurge')}
                disabled={bulkBusy}
                autoFocus
              />
            </label>
            <footer className="modal-actions">
              <button
                className="btn"
                onClick={() => setPurgeOpen(false)}
                disabled={bulkBusy}
              >
                {t('Vazgeç')}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => void purge()}
                disabled={bulkBusy || !ApprovalRules.matches('vaultPurge', purgePhrase)}
              >
                {bulkBusy ? t('Boşaltılıyor…') : t('Kalıcı olarak boşalt')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
