import { describe, expect, it } from "vitest";

import {
  parseDestinationTemplate,
  renderDestinationTemplate,
  TemplateError,
  validateDestinationTemplate,
} from "../../src/shared/template";

describe("destination templates", () => {
  it("parses and renders a plain placeholder without looping", () => {
    expect(parseDestinationTemplate("https://search.test/?q={*}").placeholderCount).toBe(1);
    expect(renderDestinationTemplate("https://search.test/?q={*}", ["hello world"])).toBe(
      "https://search.test/?q=hello%20world",
    );
  });

  it("renders adjacent braces in triple-brace optional syntax", () => {
    expect(renderDestinationTemplate("https://x.test/{{{*}}}", ["folder"])).toBe(
      "https://x.test/folder",
    );
    expect(renderDestinationTemplate("https://x.test/{{{*}}}")).toBe("https://x.test/");
  });

  it("renders an optional section or its default", () => {
    const template = "https://x.test{{?q={*}|?q=default}}";
    expect(renderDestinationTemplate(template, ["find me"])).toBe("https://x.test?q=find%20me");
    expect(renderDestinationTemplate(template)).toBe("https://x.test?q=default");
  });

  it("supports optional suffixes with defaults from the documented grammar", () => {
    const template = "https://x.test/search{{&sort={*}|&sort=relevance}}";
    expect(renderDestinationTemplate(template, ["newest"])).toBe(
      "https://x.test/search&sort=newest",
    );
    expect(renderDestinationTemplate(template)).toBe("https://x.test/search&sort=relevance");
  });

  it("lets the final placeholder capture remaining path arguments with slashes", () => {
    expect(
      renderDestinationTemplate("https://x.test/{*}/{*}", [
        { value: "team", source: "path" },
        { value: "folder a", source: "path" },
        { value: "document", source: "path" },
      ]),
    ).toBe("https://x.test/team/folder%20a/document");
  });

  it("joins remaining browser/query arguments with encoded spaces", () => {
    expect(renderDestinationTemplate("https://x.test/{*}/{*}", ["one", "two", "three"])).toBe(
      "https://x.test/one/two%20three",
    );
  });

  it("encodes values exactly once", () => {
    expect(renderDestinationTemplate("https://x.test/?q={*}", ["a/b?c=d%20e"])).toBe(
      "https://x.test/?q=a%2Fb%3Fc%3Dd%2520e",
    );
  });

  it("encodes argument controls so rendered locations cannot inject headers", () => {
    const rendered = renderDestinationTemplate("https://x.test/?q={*}", [
      "line one\r\nX-Evil: yes",
    ]);
    expect(rendered).toBe("https://x.test/?q=line%20one%0D%0AX-Evil%3A%20yes");
    expect(rendered).not.toMatch(/[\r\n]/);
  });

  it("serializes Unicode destinations to an ASCII-safe Location", () => {
    const rendered = renderDestinationTemplate("https://例え.テスト/資料");
    expect(rendered).toMatch(/^https:\/\/xn--/);
    expect(rendered).toMatch(/^[\x20-\x7e]+$/);
  });

  it("rejects missing required and unexpected arguments", () => {
    expect(() => renderDestinationTemplate("https://x.test/{*}")).toThrowError(TemplateError);
    expect(() => renderDestinationTemplate("https://x.test/static", ["extra"])).toThrow(
      "does not accept arguments",
    );
  });

  it.each([
    "ftp://x.test/{*}",
    "relative/{*}",
    "https://x.test/{{nested {{bad}} {*}}}",
    "https://x.test/{{without-placeholder}}",
    "https://x.test/{broken}",
    " https://x.test",
    "https://x.test/path with space",
    "https://x.test/path\tsegment",
    "https://x.test/path\nsegment",
    "https:example.test",
    "https://x.test\\normalized-by-whatwg",
    "https://x.test/%zz",
  ])("rejects malformed or unsafe template %s", (template) => {
    expect(validateDestinationTemplate(template).valid).toBe(false);
  });

  it("reports placeholder count for live form previews", () => {
    expect(validateDestinationTemplate("https://x.test/{*}{{?q={*}}}")).toEqual({
      valid: true,
      placeholderCount: 2,
    });
  });

  it("rejects an unsafe reachable fallback after a required placeholder", () => {
    const template = "https://x.test/{*}{{?next={*}|%zz}}";
    expect(renderDestinationTemplate(template, ["first", "second"])).toBe(
      "https://x.test/first?next=second",
    );
    expect(validateDestinationTemplate(template)).toMatchObject({
      valid: false,
      error: { code: "INVALID_DESTINATION" },
    });
  });
});
