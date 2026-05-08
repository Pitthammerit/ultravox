import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug, isValidSlug } from "../lib/slug";

describe("slugify", () => {
  it("lowercases and replaces whitespace with hyphens", () => {
    expect(slugify("Sales Emails")).toBe("sales-emails");
  });

  it("strips non-alphanumeric characters", () => {
    expect(slugify("B2B Email!!")).toBe("b2b-email");
  });

  it("collapses consecutive hyphens and trims", () => {
    expect(slugify("  -- foo  bar  --  ")).toBe("foo-bar");
  });

  it("transliterates German umlauts and ß", () => {
    expect(slugify("Geschäftsbrief für Müller")).toBe("geschaeftsbrief-fuer-mueller");
  });

  it("returns empty string for emoji-only input", () => {
    expect(slugify("✨")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("returns the candidate when no collision", () => {
    expect(uniqueSlug("foo", ["bar", "baz"])).toBe("foo");
  });

  it("appends -2 on collision", () => {
    expect(uniqueSlug("foo", ["foo", "bar"])).toBe("foo-2");
  });

  it("walks past existing -2/-3 suffixes", () => {
    expect(uniqueSlug("foo", ["foo", "foo-2", "foo-3"])).toBe("foo-4");
  });

  it("excludes currentId from collision set", () => {
    expect(uniqueSlug("foo", ["foo", "bar"], "foo")).toBe("foo");
  });

  it("dedupes a duplicated mode slug — 'sales-emails-copy' next to itself", () => {
    // Simulates the duplicate flow: original "sales-emails-copy" already
    // exists, user duplicates it again → should land on "sales-emails-copy-2".
    const existing = ["email", "sales-emails", "sales-emails-copy"];
    expect(uniqueSlug("sales-emails-copy", existing)).toBe("sales-emails-copy-2");
  });
});

describe("isValidSlug", () => {
  it("accepts well-formed slugs", () => {
    expect(isValidSlug("sales-emails")).toBe(true);
    expect(isValidSlug("b2b")).toBe(true);
    expect(isValidSlug("a1-b2-c3")).toBe(true);
  });

  it("rejects malformed slugs", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("Sales-Emails")).toBe(false);
    expect(isValidSlug("-foo")).toBe(false);
    expect(isValidSlug("foo-")).toBe(false);
    expect(isValidSlug("foo--bar")).toBe(false);
    expect(isValidSlug("foo bar")).toBe(false);
  });
});
