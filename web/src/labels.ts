import type { MessageKey } from './i18n.ts';

/** Ortak etiket haritalari: kimlik -> ceviri anahtari. Karar yok. */

export const CATEGORY_LABEL: Record<string, MessageKey> = {
  protected: 'category.protected',
  duplicate: 'category.duplicate',
  'old-version': 'category.old-version',
  orphan: 'category.orphan',
  unused: 'category.unused',
  'ai-debris': 'category.ai-debris',
  'ghost-envs': 'category.ghost-envs',
  unknown: 'category.unknown',
};

export const VERDICT_LABEL: Record<string, MessageKey> = {
  recommend: 'verdict.recommend',
  ask: 'verdict.ask',
  'report-only': 'verdict.report-only',
  keep: 'verdict.keep',
};

export const RISK_LABEL: Record<string, MessageKey> = {
  safe: 'risk.safe',
  low: 'risk.low',
  medium: 'risk.medium',
  high: 'risk.high',
};

export const REGEN_LABEL: Record<string, MessageKey> = {
  regenerable: 'reason.regenerable',
  'user-data': 'reason.user-data',
  unknown: 'reason.unknown',
};

export const CONFIDENCE_LABEL: Record<string, MessageKey> = {
  high: 'confidence.high',
  medium: 'confidence.medium',
  low: 'confidence.low',
};
