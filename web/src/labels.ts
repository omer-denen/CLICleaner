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

export const CLI_STATUS_LABEL: Record<string, MessageKey> = {
  unused: 'cli.status.unused',
  recent: 'cli.status.recent',
  unknown: 'cli.status.unknown',
  protected: 'cli.status.protected',
};

export const CLI_SOURCE_LABEL: Record<string, MessageKey> = {
  'npm-global': 'cli.source.npm',
  'uv-tool': 'cli.source.uv',
  'dotnet-tool': 'cli.source.dotnet',
  'pip-user': 'cli.source.pip',
  standalone: 'cli.source.standalone',
};

export const ENV_SCOPE_LABEL: Record<string, MessageKey> = {
  user: 'env.scope.user',
  machine: 'env.scope.machine',
  both: 'env.scope.both',
};

export const ENV_FINDING_LABEL: Record<string, MessageKey> = {
  'missing-path': 'env.kind.missing-path',
  'duplicate-path': 'env.kind.duplicate-path',
  'shadowed-command': 'env.kind.shadowed-command',
  'orphan-variable': 'env.kind.orphan-variable',
  'sensitive-variable': 'env.kind.sensitive-variable',
  'empty-variable': 'env.kind.empty-variable',
};

export const GRAPH_NODE_LABEL: Record<string, MessageKey> = {
  tool: 'graph.node.tool',
  package: 'graph.node.package',
  shim: 'graph.node.shim',
  'path-entry': 'graph.node.path-entry',
  'env-var': 'graph.node.env-var',
  project: 'graph.node.project',
  'state-dir': 'graph.node.state-dir',
  shortcut: 'graph.node.shortcut',
  runtime: 'graph.node.runtime',
  process: 'graph.node.process',
  config: 'graph.node.config',
  unknown: 'graph.node.unknown',
};

export const GRAPH_EDGE_LABEL: Record<string, MessageKey> = {
  exec: 'graph.edge.exec',
  package: 'graph.edge.package',
  'project-ref': 'graph.edge.project-ref',
  env: 'graph.edge.env',
  runtime: 'graph.edge.runtime',
  shortcut: 'graph.edge.shortcut',
  link: 'graph.edge.link',
  config: 'graph.edge.config',
};

export const GRAPH_STRENGTH_LABEL: Record<string, MessageKey> = {
  hard: 'graph.strength.hard',
  soft: 'graph.strength.soft',
  weak: 'graph.strength.weak',
};

export const GRAPH_STATE_LABEL: Record<string, MessageKey> = {
  intact: 'graph.state.intact',
  broken: 'graph.state.broken',
  shadowed: 'graph.state.shadowed',
  drifted: 'graph.state.drifted',
  'missing-chain': 'graph.state.missing-chain',
  cyclic: 'graph.state.cyclic',
  unknown: 'graph.state.unknown',
};

export const GRAPH_ROLE_LABEL: Record<string, MessageKey> = {
  isolated: 'graph.role.isolated',
  leaf: 'graph.role.leaf',
  shared: 'graph.role.shared',
  hub: 'graph.role.hub',
};

export const GRAPH_LEVEL_LABEL: Record<string, MessageKey> = {
  low: 'graph.level.low',
  medium: 'graph.level.medium',
  high: 'graph.level.high',
  critical: 'graph.level.critical',
};
