import { translate, type Lang, type MessageKey } from '../i18n.ts';
import { formatAge, formatTimestamp } from '../format.ts';

/**
 * TARAMA DAMGASI — listelerin hangi taramadan geldigini bildirir.
 *
 * Disk kumeleri, defterler ve "guvenli kazanimlar" listesi **onceki
 * taramadan** gelir. Kullanici listeden bakip "bu simdi mi, yoksa saatler
 * onceki taramadan mi?" diye soramamamalidir.
 *
 * Burada HICBIR hesap yok: zaman damgasini motor verir (`scan.at` /
 * `lastScanAt`), burada yalnizca bicimlendirilir.
 */
export function ScanStamp({
  at,
  ageMs,
  lang,
  className,
}: {
  at: number | null;
  ageMs: number | null;
  lang: Lang;
  className?: string;
}) {
  const t = (key: MessageKey) => translate(lang, key);

  if (at === null) {
    return (
      <span className={`scan-stamp dim${className ? ` ${className}` : ''}`}>
        {t('scan.stamp.none')}
      </span>
    );
  }

  return (
    <span className={`scan-stamp dim${className ? ` ${className}` : ''}`}>
      {t('scan.stamp')} · <span className="mono">{formatTimestamp(at, lang)}</span>
      {ageMs !== null && <> · {formatAge(ageMs, lang)}</>}
    </span>
  );
}
