import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareVersions,
  maxSatisfying,
  parseVersion,
  satisfies,
  sortVersions,
  validRange,
} from '../src/core/semver.ts';

test('semver temel siralama', () => {
  assert.equal(compareVersions('1.2.3', '1.2.4'), -1);
  assert.equal(compareVersions('v2.0.0', '2.0.0'), 0);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.deepEqual(sortVersions(['1.2.0', '1.10.0', '1.2.1']), ['1.2.0', '1.2.1', '1.10.0']);
});

test('semver prerelease buyukten kucuktur', () => {
  assert.equal(compareVersions('1.0.0-beta.2', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1);
  assert.equal(compareVersions('1.0.0-beta.10', '1.0.0-beta.2'), 1);
});

test('caret ve tilde araliklari', () => {
  assert.equal(satisfies('1.4.0', '^1.2.3'), true);
  assert.equal(satisfies('2.0.0', '^1.2.3'), false);
  assert.equal(satisfies('0.2.9', '^0.2.3'), true);
  assert.equal(satisfies('0.3.0', '^0.2.3'), false);
  assert.equal(satisfies('1.2.9', '~1.2.3'), true);
  assert.equal(satisfies('1.3.0', '~1.2.3'), false);
});

test('karsilastirma, x-range ve OR', () => {
  assert.equal(satisfies('1.2.3', '>=1.0.0 <2.0.0'), true);
  assert.equal(satisfies('2.0.0', '>=1.0.0 <2.0.0'), false);
  assert.equal(satisfies('1.4.0', '1.x'), true);
  assert.equal(satisfies('2.0.0', '1.x'), false);
  assert.equal(satisfies('3.1.0', '^1.0.0 || >=3.0.0'), true);
  assert.equal(validRange('^1.2.3 || ~2.0.0'), true);
});

test('maxSatisfying', () => {
  assert.equal(maxSatisfying(['1.2.0', '1.4.1', '2.0.0'], '^1.2.0'), '1.4.1');
  assert.equal(maxSatisfying(['1.2.0'], '^2.0.0'), null);
});

test('gecersiz surum', () => {
  assert.equal(parseVersion('abc'), null);
  assert.equal(satisfies('abc', '*'), false);
  assert.equal(satisfies('1.2.3', '*'), true);
});
