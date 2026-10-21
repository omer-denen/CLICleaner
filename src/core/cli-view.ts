import type {
  CliSourceFilter,
  CliSourceStat,
  CliSort,
  CliStatusFilter,
  CliViewCounts,
  CliViewFilter,
  CliViewResponse,
  CliViewSummary,
} from './contract.ts';
import type { CliInventory, CliSource, CliTool } from './cli-inventory-types.ts';
import { CliInventoryQuery } from './cli-inventory-query.ts';

/**
 * ARAC LISTESI — karar motorunun saf katmani.
 *
 * Envanterin filtresi, siralamasi, kaynak sayimlari ve secilebilir
 * kimlikleri burada uretilir. Arayuz yalnizca sonucu gosterir.
 * Bu dosyada node builtin importu YOKTUR.
 */

const STATUSES: readonly CliStatusFilter[] = [
  'all',
  'unused',
  'recent',
  'unknown',
  'protected',
];
const SOURCES: readonly CliSourceFilter[] = [
  'all',
  'npm-global',
  'uv-tool',
  'dotnet-tool',
  'pip-user',
  'standalone',
];
const SORTS: readonly CliSort[] = ['status', 'size', 'idle', 'name'];

function asStatus(value: string | undefined): CliStatusFilter {
  return STATUSES.includes(value as CliStatusFilter)
    ? (value as CliStatusFilter)
    : 'all';
}

function asSource(value: string | undefined): CliSourceFilter {
  return SOURCES.includes(value as CliSourceFilter)
    ? (value as CliSourceFilter)
    : 'all';
}

function asSort(value: string | undefined): CliSort {
  return SORTS.includes(value as CliSort) ? (value as CliSort) : 'status';
}

function haystack(tool: CliTool): string {
  return [
    tool.command,
    tool.packageName,
    tool.source,
    tool.version,
    tool.installPath,
    tool.status,
    tool.shims.join(' '),
    tool.stateDirs.join(' '),
    tool.evidence.join(' '),
  ]
    .join('\n')
    .toLowerCase();
}

function compareTools(a: CliTool, b: CliTool, sort: CliSort): number {
  switch (sort) {
    case 'size':
      return b.totalBytes - a.totalBytes || a.command.localeCompare(b.command, 'tr');
    case 'idle':
      return (b.idleDays ?? -1) - (a.idleDays ?? -1) || b.totalBytes - a.totalBytes;
    case 'name':
      return a.command.localeCompare(b.command, 'tr');
    case 'status':
      return (
        CliInventoryQuery.statusOrder(a.status) - CliInventoryQuery.statusOrder(b.status) ||
        b.totalBytes - a.totalBytes ||
        a.command.localeCompare(b.command, 'tr')
      );
  }
}

export interface CliViewInput {
  text?: string;
  status?: string;
  source?: string;
  sort?: string;
}

export class CliView {
  private readonly inventory: CliInventory;

  constructor(inventory: CliInventory) {
    this.inventory = inventory;
  }

  private static sources(tools: readonly CliTool[]): CliSourceStat[] {
    const order: CliSource[] = [
      'npm-global',
      'uv-tool',
      'dotnet-tool',
      'pip-user',
      'standalone',
    ];
    const stats = new Map<CliSource, CliSourceStat>();
    for (const source of order) stats.set(source, { source, count: 0, bytes: 0 });
    for (const tool of tools) {
      const stat = stats.get(tool.source);
      if (!stat) continue;
      stat.count++;
      stat.bytes += tool.totalBytes;
    }
    return [...stats.values()].filter((s) => s.count > 0);
  }

  private static counts(inventory: CliInventory): CliViewCounts {
    const q = new CliInventoryQuery(inventory.tools, inventory.duplicates);
    return q.counts();
  }

  private static summary(
    inventory: CliInventory,
    visible: number,
  ): CliViewSummary {
    const q = new CliInventoryQuery(inventory.tools, inventory.duplicates);
    const base = q.counts();
    let recent = 0;
    let totalBytes = 0;
    for (const tool of inventory.tools) {
      if (tool.status === 'recent') recent++;
      totalBytes += tool.totalBytes;
    }
    return {
      total: base.total,
      visible,
      unused: base.unused,
      recent,
      unknown: base.unknown,
      protected: base.protected,
      broken: base.broken,
      withStateDirs: base.withStateDirs,
      removable: q.removableIds().length,
      unusedBytes: q.unusedBytes(),
      totalBytes,
    };
  }

  view(input: CliViewInput = {}): CliViewResponse {
    const status = asStatus(input.status);
    const source = asSource(input.source);
    const sort = asSort(input.sort);
    const text = (input.text ?? '').trim();
    const needle = text.toLowerCase();

    const base = new CliInventoryQuery(this.inventory.tools, this.inventory.duplicates);
    const byStatus = base.filter(status);
    const bySource =
      source === 'all' ? byStatus : byStatus.filter((tool) => tool.source === source);
    const byText =
      needle.length === 0
        ? bySource
        : bySource.filter((tool) => haystack(tool).includes(needle));
    const tools = [...byText].sort((a, b) => compareTools(a, b, sort));

    const filter: CliViewFilter = { text, status, source, sort };
    return {
      scannedAt: this.inventory.scannedAt,
      unusedDays: this.inventory.unusedDays,
      tools,
      duplicates: this.inventory.duplicates,
      shimIssues: this.inventory.shimIssues,
      pathShadows: this.inventory.pathShadows,
      ...(this.inventory.pathChannels
        ? { pathChannels: this.inventory.pathChannels }
        : {}),
      ...(this.inventory.nodeRuntimes
        ? { nodeRuntimes: this.inventory.nodeRuntimes }
        : {}),
      notes: this.inventory.notes,
      roots: this.inventory.roots,
      counts: CliView.counts(this.inventory),
      sources: CliView.sources(this.inventory.tools),
      summary: CliView.summary(this.inventory, tools.length),
      selectableIds: tools
        .filter((tool) => CliInventoryQuery.isRemovable(tool))
        .map((tool) => tool.id),
      filter,
    };
  }
}
