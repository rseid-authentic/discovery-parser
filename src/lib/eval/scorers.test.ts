import { describe, expect, it } from "vitest";
import {
  bates,
  boolean,
  caseInsensitiveString,
  enumMatch,
  exactString,
  fuzzyString,
  integer,
  isoDate,
  levenshtein,
  normalizeDate,
  setF1,
  similarity,
} from "./scorers";

describe("null policy (shared by all scorers)", () => {
  it("null/null is correct, value/null omitted, null/value invented", () => {
    expect(exactString(null, null)).toEqual({ score: 1, status: "correct" });
    expect(exactString("x", null)).toEqual({ score: 0, status: "omitted" });
    expect(exactString(null, "x")).toEqual({ score: 0, status: "invented" });
    expect(boolean(null, null).status).toBe("correct");
    expect(boolean(true, null).status).toBe("omitted");
    expect(boolean(null, true).status).toBe("invented");
    expect(integer(3, null).status).toBe("omitted");
    expect(isoDate(null, "2021-01-01").status).toBe("invented");
  });
});

describe("exactString / caseInsensitiveString", () => {
  it("exact requires identical text after trim", () => {
    expect(exactString("Re: Pricing", " Re: Pricing ").status).toBe("correct");
    expect(exactString("Re: Pricing", "re: pricing").status).toBe("wrong");
  });
  it("case-insensitive ignores case and whitespace runs", () => {
    expect(caseInsensitiveString("EN", "en").status).toBe("correct");
    expect(caseInsensitiveString("a  b", "A B").status).toBe("correct");
    expect(caseInsensitiveString("en", "de").status).toBe("wrong");
  });
  it("non-string actual is a schema violation", () => {
    expect(exactString("x", 5).status).toBe("schema_violation");
  });
});

describe("isoDate", () => {
  it("normalizes both sides", () => {
    expect(isoDate("2021-03-05", "March 5, 2021").status).toBe("correct");
    expect(isoDate("2021-03-05", "5 Mar 2021").status).toBe("correct");
    expect(isoDate("2021-03-05", "2021-03-05T10:00:00Z").status).toBe("correct");
    expect(isoDate("2021-03-05", "2021/03/05").status).toBe("correct");
  });
  it("treats ambiguous day/month as wrong rather than guessing", () => {
    expect(normalizeDate("03/05/2021")).toBeNull();
    expect(isoDate("2021-03-05", "03/05/2021").status).toBe("wrong");
    expect(normalizeDate("13/05/2021")).toBe("2021-05-13");
    expect(normalizeDate("05/13/2021")).toBe("2021-05-13");
  });
  it("rejects garbage", () => {
    expect(normalizeDate("yesterday")).toBeNull();
    expect(isoDate("2021-03-05", "Q1 2021").status).toBe("wrong");
    expect(normalizeDate("2021-13-01")).toBeNull();
  });
});

describe("bates", () => {
  it("is exact and preserves case and leading zeros", () => {
    expect(bates("GOOG-DOJ-00123456", "GOOG-DOJ-00123456").status).toBe("correct");
    expect(bates("GOOG-DOJ-00123456", "GOOG-DOJ-123456").status).toBe("wrong");
    expect(bates("GOOG-DOJ-00123456", "goog-doj-00123456").status).toBe("wrong");
    expect(bates("GOOG-DOJ-00123456", " GOOG-DOJ-00123456 ").status).toBe("correct");
  });
});

describe("enumMatch", () => {
  const s = enumMatch(["email", "memo"]);
  it("separates wrong-but-valid from schema violation", () => {
    expect(s("email", "email").status).toBe("correct");
    expect(s("email", "memo").status).toBe("wrong");
    expect(s("email", "fax").status).toBe("schema_violation");
  });
});

describe("fuzzyString", () => {
  const f = fuzzyString();
  it("passes near matches and fails distant ones", () => {
    expect(f("John A. Smith", "John A Smith").status).toBe("correct");
    expect(f("Quarterly Pricing Review", "Quarterly pricing review").status).toBe("correct");
    const r = f("Quarterly Pricing Review", "Annual Budget");
    expect(r.status).toBe("wrong");
    expect(r.score).toBeLessThan(0.85);
  });
  it("exposes the ratio as the score", () => {
    expect(f("abcd", "abcd").score).toBe(1);
  });
});

describe("setF1", () => {
  const s = setF1();
  it("empty/empty correct, expected/empty omitted, empty/actual invented", () => {
    expect(s([], []).status).toBe("correct");
    expect(s(null, []).status).toBe("correct");
    expect(s(["a@x.com"], []).status).toBe("omitted");
    expect(s([], ["a@x.com"]).status).toBe("invented");
  });
  it("computes F1 with fuzzy one-to-one matching", () => {
    expect(s(["Alice Smith", "Bob Jones"], ["bob jones", "alice smith"])).toEqual({
      score: 1,
      status: "correct",
    });
    const half = s(["Alice Smith", "Bob Jones"], ["Alice Smith"]);
    expect(half.status).toBe("wrong");
    expect(half.score).toBeCloseTo(2 / 3, 5); // p=1, r=0.5
  });
  it("non-array or non-string entries are schema violations", () => {
    expect(s(["a"], "a").status).toBe("schema_violation");
    expect(s(["a"], [1]).status).toBe("schema_violation");
  });
});

describe("boolean / integer", () => {
  it("compares strictly and flags type errors", () => {
    expect(boolean(true, true).status).toBe("correct");
    expect(boolean(true, false).status).toBe("wrong");
    expect(boolean(true, "true").status).toBe("schema_violation");
    expect(integer(4, 4).status).toBe("correct");
    expect(integer(4, 5).status).toBe("wrong");
    expect(integer(4, 4.5).status).toBe("schema_violation");
    expect(integer(4, "4").status).toBe("schema_violation");
  });
});

describe("string distance helpers", () => {
  it("levenshtein and similarity behave", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(similarity("", "")).toBe(1);
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("abc", "xyz")).toBe(0);
  });
});
