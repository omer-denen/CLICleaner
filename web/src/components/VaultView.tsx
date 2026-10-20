import { useCallback, useEffect, useState } from 'react';
import type { VaultListResponse } from '../../../src/web/contract.ts';
import { formatBytes } from '../../../src/util/format.ts';
import { getVault, openRecycleBin, restoreVault } from '../api.ts';
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

  const open = useCallback(async () => {
    try {
      await openRecycleBin();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onError]);

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
          <button className="btn small" onClick={() => void open()}>
            {t('Kasayı aç')}
          </button>
          <button className="btn small" onClick={() => void load()} disabled={loading}>
            {loading ? t('Yükleniyor...') : t('Yenile')}
          </button>
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
    </section>
  );
}
