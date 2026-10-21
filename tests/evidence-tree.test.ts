import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClusterEvidence, evidenceSummary } from '../src/core/evidence-tree.ts';
import { cluster, verdict } from './helpers.ts';

test('kanit agaci aday/iddia/kanit/gozlem uretir', () => {
  const c = cluster({
    evidence: { markers: ['cache', 'chat-history'], fileKinds: ['log'] },
    verdict: verdict({ regenerability: 'user-data' }),
  });
  const tree = buildClusterEvidence(c);
  assert.equal(tree.candidates.length, 1);
  const cand = tree.candidates[0]!;
  assert.ok(cand.claims.length >= 3);
  assert.ok(cand.claims.some((x) => x.stance === 'protects'));
  const obs = cand.claims.flatMap((x) => x.evidence.flatMap((e) => e.obsIds));
  assert.ok(obs.length > 0);
  // Ayni gozlem iki kez uretilse bile tek obsId.
  assert.equal(new Set(obs).size, obs.length);
});

test('protects agir basarsa ozet protects doner', () => {
  const c = cluster({
    evidence: { markers: ['chat-history', 'rules-files'] },
    verdict: verdict({ kind: 'keep', regenerability: 'user-data', confidence: 'low' }),
  });
  const summary = evidenceSummary(buildClusterEvidence(c));
  assert.equal(summary.stance, 'protects');
  assert.ok(summary.protects > summary.supports);
});
