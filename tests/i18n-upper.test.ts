import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateUpper } from '../web/src/i18n.ts';

test('turkce buyuk harf: i -> İ (WHAT-İF)', () => {
  assert.equal(translateUpper('tr', 'graph.whatIf.title'), 'WHAT-İF');
  assert.equal(translateUpper('en', 'graph.whatIf.title'), 'WHAT-IF');
});

test('turkce buyuk harf: baslik ve etiketler', () => {
  assert.equal(translateUpper('tr', 'graph.nodes'), 'DÜĞÜMLER');
  assert.equal(translateUpper('tr', 'target.disk'), 'DİSK');
  assert.equal(translateUpper('en', 'target.disk'), 'DISK');
  assert.equal(translateUpper('tr', 'graph.edges'), 'KENARLAR');
});
