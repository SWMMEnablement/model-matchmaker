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

// Hybrid: ID first, then nearest-neighbor on coords for unmatched.
export function matchHybrid<T extends HasId>(
  a: T[],
  b: T[],
  coordsA: Map<string, SwmmCoord>,
  coordsB: Map<string, SwmmCoord>,
  tolerance: number,
): MatchResult<T> {
  const idResult = matchById(a, b);
  const remB = [...idResult.onlyInB];
  const stillA: T[] = [];
  const extraPairs: MatchedPair<T>[] = [];

  for (const x of idResult.onlyInA) {
    const cA = coordsA.get(x.id);
    if (!cA || remB.length === 0) { stillA.push(x); continue; }
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < remB.length; i++) {
      const cB = coordsB.get(remB[i].id);
      if (!cB) continue;
      const d = Math.hypot(cA.x - cB.x, cA.y - cB.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0 && bestD <= tolerance) {
      extraPairs.push({ a: x, b: remB[best], byId: false, distance: bestD });
      remB.splice(best, 1);
    } else {
      stillA.push(x);
    }
  }
  return {
    pairs: [...idResult.pairs, ...extraPairs],
    onlyInA: stillA,
    onlyInB: remB,
  };
}

export function coordMap(inp: ParsedInp): Map<string, SwmmCoord> {
  const m = new Map<string, SwmmCoord>();
  for (const c of inp.coordinates) m.set(c.id, c);
  return m;
}
