import {
  buildInventoryGraph,
  type DependencyGraph,
} from '../core/dependency-graph.ts';
import type { CliInventoryService } from './cli-inventory-service.ts';
import type { GraphViewResponse, GraphWhatIfResponse } from '../core/contract.ts';

/**
 * Bagimlilik grafigi servisi. Envanteri (gerekirse) tazeler ve
 * dugum/kenar gorunumu ile what-if sonucu uretir. Silme YAPMAZ.
 */

export class GraphService {
  private readonly inventory: CliInventoryService;

  constructor(inventory: CliInventoryService) {
    this.inventory = inventory;
  }

  private async graph(force = true): Promise<DependencyGraph> {
    const inv = force
      ? (this.inventory.getLast() ?? (await this.inventory.ensure()))
      : this.inventory.getLast();
    if (!inv) throw new Error('envanter onbellegi yok');
    const g = buildInventoryGraph(inv);
    g.validate();
    return g;
  }

  /** Onbellekte envanter yoksa `null` doner; AGIR tarama tetiklemez. */
  async viewCached(): Promise<GraphViewResponse | null> {
    const inv = this.inventory.getLast();
    if (!inv) return null;
    const g = await this.graph(false);
    return this.toView(g);
  }

  private toView(g: DependencyGraph): GraphViewResponse {
    const roles = g.roles();
    const levels = g.levels();
    const cycles = g.cycles();
    return {
      nodes: g.nodes().map((n) => ({
        ...n,
        role: roles.get(n.id) ?? 'isolated',
        level: levels.get(n.id) ?? 'low',
      })),
      edges: g.edges(),
      cycles,
      rootCauses: g.rootCauses(),
      summary: {
        nodes: g.nodes().length,
        edges: g.edges().length,
        broken: g.edges().filter((e) => e.state === 'broken' || e.state === 'missing-chain').length,
        shadowed: g.edges().filter((e) => e.state === 'shadowed').length,
        cycles: cycles.length,
        critical: [...levels.values()].filter((l) => l === 'critical').length,
      },
    };
  }

  async view(): Promise<GraphViewResponse> {
    return this.toView(await this.graph());
  }

  async whatIf(query: string): Promise<GraphWhatIfResponse> {
    const g = await this.graph();
    const q = query.toLowerCase();
    const nodeIds = g
      .nodes()
      .filter(
        (n) =>
          n.id.toLowerCase().includes(q) ||
          n.label.toLowerCase() === q ||
          n.label.toLowerCase().includes(q) ||
          n.path?.toLowerCase().includes(q),
      )
      .map((n) => n.id);
    return { nodeIds, result: g.whatIf(nodeIds) };
  }
}
