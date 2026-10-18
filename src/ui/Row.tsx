import React from 'react';
import { Box, Text } from 'ink';
import { color, glyph, RISK_COLOR, VERDICT_GLYPH } from './theme.ts';
import { formatBytes, formatAge, truncatePath, visibleWidth, padEnd, padStart } from '../util/format.ts';
import { prettyPath } from '../util/longpath.ts';
import type { Cluster } from '../core/types.ts';

export interface RowProps {
  cluster: Cluster;
  selected: boolean;
  active: boolean;
  expanded: boolean;
  width: number;
  selectable: boolean;
}

/**
 * Tek bir küme satiri.
 *
 * Bilgi hiyerarsisi su sirayla:
 *   1. isaret kutusu      (ne seciliyor)
 *   2. baslik             (ne)
 *   3. silinebilir boyut  (ne kadar kazanc)
 *   4. toplam boyut       (ne kadar yer kapliyor)
 *   5. yas                (ne zaman)
 */
export const Row: React.FC<RowProps> = React.memo(({ cluster, selected, active, expanded, width, selectable }) => {
  const v = cluster.verdict;
  const g = VERDICT_GLYPH[v.kind];
  const mark = selectable
    ? selected
      ? `${color.brightGreen}${glyph.checked}${color.reset}`
      : `${color.gray}${glyph.unchecked}${color.reset}`
    : `${color.gray}${glyph.dot}${color.reset}`;

  const cursor = active ? `${color.brightCyan}${glyph.cursor}${color.reset}` : ' ';
  const rec = formatBytes(cluster.reclaimableBytes);
  const tot = cluster.totalBytes !== cluster.reclaimableBytes ? formatBytes(cluster.totalBytes) : '';

  // Baslik alani sabit genislikte olsun ki boyut sutunu hizali dursun
  const sizeW = 10;
  const totalW = 10;
  const ageW = 14;
  const titleW = Math.max(20, width - 4 - sizeW - totalW - ageW - 6);

  const titleColor = active ? color.brightCyan : v.kind === 'report-only' ? color.gray : color.white;
  const title = truncatePath(v.title, titleW);
  const partial = cluster.reclaimableBytes > 0 && cluster.totalBytes > cluster.reclaimableBytes;

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{cursor} </Text>
        <Text>{mark} </Text>
        <Text color={titleColor} bold={active}>
          {padEnd(title, titleW)}
        </Text>
        <Text color={RISK_COLOR[v.risk]}>
          {partial ? '~' : ' '}
          {padStart(rec, sizeW)}
        </Text>
        <Text color={color.gray}>{padStart(tot, totalW)}</Text>
        <Text color={color.gray}>{padStart(formatAge(cluster.lastTouched), ageW)}</Text>
      </Box>

      {expanded && (
        <Box flexDirection="column" marginLeft={4}>
          <Text color={color.gray}>{'  ' + v.what}</Text>
          <Text color={color.gray}>  Sonuc: {v.consequence}</Text>

          {v.because.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={color.gray}>  Neden bu karar:</Text>
              {v.because.slice(0, 6).map((b, i) => (
                <Text key={i} color={color.gray}>
                  {'   ' + g.g} {truncatePath(b, Math.max(40, width - 12))}
                </Text>
              ))}
            </Box>
          )}

          {v.preconditions.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              {v.preconditions.map((p, i) => (
                <Text key={i} color={color.yellow}>
                  {glyph.warn} {truncatePath(p, Math.max(40, width - 12))}
                </Text>
              ))}
            </Box>
          )}

          {cluster.subparts && cluster.subparts.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={color.gray}>  Silinebilir parcalar:</Text>
              {cluster.subparts.map((s, i) => (
                <Text key={i} color={color.brightCyan}>
                  {'   ' + glyph.arrow} {padEnd(truncatePath(s.label, 34), 36)}
                  {padStart(formatBytes(s.bytes), 10)}
                </Text>
              ))}
            </Box>
          )}

          {cluster.deleteTargets && cluster.deleteTargets.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={color.gray}>  Hedef yollar:</Text>
              {cluster.deleteTargets.map((t, i) => (
                <Text key={i} color={color.gray}>
                  {'   ' + glyph.dot} {truncatePath(prettyPath(t.path), Math.max(40, width - 26))}
                  {t.kind === 'older' ? color.yellow + ` (${t.minAgeDays}+ gun)` + color.reset : ''}
                </Text>
              ))}
            </Box>
          )}

          {cluster.parts.length > 1 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={color.gray}>  Birlestirilen parcalar ({cluster.parts.length}):</Text>
              {cluster.parts.slice(0, 8).map((p, i) => (
                <Text key={i} color={color.gray}>
                  {'   ' + glyph.dot} {padEnd(truncatePath(prettyPath(p.path), Math.max(30, width - 44)), Math.max(30, width - 44))}
                  {padStart(formatBytes(p.bytes), 10)}
                </Text>
              ))}
              {cluster.parts.length > 8 && (
                <Text color={color.gray}>{'   ... +' + (cluster.parts.length - 8) + ' parca'}</Text>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
});

Row.displayName = 'Row';

export { visibleWidth };