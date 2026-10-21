import { createHash } from 'node:crypto';
import type { Cluster } from './types.ts';

/**
 * Kanit agaci.
 *
 * Seviyeler: Arac -> Aday -> Iddia -> Kanit -> Gozlem.
 * Kural: her gozlem TEKILDIR (source+key+value) ve `obsId` ile referans
 * verilir. Boylece "hangi gozlem bu karari destekledi/korudu" sorusu
 * serbest metin yorumundan degil, yapidan yanitlanir.
 *
 * Durus (stance):
 *  - supports: silmeyi/onermeyi destekler,
 *  - protects: korur (silme engeli),
 *  - unknown:  veri yok/erisilemedi; "yok" sayilmaz.
 */

export type EvidenceStance = 'supports' | 'protects' | 'unknown';

export type ObservationSource =
  | 'filesystem'
  | 'manifest'
  | 'path'
  | 'process'
  | 'registry'
  | 'git'
  | 'history'
  | 'archetype'
  | 'policy'
  | 'unknown';

export interface Observation {
  obsId: string;
  source: ObservationSource;
  key: string;
  value: string;
  at?: number;
}

export interface EvidenceNode {
  id: string;
  stance: EvidenceStance;
  source: ObservationSource;
  /** Insan okuyabilir bulgu cumlesi. */
  finding: string;
  /** 0..1; tek zayif kanit karar vermemeli. */
  weight: number;
  reason: string;
  obsIds: string[];
}

export interface Claim {
  id: string;
  text: string;
  stance: EvidenceStance;
  weight: number;
  evidence: EvidenceNode[];
}

export interface CandidateEvidenceNode {
  id: string;
  label: string;
  path?: string;
  decision: string;
  /** supports toplami - protects toplami (bilgi amacli, karar degil). */
  score: number;
  claims: Claim[];
}

export interface ToolEvidenceNode {
  id: string;
  label: string;
  candidates: CandidateEvidenceNode[];
}

function h(prefix: string, text: string, length = 12): string {
  return `${prefix}-${createHash('sha1').update(text).digest('hex').slice(0, length)}`;
}

class TreeBuilder {
  readonly observations = new Map<string, Observation>();
  readonly candidates = new Map<string, CandidateEvidenceNode>();
  private candidateId = '';

  candidate(id: string, label: string, path?: string, decision = 'unknown'): void {
    this.candidateId = id;
    if (!this.candidates.has(id)) {
      this.candidates.set(id, {
        id,
        label,
        path,
        decision,
        score: 0,
        claims: [],
      });
    }
  }

  observation(source: ObservationSource, key: string, value: string, at?: number): string {
    const obsId = h('obs', `${source}|${key}|${value}|${at ?? ''}`);
    if (!this.observations.has(obsId)) {
      this.observations.set(obsId, { obsId, source, key, value, at });
    }
    return obsId;
  }

  claim(
    text: string,
    stance: EvidenceStance,
    weight: number,
    evidence: Array<{
      source: ObservationSource;
      finding: string;
      reason: string;
      weight?: number;
      observations: Array<{ key: string; value: string; at?: number }>;
    }>,
  ): void {
    const c = this.candidates.get(this.candidateId);
    if (!c) return;
    const claimId = h('claim', `${this.candidateId}|${text}`);
    const nodes: EvidenceNode[] = evidence.map((e) => {
      const obsIds = e.observations.map((o) => this.observation(e.source, o.key, o.value, o.at));
      return {
        id: h('ev', `${claimId}|${e.source}|${e.finding}|${obsIds.join(',')}`),
        stance,
        source: e.source,
        finding: e.finding,
        weight: e.weight ?? weight,
        reason: e.reason,
        obsIds,
      };
    });
    c.claims.push({ id: claimId, text, stance, weight, evidence: nodes });
    c.score += stance === 'supports' ? weight : stance === 'protects' ? -weight : 0;
  }

  build(toolId: string, toolLabel: string, decision: string): ToolEvidenceNode {
    const cands = [...this.candidates.values()];
    for (const c of cands) c.decision = decision;
    return { id: toolId, label: toolLabel, candidates: cands };
  }
}

/**
 * Bir disk kümesinden kanit agaci uretir. Karar DEGISTIRMEZ; yalnizca
 * mevcut `verdict`i kanit seviyesinde aciklar.
 */
export function buildClusterEvidence(cluster: Cluster): ToolEvidenceNode {
  const b = new TreeBuilder();
  const cId = `candidate:${cluster.key}`;
  b.candidate(cId, cluster.title, cluster.parts[0]?.path, cluster.verdict.kind);

  const ev = cluster.evidence;
  b.claim('Mimari tip icerikten tanindi', 'supports', 0.55, [
    {
      source: 'archetype',
      finding: `Archetype: ${cluster.archetype}`,
      reason: 'Klasor adi degil, icerik yapisi (marker/uzanti/alt klasor) temel alindi.',
      observations: [{ key: 'archetype', value: cluster.archetype }],
    },
  ]);

  if ((ev.markers ?? []).length > 0) {
    b.claim('Yapisal isaretler bulundu', 'supports', 0.25, [
      {
        source: 'filesystem',
        finding: `Markers: ${(ev.markers ?? []).slice(0, 8).join(', ')}`,
        reason: 'Bu isaretler klasorun turunu adindan bagimsiz dogrular.',
        observations: [{ key: 'markers', value: (ev.markers ?? []).slice(0, 8).join(',') }],
      },
    ]);
  }

  if ((ev.fileKinds ?? []).length > 0) {
    b.claim('Dosya turleri icerikle uyumlu', 'supports', 0.2, [
      {
        source: 'filesystem',
        finding: `File kinds: ${(ev.fileKinds ?? []).slice(0, 8).join(', ')}`,
        reason: 'Uzanti dagilimi beklenen icerikle ortusuyor.',
        observations: [{ key: 'fileKinds', value: (ev.fileKinds ?? []).slice(0, 8).join(',') }],
      },
    ]);
  }

  if (cluster.deleteTargets && cluster.deleteTargets.length > 0) {
    b.claim('Silinecek somut yol(lar) var', 'supports', 0.15, [
      {
        source: 'filesystem',
        finding: `${cluster.deleteTargets.length} hedef, ${cluster.reclaimableBytes} bayt geri kazanilabilir`,
        reason: 'Karar yalnizca hedefi olan kumelerde "onerilen" olabilir.',
        observations: [
          {
            key: 'deleteTargets',
            value: `${cluster.deleteTargets.length}:${cluster.reclaimableBytes}`,
          },
        ],
      },
    ]);
  }

  if (ev.lastTouched) {
    b.claim('Son kullanim izi', 'unknown', 0.2, [
      {
        source: 'filesystem',
        finding: `Son degisiklik: ${new Date(ev.lastTouched).toISOString()}`,
        reason: 'Tek basina mtime "kullanilmiyor" kaniti degildir; yalnizca baglam verir.',
        observations: [
          { key: 'lastTouched', value: String(ev.lastTouched), at: ev.lastTouched },
        ],
      },
    ]);
  }

  const sensitive = new Set((ev.markers ?? []).map((m) => m.toLowerCase()));
  for (const marker of ['chat-history', 'rules-files', 'vector-index', 'model-store']) {
    if (!sensitive.has(marker)) continue;
    b.claim('Kullanici verisi / hassas icerik', 'protects', 0.8, [
      {
        source: 'policy',
        finding: `Hassas isaret: ${marker}`,
        reason: 'Bu icerik kullaniciya aittir; varsayilan planda yer almaz.',
        observations: [{ key: 'sensitiveMarker', value: marker }],
      },
    ]);
  }

  if (cluster.verdict.regenerability === 'user-data') {
    b.claim('Yeniden uretilemez kullanici verisi', 'protects', 0.9, [
      {
        source: 'policy',
        finding: 'regenerability=user-data',
        reason: 'Silinirse geri gelmez; yalnizca acik kullanici karari ile ele alinir.',
        observations: [{ key: 'regenerability', value: 'user-data' }],
      },
    ]);
  }

  if (cluster.verdict.confidence === 'low') {
    b.claim('Kanit guveni dusuk', 'unknown', 0.4, [
      {
        source: 'policy',
        finding: 'confidence=low',
        reason: 'Karar tek zayif sinyale dayanmasin; elle dogrulama gerekir.',
        observations: [{ key: 'confidence', value: 'low' }],
      },
    ]);
  }

  return b.build(`tool:${cluster.key}`, cluster.title, cluster.verdict.kind);
}

/**
 * Karar metninde kullanilacak kisa gerekce: protects agir basarsa
 * "korunuyor", supports agir basarsa "destekli", aksi halde "belirsiz".
 */
export function evidenceSummary(tree: ToolEvidenceNode): {
  supports: number;
  protects: number;
  unknown: number;
  stance: EvidenceStance;
} {
  let supports = 0;
  let protects = 0;
  let unknown = 0;
  for (const c of tree.candidates) {
    for (const claim of c.claims) {
      if (claim.stance === 'supports') supports += claim.weight;
      else if (claim.stance === 'protects') protects += claim.weight;
      else unknown += claim.weight;
    }
  }
  const stance: EvidenceStance =
    protects > supports ? 'protects' : supports > protects ? 'supports' : 'unknown';
  return { supports, protects, unknown, stance };
}
