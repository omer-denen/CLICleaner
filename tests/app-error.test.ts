import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, shouldRetry } from '../src/core/app-error.ts';

test('errno normalizasyonu', () => {
  const e = Object.assign(new Error('erisim'), { code: 'EACCES' });
  const a = AppError.from(e);
  assert.equal(a.code, 'permission');
  assert.equal(a.retryable, false);
  assert.equal(a.cause, e);
});

test('gecici hata yeniden denenir, en fazla 3', () => {
  const a = new AppError('transient', 'kilit');
  assert.equal(shouldRetry(a, 0), true);
  assert.equal(shouldRetry(a, 2), true);
  assert.equal(shouldRetry(a, 3), false);
});

test('iptal hata sayilmaz ama fatal degildir', () => {
  const a = AppError.from(Object.assign(new Error('abort'), { code: 'ECANCELED' }));
  assert.equal(a.code, 'cancelled');
  assert.equal(a.retryable, false);
});

test('sozlesme govdesi', () => {
  const a = new AppError('conflict', 'hedef dolu', { operationId: 'op1', itemId: 'i1', dataSafe: true });
  const body = a.toBody();
  assert.equal(body.type, 'conflict');
  assert.equal(body.operationId, 'op1');
  assert.equal(body.itemId, 'i1');
  assert.equal(body.dataSafe, true);
});
