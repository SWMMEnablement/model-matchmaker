import type { ParsedInp, SwmmCoord } from "./parseInp";

export interface MatchedPair<T> { a: T; b: T; byId: boolean; distance?: number; }
export interface MatchResult<T> {
  pairs: MatchedPair<T>[];
  onlyInA: T[];
  onlyInB: T[];
}

interface HasId { id: string; }

export function matchById<T extends HasId>(a: T[], b: T[]): MatchResult<T> {
  const bMap = new Map(b.map((x) => [x.id, x]));
  const pairs: MatchedPair<T>[] = [];
  const usedB = new Set<string>();
  const onlyInA: T[] = [];
  for (const x of a) {
    const m = bMap.get(x.id);
    if (m) { pairs.push({ a: x, b: m, byId: true }); usedB.add(x.id); }
    else onlyInA.push(x);
  }
  const onlyInB = b.filter((x) => !usedB.has(x.id));
  return { pairs, onlyInA, onlyInB };
}

// Symmetric spatial fallback: enumerate every (i,j) candidate within
// tolerance, sort by (distance, sorted-id-pair), and greedily accept
// mutually-still-available pairs. This is deterministic AND satisfies
// matchHybrid(A,B) ≡ matchHybrid(B,A) under swap, so score(A,B) ==
// score(B,A). The previous greedy-per-A pass depended on file order.
export function matchHybrid<T extends HasId>(
  a: T[],
  b: T[],
  coordsA: Map<string, SwmmCoord>,
  coordsB: Map<string, SwmmCoord>,
  tolerance: number,
): MatchResult<T> {
  const idResult = matchById(a, b);
  if (idResult.onlyInA.length === 0 || idResult.onlyInB.length === 0) {
    return idResult;
  }

  interface Cand { i: number; j: number; d: number; key: string; }
  const cands: Cand[] = [];
  for (let i = 0; i < idResult.onlyInA.length; i++) {
    const x = idResult.onlyInA[i];
    const cA = coordsA.get(x.id);
    if (!cA) continue;
    for (let j = 0; j < idResult.onlyInB.length; j++) {
      const y = idResult.onlyInB[j];
      const cB = coordsB.get(y.id);
      if (!cB) continue;
      const d = Math.hypot(cA.x - cB.x, cA.y - cB.y);
      if (d <= tolerance) {
        const [k1, k2] = x.id < y.id ? [x.id, y.id] : [y.id, x.id];
        cands.push({ i, j, d, key: `${k1}\u0000${k2}` });
      }
    }
  }
  cands.sort((p, q) => (p.d - q.d) || (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const extraPairs: MatchedPair<T>[] = [];
  for (const c of cands) {
    if (usedA.has(c.i) || usedB.has(c.j)) continue;
    usedA.add(c.i); usedB.add(c.j);
    extraPairs.push({
      a: idResult.onlyInA[c.i],
      b: idResult.onlyInB[c.j],
      byId: false,
      distance: c.d,
    });
  }
  const stillA = idResult.onlyInA.filter((_, i) => !usedA.has(i));
  const stillB = idResult.onlyInB.filter((_, j) => !usedB.has(j));
  return { pairs: [...idResult.pairs, ...extraPairs], onlyInA: stillA, onlyInB: stillB };
}

export function coordMap(inp: ParsedInp): Map<string, SwmmCoord> {
  const m = new Map<string, SwmmCoord>();
  for (const c of inp.coordinates) m.set(c.id, c);
  return m;
}
