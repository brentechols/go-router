import { describe, expect, it } from "vitest";

import { buildGoQueryPath, formatBigint, retargetGoRequest } from "../../src/web/utils";

describe("save-and-go request preservation", () => {
  it("retargets path lookups without flattening repeated query arguments", () => {
    expect(retargetGoRequest("/Old/folder%20one?args=design+docs", "new-route")).toBe(
      "/new-route/folder%20one?args=design+docs",
    );
  });

  it("retargets whole-query browser lookups", () => {
    expect(retargetGoRequest("/?q=Old+engineering+design", "new-route")).toBe(
      "/?q=new-route+engineering+design",
    );
  });

  it("uses repeated query arguments when no original request is available", () => {
    expect(buildGoQueryPath("search", ["release notes", "current"])).toBe(
      "/search?args=release+notes&args=current",
    );
  });
});

describe("large counters", () => {
  it("formats PostgreSQL bigint values without losing precision", () => {
    expect(formatBigint("9223372036854775807")).toBe("9,223,372,036,854,775,807");
  });
});
