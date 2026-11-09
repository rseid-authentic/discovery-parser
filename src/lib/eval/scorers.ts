/**
 * Pure per-field scorers. One scorer per field TYPE, never a blended accuracy.
 *
 * Null policy (applies to every scorer):
 *   expected null,  actual null  -> correct   (score 1)
 *   expected value, actual null  -> omitted   (score 0)
 *   expected null,  actual value -> invented  (score 0)
 *   wrong JS type for the field  -> schema_violation (score 0)
 */

export type ScoreStatus = "correct" | "wrong" | "omitted" | "invented" | "schema_violation";

export type ScoreResult = { score: number; status: ScoreStatus };

export type Scorer = (expected: unknown, actual: unknown) => ScoreResult;

const CORRECT: ScoreResult = { score: 1, status: "correct" };
const WRONG: ScoreResult = { score: 0, status: "wrong" };
const OMITTED: ScoreResult = { score: 0, status: "omitted" };
const INVENTED: ScoreResult = { score: 0, status: "invented" };
const VIOLATION: ScoreResult = { score: 0, status: "schema_violation" };

function isNil(v: unknown): v is null | undefined {
  return v === null || v === undefined;
}

/** Shared null handling; `compare` only runs when both sides are non-null. */
function withNulls(expected: unknown, actual: unknown, compare: () => ScoreResult): ScoreResult {
  if (isNil(expected) && isNil(actual)) return CORRECT;
  if (!isNil(expected) && isNil(actual)) return OMITTED;
  if (isNil(expected) && !isNil(actual)) return INVENTED;
  return compare();
}

function bothStrings(expected: unknown, actual: unknown, f: (e: string, a: string) => ScoreResult): ScoreResult {
  return withNulls(expected, actual, () => {
    if (typeof actual !== "string") return VIOLATION;
    if (typeof expected !== "string") return VIOLATION; // bad label; surface it loudly
    return f(expected, actual);
  });
}

// ---------------------------------------------------------------------------

export const exactString: Scorer = (e, a) =>
  bothStrings(e, a, (x, y) => (x.trim() === y.trim() ? CORRECT : WRONG));

export const caseInsensitiveString: Scorer = (e, a) =>
  bothStrings(e, a, (x, y) => (normalizeWs(x).toLowerCase() === normalizeWs(y).toLowerCase() ? CORRECT : WRONG));

/** Identifiers: exact, case preserved, leading zeros preserved. Only whitespace is trimmed. */
export const bates: Scorer = (e, a) => bothStrings(e, a, (x, y) => (x.trim() === y.trim() ? CORRECT : WRONG));

/** Normalizes both sides to YYYY-MM-DD; an ambiguous or unparseable actual is wrong, never guessed. */
export const isoDate: Scorer = (e, a) =>
  bothStrings(e, a, (x, y) => {
    const ne = normalizeDate(x);
    const na = normalizeDate(y);
    if (ne === null) return VIOLATION; // label is not a date we can read
    if (na === null) return WRONG;
    return ne === na ? CORRECT : WRONG;
  });

export function enumMatch(allowed: readonly string[]): Scorer {
  const set = new Set(allowed);
  return (e, a) =>
    bothStrings(e, a, (x, y) => {
      if (!set.has(y)) return VIOLATION;
      return x === y ? CORRECT : WRONG;
    });
}

export const FUZZY_THRESHOLD = 0.85;

/** Normalized Levenshtein similarity; score is the ratio, correct iff >= threshold. */
export function fuzzyString(threshold = FUZZY_THRESHOLD): Scorer {
  return (e, a) =>
    bothStrings(e, a, (x, y) => {
      const ratio = similarity(normalizeForFuzzy(x), normalizeForFuzzy(y));
      return { score: ratio, status: ratio >= threshold ? "correct" : "wrong" };
    });
}

/**
 * Sets of strings (recipients, people, organizations). Score = F1 after fuzzy
 * matching each expected item to at most one actual item. Empty arrays count
 * as null for the omitted/invented policy.
 */
export function setF1(threshold = FUZZY_THRESHOLD): Scorer {
  return (expected, actual) => {
    const e = isNil(expected) ? [] : expected;
    const a = isNil(actual) ? [] : actual;
    if (!Array.isArray(e)) return VIOLATION;
    if (!Array.isArray(a)) return VIOLATION;
    if (!a.every((v) => typeof v === "string")) return VIOLATION;
    if (!e.every((v) => typeof v === "string")) return VIOLATION;
    const es = e.map(normalizeForFuzzy);
    const as = a.map(normalizeForFuzzy);
    if (es.length === 0 && as.length === 0) return CORRECT;
    if (es.length > 0 && as.length === 0) return OMITTED;
    if (es.length === 0 && as.length > 0) return INVENTED;

    const used = new Set<number>();
    let tp = 0;
    for (const x of es) {
      let bestIdx = -1;
      let best = 0;
      as.forEach((y, i) => {
        if (used.has(i)) return;
        const s = similarity(x, y);
        if (s > best) {
          best = s;
          bestIdx = i;
        }
      });
      if (bestIdx >= 0 && best >= threshold) {
        used.add(bestIdx);
        tp++;
      }
    }
    const precision = tp / as.length;
    const recall = tp / es.length;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { score: f1, status: f1 === 1 ? "correct" : "wrong" };
  };
}

export const boolean: Scorer = (e, a) =>
  withNulls(e, a, () => {
    if (typeof a !== "boolean" || typeof e !== "boolean") return VIOLATION;
    return e === a ? CORRECT : WRONG;
  });

export const integer: Scorer = (e, a) =>
  withNulls(e, a, () => {
    if (!Number.isInteger(a) || !Number.isInteger(e)) return VIOLATION;
    return e === a ? CORRECT : WRONG;
  });

// ---------------------------------------------------------------------------
// helpers (exported for tests)

export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeForFuzzy(s: string): string {
  return normalizeWs(s)
    .toLowerCase()
    .replace(/[“”"'‘’.,;:()<>\[\]]/g, "");
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Returns YYYY-MM-DD or null. Accepts ISO (with optional time), month-name
 * forms ("January 5, 2021", "5 Jan 2021"), and slash/dot numeric forms only
 * when day vs month is unambiguous (one part > 12 or both equal).
 */
export function normalizeDate(input: string): string | null {
  const s = input.trim();
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/))) {
    return ymd(+m[1], +m[2], +m[3]);
  }
  if ((m = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/))) {
    return ymd(+m[1], +m[2], +m[3]);
  }
  if ((m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) {
    const mo = MONTHS[m[1].toLowerCase()];
    return mo ? ymd(+m[3], mo, +m[2]) : null;
  }
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})$/))) {
    const mo = MONTHS[m[2].toLowerCase()];
    return mo ? ymd(+m[3], mo, +m[1]) : null;
  }
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    if (a > 12 && b <= 12) return ymd(y, b, a); // DD/MM/YYYY
    if (b > 12 && a <= 12) return ymd(y, a, b); // MM/DD/YYYY
    if (a === b) return ymd(y, a, b);
    return null; // ambiguous: refuse to guess
  }
  return null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 1 - normalized edit distance, in [0, 1]. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}
