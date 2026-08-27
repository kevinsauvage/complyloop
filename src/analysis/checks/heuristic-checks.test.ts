import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { pointerGestureCheck } from "./pointer-gesture";
import { pointerCancellationCheck } from "./pointer-cancellation";
import { motionActuationCheck } from "./motion-actuation";
import { focusContextChangeCheck } from "./focus-context-change";
import { inputContextChangeCheck } from "./input-context-change";
import { sensoryCharacteristicsCheck } from "./sensory-characteristics";
import { imageOfTextCheck } from "./image-of-text";
import { errorSuggestionCheck } from "./error-suggestion";
import type { AccessibilityCheck } from "../types";

function run(check: AccessibilityCheck, jsx: string) {
  return check.run(parseSource("test.tsx", jsx));
}

function onlyWarnings(findings: ReturnType<typeof run>) {
  return findings.every((finding) => finding.kind === "warning" && finding.confidence === "low");
}

describe("pointer-gesture", () => {
  it("flags a custom element with a pointer handler and no keyboard handler", () => {
    const findings = run(
      pointerGestureCheck,
      `const A = () => <div onPointerDown={() => drag()}>x</div>;`,
    );
    expect(findings).toHaveLength(1);
    expect(onlyWarnings(findings)).toBe(true);
  });

  it("ignores native interactive elements", () => {
    expect(
      run(pointerGestureCheck, `const A = () => <button onPointerDown={drag}>x</button>;`),
    ).toHaveLength(0);
  });

  it("ignores a pointer handler that also has onKeyDown", () => {
    expect(
      run(
        pointerGestureCheck,
        `const A = () => <div onPointerDown={drag} onKeyDown={onKey}>x</div>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("pointer-cancellation", () => {
  it("flags a pointerdown without a cancel/up counterpart", () => {
    expect(
      run(pointerCancellationCheck, `const A = () => <div onPointerDown={start}>x</div>;`),
    ).toHaveLength(1);
  });

  it("ignores a pointerdown with onPointerCancel", () => {
    expect(
      run(
        pointerCancellationCheck,
        `const A = () => <div onPointerDown={start} onPointerCancel={abort}>x</div>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("motion-actuation", () => {
  it("flags a deviceorientation listener", () => {
    const findings = run(
      motionActuationCheck,
      `useEffect(() => window.addEventListener("deviceorientation", onTilt), []);`,
    );
    expect(findings).toHaveLength(1);
    expect(onlyWarnings(findings)).toBe(true);
  });

  it("ignores unrelated listeners", () => {
    expect(
      run(motionActuationCheck, `el.addEventListener("click", onClick);`),
    ).toHaveLength(0);
  });
});

describe("focus-context-change", () => {
  it("flags onFocus that navigates", () => {
    expect(
      run(
        focusContextChangeCheck,
        `const A = () => <div onFocus={() => router.push("/x")}>x</div>;`,
      ),
    ).toHaveLength(1);
  });

  it("ignores onFocus without a context change", () => {
    expect(
      run(focusContextChangeCheck, `const A = () => <div onFocus={() => setOpen(true)}>x</div>;`),
    ).toHaveLength(0);
  });
});

describe("input-context-change", () => {
  it("flags onChange that submits", () => {
    expect(
      run(
        inputContextChangeCheck,
        `const A = () => <input onChange={() => form.submit()} />;`,
      ),
    ).toHaveLength(1);
  });

  it("ignores a benign onChange", () => {
    expect(
      run(inputContextChangeCheck, `const A = () => <input onChange={(e) => setValue(e.target.value)} />;`),
    ).toHaveLength(0);
  });
});

describe("sensory-characteristics", () => {
  it("flags an instruction that relies on color", () => {
    expect(
      run(sensoryCharacteristicsCheck, `const A = () => <p>Click the red button to continue</p>;`),
    ).toHaveLength(1);
  });

  it("ignores a plain instruction", () => {
    expect(
      run(sensoryCharacteristicsCheck, `const A = () => <p>Click the button to continue</p>;`),
    ).toHaveLength(0);
  });
});

describe("image-of-text", () => {
  it("flags a background-image that may render text", () => {
    expect(
      run(imageOfTextCheck, `const A = () => <div style={{ backgroundImage: "url(a.png)" }} />;`),
    ).toHaveLength(1);
  });

  it("flags role=img containing text", () => {
    expect(run(imageOfTextCheck, `const A = () => <span role="img">Sale</span>;`)).toHaveLength(1);
  });

  it("ignores real text", () => {
    expect(run(imageOfTextCheck, `const A = () => <p>Sale</p>;`)).toHaveLength(0);
  });
});

describe("error-suggestion", () => {
  it("flags an error alert without a suggestion", () => {
    expect(
      run(errorSuggestionCheck, `const A = () => <div role="alert">Invalid email</div>;`),
    ).toHaveLength(1);
  });

  it("ignores an error alert that suggests a correction", () => {
    expect(
      run(
        errorSuggestionCheck,
        `const A = () => <div role="alert">Invalid email, try name@example.com</div>;`,
      ),
    ).toHaveLength(0);
  });

  it("ignores non-alert text", () => {
    expect(run(errorSuggestionCheck, `const A = () => <div>Invalid email</div>;`)).toHaveLength(0);
  });
});
