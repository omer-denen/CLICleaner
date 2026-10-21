import type { Cluster, Risk, Verdict } from '../src/core/types.ts';

export function verdict(over: Partial<Verdict> = {}): Verdict {
  return {
    risk: 'safe',
    kind: 'recommend',
    title: 'test',
    what: 'test',
    consequence: 'test',
    because: [],
    preconditions: [],
    regenerability: 'regenerable',
    confidence: 'high',
    ...over,
  };
}

export function cluster(over: Partial<Cluster> = {}): Cluster {
  const key = over.key ?? 'test-key';
  return {
    key,
    title: over.title ?? 'Test Cluster',
    archetype: over.archetype ?? 'pkg-manager-cache',
    parts: over.parts ?? [
      {
        path: 'C:\\Cache\\test',
        bytes: 1000,
        files: 10,
        lastTouched: Date.now() - 10 * 86_400_000,
        reclaimableBytes: 1000,
        origin: 'custom',
      },
    ],
    totalBytes: over.totalBytes ?? 1000,
    reclaimableBytes: over.reclaimableBytes ?? 1000,
    lastTouched: over.lastTouched ?? Date.now() - 10 * 86_400_000,
    evidence: over.evidence ?? { markers: ['cache'] },
    verdict: over.verdict ?? verdict(),
    ...(over.deleteTargets !== undefined ? { deleteTargets: over.deleteTargets } : {
      deleteTargets: [
        {
          path: 'C:\\Cache\\test',
          kind: 'whole',
          label: 'test',
          bytes: 1000,
        },
      ],
    }),
    ...(over.subparts !== undefined ? { subparts: over.subparts } : {}),
  };
}

export function risk(r: Risk): Risk {
  return r;
}
