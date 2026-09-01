import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { newWindowOnloadCheck } from "./new-window-onload";
import { dirChangeCheck } from "./dir-change";
import { blockquoteCiteCheck } from "./blockquote-cite";
import { outlineNoneCheck } from "./outline-none";
import { statusLiveCheck } from "./status-live";
import { accessibleAuthCheck } from "./accessible-auth";
import { draggingCheck } from "./dragging";
import type { AccessibilityCheck } from "../types";

function run(check: AccessibilityCheck, jsx: string) {
  return check.run(parseSource("test.tsx", jsx));
}

describe("new-window-onload", () => {
  it("flags window.open in mount useEffect", () => {
    expect(
      run(
        newWindowOnloadCheck,
        `const A = () => { useEffect(() => { window.open("/promo"); }, []); return null; };`,
      ),
    ).toHaveLength(1);
  });

  it("ignores window.open inside click handlers", () => {
    expect(
      run(
        newWindowOnloadCheck,
        `const A = () => <button onClick={() => window.open("/help")}>Help</button>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("dir-change", () => {
  it("warns when RTL text lacks dir in a mixed file", () => {
    const findings = run(
      dirChangeCheck,
      `const A = () => <p>Hello שלום world</p>;`,
    );
    expect(findings.some((f) => f.checkId === "dir-change")).toBe(true);
  });

  it("accepts RTL text inside dir=rtl", () => {
    expect(
      run(dirChangeCheck, `const A = () => <p dir="rtl">שלום</p><p>Hello</p>;`),
    ).toHaveLength(0);
  });
});

describe("blockquote-cite", () => {
  it("flags blockquote cite without citation text", () => {
    expect(
      run(
        blockquoteCiteCheck,
        `const A = () => <blockquote cite="https://example.com" />;`,
      ),
    ).toHaveLength(1);
  });

  it("accepts blockquote with cite element", () => {
    expect(
      run(
        blockquoteCiteCheck,
        `const A = () => <blockquote cite="https://example.com"><cite>Ada</cite></blockquote>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("outline-none", () => {
  it("warns when outline-none has no focus replacement", () => {
    expect(
      run(outlineNoneCheck, `const A = () => <button className="outline-none">Go</button>;`),
    ).toHaveLength(1);
  });

  it("accepts outline-none with focus-visible ring", () => {
    expect(
      run(
        outlineNoneCheck,
        `const A = () => <button className="outline-none focus-visible:ring-2">Go</button>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("status-live", () => {
  it("warns on invalid field without live error region", () => {
    expect(
      run(
        statusLiveCheck,
        `const A = () => <input aria-invalid="true" aria-label="Email" />;`,
      ),
    ).toHaveLength(1);
  });

  it("accepts invalid field with alert role sibling", () => {
    expect(
      run(
        statusLiveCheck,
        `const A = () => (
          <div>
            <input aria-invalid="true" aria-label="Email" />
            <p role="alert">Required</p>
          </div>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("accessible-auth", () => {
  it("flags password field with autocomplete off", () => {
    expect(
      run(
        accessibleAuthCheck,
        `const A = () => <input type="password" autoComplete="off" aria-label="Password" />;`,
      ),
    ).toHaveLength(1);
  });

  it("flags paste blocking on login field", () => {
    expect(
      run(
        accessibleAuthCheck,
        `const A = () => (
          <input
            type="password"
            autoComplete="current-password"
            onPaste={(e) => e.preventDefault()}
            aria-label="Password"
          />
        );`,
      ),
    ).toHaveLength(1);
  });

  it("accepts standard password autocomplete", () => {
    expect(
      run(
        accessibleAuthCheck,
        `const A = () => <input type="password" autoComplete="current-password" aria-label="Password" />;`,
      ),
    ).toHaveLength(0);
  });
});

describe("dragging", () => {
  it("warns on draggable div without keyboard handler", () => {
    expect(
      run(draggingCheck, `const A = () => <div draggable onDragStart={() => {}} />;`),
    ).toHaveLength(1);
  });

  it("accepts draggable div with keyboard handler", () => {
    expect(
      run(
        draggingCheck,
        `const A = () => <div draggable onDragStart={() => {}} onKeyDown={() => {}} />;`,
      ),
    ).toHaveLength(0);
  });
});
