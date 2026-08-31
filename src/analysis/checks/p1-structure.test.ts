import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { optgroupCheck } from "./optgroup";
import { tableCaptionCheck } from "./table-caption";
import { thScopeCheck } from "./th-scope";
import { layoutTableMarkupCheck } from "./layout-table-markup";
import { svgNameCheck } from "./svg-name";
import { figureCaptionCheck } from "./figure-caption";
import { redundantRoleCheck } from "./redundant-role";
import { noninteractiveTabindexCheck } from "./noninteractive-tabindex";
import { ariaActivedescendantCheck } from "./aria-activedescendant";
import type { AccessibilityCheck } from "../types";

function run(check: AccessibilityCheck, jsx: string) {
  return check.run(parseSource("test.tsx", jsx));
}

describe("optgroup", () => {
  it("flags an optgroup without a label", () => {
    const findings = run(
      optgroupCheck,
      `const A = () => (
        <select>
          <optgroup>
            <option>One</option>
          </optgroup>
        </select>
      );`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("optgroup");
  });

  it("accepts an optgroup with a label", () => {
    expect(
      run(
        optgroupCheck,
        `const A = () => (
          <select>
            <optgroup label="Fruit">
              <option>Apple</option>
            </optgroup>
          </select>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("table-caption", () => {
  it("flags a data table without a caption", () => {
    expect(
      run(
        tableCaptionCheck,
        `const A = () => (
          <table>
            <tr><th>Name</th></tr>
            <tr><td>Ada</td></tr>
          </table>
        );`,
      ),
    ).toHaveLength(1);
  });

  it("accepts a caption or labelled data table", () => {
    expect(
      run(
        tableCaptionCheck,
        `const A = () => (
          <table>
            <caption>Staff</caption>
            <tr><th>Name</th></tr>
            <tr><td>Ada</td></tr>
          </table>
        );`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        tableCaptionCheck,
        `const A = () => (
          <table aria-labelledby="t">
            <tr><th>Name</th></tr>
          </table>
        );`,
      ),
    ).toHaveLength(0);
  });

  it("ignores layout tables and tables without headers", () => {
    expect(
      run(
        tableCaptionCheck,
        `const A = () => (
          <table role="presentation">
            <tr><td>Logo</td><td>Nav</td></tr>
          </table>
        );`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        tableCaptionCheck,
        `const A = () => (
          <table>
            <tr><td>Only data</td></tr>
          </table>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("th-scope", () => {
  it("flags a th without scope or headers association", () => {
    expect(
      run(
        thScopeCheck,
        `const A = () => (
          <table>
            <tr><th>Name</th><td>Ada</td></tr>
          </table>
        );`,
      ),
    ).toHaveLength(1);
  });

  it("accepts scope and headers/id pairing", () => {
    expect(
      run(
        thScopeCheck,
        `const A = () => (
          <table>
            <tr><th scope="col">Name</th></tr>
          </table>
        );`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        thScopeCheck,
        `const A = () => (
          <table>
            <tr><th id="n">Name</th></tr>
            <tr><td headers="n">Ada</td></tr>
          </table>
        );`,
      ),
    ).toHaveLength(0);
  });

  it("ignores headers inside a layout table", () => {
    expect(
      run(
        thScopeCheck,
        `const A = () => (
          <table role="presentation">
            <tr><th>X</th></tr>
          </table>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("layout-table-markup", () => {
  it("flags a presentation table that still has data-table markup", () => {
    expect(
      run(
        layoutTableMarkupCheck,
        `const A = () => (
          <table role="presentation">
            <tr><th>X</th></tr>
          </table>
        );`,
      ),
    ).toHaveLength(1);
  });

  it("accepts a layout table of plain cells", () => {
    expect(
      run(
        layoutTableMarkupCheck,
        `const A = () => (
          <table role="presentation">
            <tr><td>Logo</td><td>Nav</td></tr>
          </table>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("svg-name", () => {
  it("flags a standalone svg without an accessible name", () => {
    expect(
      run(svgNameCheck, `const A = () => <svg viewBox="0 0 10 10" />;`),
    ).toHaveLength(1);
  });

  it("accepts titled, labelled, or decorative svg", () => {
    expect(
      run(
        svgNameCheck,
        `const A = () => (
          <svg viewBox="0 0 10 10" aria-label="Chart">
            <circle r="4" />
          </svg>
        );`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        svgNameCheck,
        `const A = () => (
          <svg role="presentation" viewBox="0 0 10 10">
            <circle r="4" />
          </svg>
        );`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        svgNameCheck,
        `const A = () => (
          <button>
            <svg viewBox="0 0 10 10"><circle r="4" /></svg>
            Save
          </button>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("figure-caption", () => {
  it("flags a figure whose caption text is not in figcaption", () => {
    expect(
      run(
        figureCaptionCheck,
        `const A = () => (
          <figure>
            <img src="/chart.png" alt="Sales" />
            Sales by quarter
          </figure>
        );`,
      ),
    ).toHaveLength(1);
  });

  it("accepts figcaption and figures with no caption text", () => {
    expect(
      run(
        figureCaptionCheck,
        `const A = () => (
          <figure>
            <img src="/chart.png" alt="Sales" />
            <figcaption>Sales by quarter</figcaption>
          </figure>
        );`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        figureCaptionCheck,
        `const A = () => (
          <figure>
            <img src="/photo.png" alt="A lake" />
          </figure>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("redundant-role", () => {
  it("flags a native button with role=button", () => {
    expect(
      run(redundantRoleCheck, `const A = () => <button role="button">Save</button>;`),
    ).toHaveLength(1);
  });

  it("accepts a custom widget role and a native control without a role", () => {
    expect(
      run(redundantRoleCheck, `const A = () => <div role="button">Save</div>;`),
    ).toHaveLength(0);
    expect(
      run(redundantRoleCheck, `const A = () => <button>Save</button>;`),
    ).toHaveLength(0);
  });
});

describe("noninteractive-tabindex", () => {
  it("flags tabindex 0 on a generic element without a widget role or keyboard handler", () => {
    expect(
      run(
        noninteractiveTabindexCheck,
        `const A = () => <div tabIndex={0}>Panel</div>;`,
      ),
    ).toHaveLength(1);
  });

  it("accepts widgets, native controls, and keyboard-handled hosts", () => {
    expect(
      run(
        noninteractiveTabindexCheck,
        `const A = () => <div role="button" tabIndex={0}>Save</div>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        noninteractiveTabindexCheck,
        `const A = () => <div tabIndex={0} onKeyDown={fn}>Panel</div>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        noninteractiveTabindexCheck,
        `const A = () => <button tabIndex={0}>Save</button>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("aria-activedescendant", () => {
  it("flags aria-activedescendant on a host that cannot take keyboard focus", () => {
    expect(
      run(
        ariaActivedescendantCheck,
        `const A = () => (
          <div role="listbox" aria-activedescendant="opt-1">
            <div id="opt-1" role="option">One</div>
          </div>
        );`,
      ),
    ).toHaveLength(1);
  });

  it("accepts a tabbable composite", () => {
    expect(
      run(
        ariaActivedescendantCheck,
        `const A = () => (
          <div role="listbox" tabIndex={0} aria-activedescendant="opt-1">
            <div id="opt-1" role="option">One</div>
          </div>
        );`,
      ),
    ).toHaveLength(0);
  });
});
