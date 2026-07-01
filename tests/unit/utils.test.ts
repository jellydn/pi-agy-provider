import { describe, it, expect } from "vitest";
import { isRecord, stringValue, numberValue, booleanValue } from "../../src/utils.js";

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ key: "value", num: 42 })).toBe(true);
  });

  it("returns true for objects with null prototype", () => {
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isRecord([])).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it("returns false for functions", () => {
    expect(isRecord(() => {})).toBe(false);
  });
});

describe("stringValue", () => {
  it("returns the string for string values", () => {
    expect(stringValue("hello")).toBe("hello");
    expect(stringValue("")).toBe("");
  });

  it("returns undefined for non-string values", () => {
    expect(stringValue(42)).toBeUndefined();
    expect(stringValue(true)).toBeUndefined();
    expect(stringValue(null)).toBeUndefined();
  });
});

describe("numberValue", () => {
  it("returns the number for finite numeric values", () => {
    expect(numberValue(42)).toBe(42);
    expect(numberValue(0)).toBe(0);
    expect(numberValue(-1)).toBe(-1);
  });

  it("returns undefined for Infinity", () => {
    expect(numberValue(Infinity)).toBeUndefined();
  });

  it("returns undefined for NaN", () => {
    expect(numberValue(NaN)).toBeUndefined();
  });

  it("parses parseable numeric strings", () => {
    expect(numberValue("42")).toBe(42);
    expect(numberValue("3.14")).toBeCloseTo(3.14);
  });

  it("rejects strings with trailing non-numeric text", () => {
    expect(numberValue("12px")).toBeUndefined();
  });

  it("returns undefined for non-parseable strings", () => {
    expect(numberValue("abc")).toBeUndefined();
    expect(numberValue("")).toBeUndefined();
  });
});

describe("booleanValue", () => {
  it("returns true for true", () => {
    expect(booleanValue(true)).toBe(true);
  });

  it("returns false for false", () => {
    expect(booleanValue(false)).toBe(false);
  });

  it("returns undefined for truthy non-booleans", () => {
    expect(booleanValue(1)).toBeUndefined();
    expect(booleanValue("true")).toBeUndefined();
  });
});
