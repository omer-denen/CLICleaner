import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DependencyGraph } from '../src/core/dependency-graph.ts';

function graph(): DependencyGraph {
  const g = new DependencyGraph();
  g.addNode({ id: 't1', kind: 'tool', label: 'tool1', group: 'g1' });
  g.addNode({ id: 's1', kind: 'shim', label: 's1', group: 'g1' });
  g.addNode({ id: 'pkg1', kind: 'package', label: 'pkg1', group: 'g1' });
  g.addNode({ id: 't2', kind: 'tool', label: 'tool2', group: 'g2' });
  g.addNode({ id: 'cfg', kind: 'config', label: 'config', group: 'config' });
  g.addNode({ id: 'a', kind: 'package', label: 'a' });
  g.addNode({ id: 'b', kind: 'package', label: 'b' });

  g.addEdge({ from: 's1', to: 't1', kind: 'link', strength: 'hard', active: true });
  g.addEdge({ from: 't1', to: 'pkg1', kind: 'package', strength: 'hard', active: true });
  g.addEdge({ from: 'cfg', to: 't2', kind: 'config', strength: 'hard', active: true });
  g.addEdge({ from: 'a', to: 'b', kind: 'package', strength: 'soft', active: true });
  g.addEdge({ from: 'b', to: 'a', kind: 'package', strength: 'soft', active: true });
  g.addEdge({ from: 't2', to: 'missing', kind: 'runtime', strength: 'hard', active: true });
  g.validate();
  return g;
}

test('ayni grup shim kaldirmayi engellemez', () => {
  const g = graph();
  const r = g.whatIf(['t1']);
  assert.deepEqual(r.allowed, ['t1']);
  assert.equal(r.blocked.length, 0);
});

test('sert/aktif config bagimliligi kaldirmayi engeller', () => {
  const g = graph();
  const r = g.whatIf(['t2']);
  assert.equal(r.allowed.length, 0);
  assert.equal(r.blocked.length, 1);
  assert.equal(r.blocked[0]!.dependents[0]!.id, 'cfg');
});

test('dongu tespiti ve cyclic kenar', () => {
  const g = graph();
  const cycles = g.cycles();
  assert.equal(cycles.length, 1);
  assert.deepEqual(new Set(cycles[0]), new Set(['a', 'b']));
  assert.ok(g.edges().some((e) => e.state === 'cyclic'));
});

test('kopuk kenar kok nedeni hedefe gore gruplanir', () => {
  const g = graph();
  const causes = g.rootCauses();
  assert.equal(causes.length, 1);
  assert.equal(causes[0]!.root, 'missing');
  assert.equal(causes[0]!.count, 1);
});

test('rol ve seviye', () => {
  const g = graph();
  const roles = g.roles();
  assert.equal(roles.get('t1'), 'leaf');
  const levels = g.levels();
  assert.equal(levels.get('t2'), 'medium');
});

test('topolojik sira dongude sonsuz donguye girmez', () => {
  const g = graph();
  const order = g.topoOrder();
  assert.equal(order.length, g.nodes().length);
});
