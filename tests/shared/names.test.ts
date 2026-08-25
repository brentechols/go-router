import { describe, expect, it } from "vitest";

import { normalizeName, validateName } from "../../src/shared/names";

describe("route names", () => {
  it("normalizes case, hyphens, and underscores into one collision domain", () => {
    expect(normalizeName(" All-Hands ")).toBe("allhands");
    expect(normalizeName("all_hands")).toBe("allhands");
    expect(normalizeName("ALLHANDS")).toBe("allhands");
  });

  it("accepts valid names and lowercases them", () => {
    expect(validateName("Team-Wiki")).toEqual({
      valid: true,
      name: "team-wiki",
      normalizedName: "teamwiki",
    });
  });

  it.each(["api", "ad-min", "health_z", "assets"])("rejects reserved name %s", (name) => {
    expect(validateName(name)).toMatchObject({ valid: false });
  });

  it.each(["", "-leading", "has space", "slash/name", "a".repeat(65)])(
    "rejects invalid name %s",
    (name) => expect(validateName(name)).toMatchObject({ valid: false }),
  );
});
