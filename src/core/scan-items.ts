import type { Cluster } from './types.ts';

/**
 * Tarama akisinda oge kimligi.
 *
 * Ayni kume birden fazla hedef yolundan gelebilir (or. ayni uygulamanin
 * iki klasoru). Akista her oge ICIN kararli bir kimlik uretilir; istemci
 * ayni kimligi ikinci kez gordugunde satiri COGALTMAZ, GUNCELLER.
 *
 * Kimlik = kume anahtari + birincil yolun ozeti. Kume anahtari tek basina
 * yetmez: ayni uygulamanin farkli yollari ayri satir olarak gorunmelidir.
 */

/** FNV-1a (32 bit): yol ozeti. Kriptografik degil, yalnizca kimlik icin. */
export function pathHash(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Akista gosterilen birincil yol (yoksa kume anahtari). */
export function primaryPath(cluster: Cluster): string {
  return cluster.parts[0]?.path ?? cluster.key;
}

/** Kararli oge kimligi: kume anahtari + yol ozeti. */
export function scanItemId(cluster: Cluster): string {
  return `${cluster.key}#${pathHash(primaryPath(cluster))}`;
}
