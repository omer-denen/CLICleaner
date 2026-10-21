import { buildInventoryGraph, type DependencyGraph } from '../core/dependency-graph.ts';
import { scanCliInventory } from '../core/cli-inventory.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

/**
 * `residue graph` — CLI envanterinden bagimlilik grafi.
 *
 * SALT OKUNUR. `--what-if <ad>` secilen aracin kaldirilmasini simule
 * eder: hangi sert/aktif bagimliliklar kopar, hangi oge engellenir.
 */
export async function runGraph(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const whatIfIdx = args.indexOf('--what-if');
  const whatIf = whatIfIdx >= 0 ? args[whatIfIdx + 1] : undefined;

  const inv = await scanCliInventory();
  const graph = buildInventoryGraph(inv);
  graph.validate();

  const roles = graph.roles();
  const levels = graph.levels();
  const cycles = graph.cycles();
  const causes = graph.rootCauses();

  if (json) {
    const out: Record<string, unknown> = {
      nodes: graph.nodes().map((n) => ({ ...n, role: roles.get(n.id), level: levels.get(n.id) })),
      edges: graph.edges(),
      cycles,
      rootCauses: causes,
      summary: {
        nodes: graph.nodes().length,
        edges: graph.edges().length,
        broken: graph.edges().filter((e) => e.state === 'broken' || e.state === 'missing-chain').length,
        cycles: cycles.length,
      },
    };
    if (whatIf) {
      const ids = matchNodes(graph, whatIf);
      out.whatIf = { target: whatIf, nodeIds: ids, result: graph.whatIf(ids) };
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(`\n  ${C.bold}Residue — bagimlilik grafi${C.reset}\n`);
  console.log(`  Dugum : ${graph.nodes().length}`);
  console.log(`  Kenar : ${graph.edges().length}`);
  console.log(
    `  Kopuk : ${graph.edges().filter((e) => e.state === 'broken' || e.state === 'missing-chain').length}`,
  );
  console.log(`  Dongu : ${cycles.length}`);
  console.log('');

  const byLevel = new Map<string, number>();
  for (const l of levels.values()) byLevel.set(l, (byLevel.get(l) ?? 0) + 1);
  for (const l of ['critical', 'high', 'medium', 'low']) {
    if ((byLevel.get(l) ?? 0) > 0) console.log(`  ${C.gray}${l}: ${byLevel.get(l)}${C.reset}`);
  }
  console.log('');

  for (const b of graph
    .edges()
    .filter((e) => e.state === 'broken' || e.state === 'missing-chain')
    .slice(0, 20)) {
    console.log(`  ${C.red}kopuk${C.reset} ${b.from} -> ${b.to} (${b.kind})`);
  }
  for (const c of causes.slice(0, 10)) {
    console.log(`  ${C.yellow}kok neden${C.reset} ${c.label}: ${c.count} kenar`);
  }
  for (const cyc of cycles.slice(0, 5)) {
    console.log(`  ${C.yellow}dongu${C.reset} ${cyc.join(' -> ')}`);
  }

  if (whatIf) {
    const ids = matchNodes(graph, whatIf);
    console.log(`\n  ${C.bold}What-if: ${whatIf}${C.reset}`);
    if (ids.length === 0) {
      console.log(`  ${C.gray}Eslesen dugum yok.${C.reset}\n`);
      return;
    }
    const r = graph.whatIf(ids);
    console.log(`  Secilen: ${ids.length}`);
    console.log(`  Izinli : ${r.allowed.length}`);
    console.log(`  Engelli: ${r.blocked.length}`);
    for (const b of r.blocked) {
      console.log(`  ${C.red}ENGELLI${C.reset} ${b.label}: ${b.reason}`);
      for (const d of b.dependents.slice(0, 5)) {
        console.log(`      ${C.gray}<- ${d.label} (${d.edge.kind}/${d.edge.strength})${C.reset}`);
      }
    }
    for (const e of r.brokenEdges.slice(0, 15)) {
      console.log(`  ${C.yellow}kopacak${C.reset} ${e.from} -> ${e.to} (${e.kind})`);
    }
    console.log('');
  } else {
    console.log(`\n  ${C.gray}Simulasyon: residue graph --what-if <komut|paket>${C.reset}\n`);
  }
}

function matchNodes(graph: DependencyGraph, query: string): string[] {
  const q = query.toLowerCase();
  return graph
    .nodes()
    .filter(
      (n) =>
        n.id.toLowerCase().includes(q) ||
        n.label.toLowerCase() === q ||
        n.label.toLowerCase().includes(q) ||
        n.path?.toLowerCase().includes(q),
    )
    .map((n) => n.id);
}
