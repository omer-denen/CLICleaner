import { randomBytes } from 'node:crypto';

/** Kimligin kimseye sizmadigi rastgele kimlik. */
export function newId(): string {
  return randomBytes(8).toString('hex');
}
