import {
  buildInventoryGraph,
  type DependencyGraph,
  type GraphEdge,
  type GraphNode,
  type NodeRole,
  type DependencyLevel,
  type WhatIfResult,
} from '../core/dependency-graph.ts';
import type { CliInventoryService } from './cli-inventory-service.ts';

/**
 * Bagimlilik grafigi servisi. Envanteri (gerekirse) tazeler ve
 * dugum/kenar gorunumu ile what-if sonucu uretir. Silme YAPMAZ.
 */

export interface GraphView {
  nodes: Array<GraphNode & { role: NodeRole; level: DependencyLevel }>;
  edges: GraphEdge[];
  cycles: string[][];
  rootCauses: ReturnType<DependencyGraph['rootCauses']>;
  summary: {
    nodes: number;
    edges: number;
    broken: number;
    shadowed: number;
    cycles: number;
    critical: number;
  };
}

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
  async viewCached(): Promise<GraphView | null> {
    const inv = this.inventory.getLast();
    if (!inv) return null;
    const g = await this.graph(false);
    return this.toView(g);
  }

  private toView(g: DependencyGraph): GraphView {
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

  async view(): Promise<GraphView> {
    return this.toView(await this.graph());
  }

  async whatIf(query: string): Promise<{ nodeIds: string[]; result: WhatIfResult }> {
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
