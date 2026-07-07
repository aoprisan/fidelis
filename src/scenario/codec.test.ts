import { describe, expect, it } from "vitest";
import type { SimParams } from "../sim/simulate";
import { decodeParams, encodeParams, sanitizeParams } from "./codec";

const base: SimParams = {
  amount: 50000,
  startId: "2025-02",
  strat: "single",
  mat: 5,
  donor: false,
  reinvest: true,
};

describe("encode/decode round-trip", () => {
  it("preserves params exactly", () => {
    expect(decodeParams(encodeParams(base))).toEqual(base);
  });

  it("round-trips ladder + donor + no-reinvest", () => {
    const p: SimParams = { ...base, strat: "ladder", donor: true, reinvest: false, amount: 12345 };
    expect(decodeParams(encodeParams(p))).toEqual(p);
  });

  it("tolerates a leading '?' on decode", () => {
    expect(decodeParams(`?${encodeParams(base)}`)).toEqual(base);
  });
});

describe("sanitizeParams", () => {
  it("rejects a non-existent start issuance", () => {
    expect(sanitizeParams({ ...base, startId: "1999-01" })).toBeNull();
  });

  it("rejects a start issuance before the selectable range", () => {
    // 2024-08 exists in the table but is not offered as a start date.
    expect(sanitizeParams({ ...base, startId: "2024-08" })).toBeNull();
  });

  it("rejects an unknown strategy", () => {
    expect(sanitizeParams({ ...base, strat: "wild" as SimParams["strat"] })).toBeNull();
  });

  it("rejects a negative or non-finite amount", () => {
    expect(sanitizeParams({ ...base, amount: -1 })).toBeNull();
    expect(sanitizeParams({ ...base, amount: Number.NaN })).toBeNull();
  });

  it("snaps an invalid maturity to the default (5y) when available", () => {
    expect(sanitizeParams({ ...base, mat: 99 })?.mat).toBe(5);
  });

  it("snaps to the longest maturity when 5y is unavailable", () => {
    // Jun 2025 offers 2/4/6; 5 is not present, longest is 6.
    expect(sanitizeParams({ ...base, startId: "2025-06", mat: 99 })?.mat).toBe(6);
  });

  it("coerces truthy/falsy flags to booleans", () => {
    const p = sanitizeParams({ ...base, donor: 1, reinvest: 0 });
    expect(p?.donor).toBe(true);
    expect(p?.reinvest).toBe(false);
  });

  it("returns null for junk input", () => {
    expect(sanitizeParams(null)).toBeNull();
    expect(sanitizeParams("nope")).toBeNull();
    expect(sanitizeParams(42)).toBeNull();
  });
});

describe("decodeParams", () => {
  it("returns null when required fields are missing", () => {
    expect(decodeParams("a=1000")).toBeNull();
  });
});
