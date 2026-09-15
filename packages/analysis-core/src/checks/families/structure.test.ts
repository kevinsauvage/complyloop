import { describe, expect, it } from "vitest";

import { parseSource } from "../../parse";
import {
  blockquoteCiteCheck,
  decorativeIgnoredCheck,
  duplicateIdCheck,
  emptyThCheck,
  figureCaptionCheck,
  headingOrderCheck,
  layoutTableMarkupCheck,
  listStructureCheck,
  pAsHeadingCheck,
  tableCaptionCheck,
  tableSummaryCheck,
} from "./structure";

describe("heading-order", () => {
  it("flags skipped heading levels", () => {
    const findings = headingOrderCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<div><h1>Title</h1><h3>Skip</h3></div>);`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("heading-order");
  });
});

describe("list-structure", () => {
  it("flags orphan list items and non-li list children", () => {
    const orphan = listStructureCheck.run(
      parseSource("test.tsx", `const A = () => <div><li>x</li></div>;`),
    );
    expect(orphan).toHaveLength(1);
    expect(orphan[0]?.reason).toContain("found under <div>");
    expect(orphan[0]?.confidence).toBe("high");

    expect(
      listStructureCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <ul><div>not an item</div></ul>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("flags list items with no enclosing JSX parent", () => {
    const findings = listStructureCheck.run(
      parseSource("test.tsx", `const item = <li>x</li>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.confidence).toBe("medium");
    expect(findings[0]?.reason).toContain("no list parent");
  });

  it("flags self-closing non-li children inside lists", () => {
    const findings = listStructureCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <ol><img src="/x.png" alt="" /></ol>;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("<img>");
  });

  it("accepts well-formed lists including menu", () => {
    expect(
      listStructureCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <ul><li>One</li><li>Two</li></ul>;`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      listStructureCheck.run(
        parseSource("test.tsx", `const A = () => <menu><li>A</li></menu>;`),
      ),
    ).toHaveLength(0);
  });

  it("ignores whitespace and expression children that are not elements", () => {
    expect(
      listStructureCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <ul>{items}<li>One</li></ul>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("p-as-heading", () => {
  it("warns when a paragraph is styled like a heading", () => {
    const findings = pAsHeadingCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <p className="text-4xl font-bold">Section</p>;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("ignores ordinary paragraphs and real headings", () => {
    expect(
      pAsHeadingCheck.run(
        parseSource("test.tsx", `const A = () => <p>Hello</p>;`),
      ),
    ).toHaveLength(0);
    expect(
      pAsHeadingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <h1 className="text-4xl">Hello</h1>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("empty-th", () => {
  it("flags an empty table header", () => {
    expect(
      emptyThCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <table><thead><tr><th /></tr></thead></table>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a named header", () => {
    expect(
      emptyThCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <table><tr><th>Name</th><th aria-label="Actions" /></tr></table>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("table-caption", () => {
  it("flags a data table without a caption", () => {
    expect(
      tableCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <tr><th>Name</th></tr>
              <tr><td>Ada</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a caption or labelled data table", () => {
    expect(
      tableCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <caption>Staff</caption>
              <tr><th>Name</th></tr>
              <tr><td>Ada</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      tableCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table aria-labelledby="t">
              <tr><th>Name</th></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores layout tables and tables without headers", () => {
    expect(
      tableCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table role="presentation">
              <tr><td>Logo</td><td>Nav</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      tableCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <tr><td>Only data</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("table-summary", () => {
  it("flags a complex table without summary", () => {
    const source = `const A = () => (
      <table>
        <thead><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>2</td><td>3</td><td>4</td></tr>
          <tr><td>5</td><td>6</td><td>7</td><td>8</td></tr>
          <tr><td>9</td><td>10</td><td>11</td><td>12</td></tr>
          <tr><td>13</td><td>14</td><td>15</td><td>16</td></tr>
        </tbody>
      </table>
    );`;
    expect(tableSummaryCheck.run(parseSource("test.tsx", source))).toHaveLength(
      1,
    );
  });

  it("accepts aria-describedby on complex tables", () => {
    const source = `const A = () => (
      <table aria-describedby="tbl-desc">
        <thead><tr><th colSpan={2}>Group</th></tr></thead>
        <tbody><tr><td>x</td><td>y</td></tr></tbody>
      </table>
    );`;
    expect(tableSummaryCheck.run(parseSource("test.tsx", source))).toHaveLength(
      0,
    );
  });

  it("ignores simple small tables", () => {
    const source = `const A = () => (
      <table><tr><th>Name</th><td>Ada</td></tr></table>
    );`;
    expect(tableSummaryCheck.run(parseSource("test.tsx", source))).toHaveLength(
      0,
    );
  });
});

describe("layout-table-markup", () => {
  it("flags a presentation table that still has data-table markup", () => {
    expect(
      layoutTableMarkupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table role="presentation">
              <tr><th>X</th></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a layout table of plain cells", () => {
    expect(
      layoutTableMarkupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table role="presentation">
              <tr><td>Logo</td><td>Nav</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("figure-caption", () => {
  it("flags a figure whose caption text is not in figcaption", () => {
    expect(
      figureCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <figure>
              <img src="/chart.png" alt="Sales" />
              Sales by quarter
            </figure>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts figcaption and figures with no caption text", () => {
    expect(
      figureCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <figure>
              <img src="/chart.png" alt="Sales" />
              <figcaption>Sales by quarter</figcaption>
            </figure>
          );`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      figureCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <figure>
              <img src="/photo.png" alt="A lake" />
            </figure>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("blockquote-cite", () => {
  it("flags blockquote cite without citation text", () => {
    expect(
      blockquoteCiteCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <blockquote cite="https://example.com" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts blockquote with cite element", () => {
    expect(
      blockquoteCiteCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <blockquote cite="https://example.com"><cite>Ada</cite></blockquote>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("duplicate-id", () => {
  it("flags repeated id values in a file", () => {
    const findings = duplicateIdCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<div><span id="x" /><button id="x" /></div>);`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toContain('id="x"');
  });

  it("reports each occurrence after the first", () => {
    const findings = duplicateIdCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<div><span id="x" /><button id="x" /><i id="x" /></div>);`,
      ),
    );
    expect(findings).toHaveLength(2);
  });

  it("ignores unique, empty, and dynamic ids", () => {
    expect(
      duplicateIdCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><span id="a" /><button id="b" /><i id="" /><b id={id} /></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("decorative-ignored", () => {
  it("flags presentation role with non-empty alt", () => {
    const findings = decorativeIgnoredCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <img src="/border.png" alt="divider" role="presentation" />;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("decorative-ignored");
  });

  it("flags empty alt with title", () => {
    const findings = decorativeIgnoredCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <img src="/border.png" alt="" title="Spacer" />;`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("flags whitespace-only alt", () => {
    const findings = decorativeIgnoredCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <img src="/border.png" alt="   " />;`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("accepts properly ignored decorative images", () => {
    expect(
      decorativeIgnoredCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <>
              <img src="/border.png" alt="" />
              <img src="/icon.svg" aria-hidden="true" />
              <img src="/line.png" role="presentation" alt="" />
            </>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("flags whitespace-only alt on input image buttons", () => {
    const findings = decorativeIgnoredCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <input type="image" src="/go.png" alt="   " />;`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("ignores non-image hosts", () => {
    expect(
      decorativeIgnoredCheck.run(
        parseSource("test.tsx", `const A = () => <div>Hello</div>;`),
      ),
    ).toHaveLength(0);
    expect(
      decorativeIgnoredCheck.run(
        parseSource("test.tsx", `const A = () => <input />;`),
      ),
    ).toHaveLength(0);
  });
});

describe("list-structure (self-closing coverage)", () => {
  it("ignores self-closing lists and self-closing li children", () => {
    expect(
      listStructureCheck.run(
        parseSource("test.tsx", `const A = () => <ul />;`),
      ),
    ).toHaveLength(0);
    expect(
      listStructureCheck.run(
        parseSource("test.tsx", `const A = () => <ul><li /></ul>;`),
      ),
    ).toHaveLength(0);
  });
});

describe("p-as-heading (inline style coverage)", () => {
  it("warns for inline fontSize styles that look like headings", () => {
    const px = pAsHeadingCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <p style={{ fontSize: "30px" }}>Section</p>;`,
      ),
    );
    expect(px).toHaveLength(1);
    const rem = pAsHeadingCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <p style={{ fontSize: "2rem" }}>Section</p>;`,
      ),
    );
    expect(rem).toHaveLength(1);
  });

  it("ignores role=heading, non-object styles, unrelated props, and small sizes", () => {
    const cases = [
      `const A = () => <p role="heading" aria-level="2" className="text-4xl">Section</p>;`,
      `const A = () => <p style={headingStyle}>Hello</p>;`,
      `const A = () => <p style="font-size:30px">Hello</p>;`,
      `const A = () => <p style={{ color: "red" }}>Hello</p>;`,
      `const A = () => <p style={{ ...base }}>Hello</p>;`,
      `const A = () => <p style={{ fontSize: "12px" }}>Hello</p>;`,
      `const A = () => <p style={{ fontSize: "1rem" }}>Hello</p>;`,
    ];
    for (const code of cases) {
      expect(pAsHeadingCheck.run(parseSource("test.tsx", code))).toHaveLength(
        0,
      );
    }
  });
});

describe("empty-th (spread coverage)", () => {
  it("ignores spread headers", () => {
    expect(
      emptyThCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <table><thead><tr><th {...props} /></tr></thead></table>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("table-caption (spread coverage)", () => {
  it("ignores spread and self-closing tables", () => {
    expect(
      tableCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<table {...props}><tr><th>Name</th></tr></table>);`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      tableCaptionCheck.run(
        parseSource("test.tsx", `const A = () => <table />;`),
      ),
    ).toHaveLength(0);
  });
});

describe("table-summary (summary forms coverage)", () => {
  it("accepts summary and aria-details on complex tables", () => {
    const base = (attrs: string) => `const A = () => (
      <table ${attrs}>
        <thead><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>2</td><td>3</td><td>4</td></tr>
          <tr><td>5</td><td>6</td><td>7</td><td>8</td></tr>
          <tr><td>9</td><td>10</td><td>11</td><td>12</td></tr>
          <tr><td>13</td><td>14</td><td>15</td><td>16</td></tr>
        </tbody>
      </table>
    );`;
    expect(
      tableSummaryCheck.run(
        parseSource("test.tsx", base(`summary="Sales by quarter"`)),
      ),
    ).toHaveLength(0);
    expect(
      tableSummaryCheck.run(
        parseSource("test.tsx", base(`aria-details="tbl-details"`)),
      ),
    ).toHaveLength(0);
  });

  it("ignores spread, presentation, and non-data tables", () => {
    expect(
      tableSummaryCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<table {...props}><tr><td>x</td></tr></table>);`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      tableSummaryCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table role="presentation">
              <thead><tr><th>A</th></tr></thead>
              <thead><tr><th>B</th></tr></thead>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      tableSummaryCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<table><tr><td>Only data</td></tr></table>);`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      tableSummaryCheck.run(
        parseSource("test.tsx", `const A = () => <table />;`),
      ),
    ).toHaveLength(0);
  });

  it("flags complex tables via expression spans, multiple theads, and self-closing rows", () => {
    expect(
      tableSummaryCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <thead><tr><th>Group</th></tr></thead>
              <tbody><tr><td colSpan={4}>x</td></tr></tbody>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(1);
    expect(
      tableSummaryCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <thead><tr><th>A</th></tr></thead>
              <thead><tr><th>B</th></tr></thead>
              <tbody><tr><td>x</td></tr></tbody>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(1);
    expect(
      tableSummaryCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <thead><tr><th>A</th><th>B</th></tr></thead>
              <tbody><tr /><tr><td colSpan={2}>x</td></tr></tbody>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });
});

describe("layout-table-markup (host coverage)", () => {
  it("ignores spread tables, non-presentation tables, and self-closing presentation tables", () => {
    expect(
      layoutTableMarkupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<table {...props} role="presentation"><tr><th>X</th></tr></table>);`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      layoutTableMarkupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<table><tr><th>X</th></tr></table>);`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      layoutTableMarkupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <table role="presentation" />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("figure-caption (caption shape coverage)", () => {
  it("flags expression and element captions outside figcaption", () => {
    expect(
      figureCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<figure><img src="/c.png" alt="Chart" />{caption}</figure>);`,
        ),
      ),
    ).toHaveLength(1);
    expect(
      figureCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<figure><img src="/c.png" alt="Chart" /><p>Quarterly sales</p></figure>);`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("ignores spread figures, self-closing figures, and figures without images", () => {
    expect(
      figureCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<figure {...props}><img src="/c.png" alt="Chart" />Caption</figure>);`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      figureCaptionCheck.run(
        parseSource("test.tsx", `const A = () => <figure />;`),
      ),
    ).toHaveLength(0);
    expect(
      figureCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<figure><figcaption>Just a caption</figcaption></figure>);`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("blockquote-cite (citation coverage)", () => {
  it("accepts plain-text citations and blockquotes without cite", () => {
    expect(
      blockquoteCiteCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <blockquote cite="https://example.com">Quoted text here</blockquote>;`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      blockquoteCiteCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <blockquote>Quoted text here</blockquote>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
