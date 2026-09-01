import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { draggingCheck } from "./dragging";

describe("dragging", () => {
  it("warns on draggable div without keyboard handler", () => {
    expect(
      draggingCheck.run(
        parseSource("test.tsx", `const A = () => <div draggable onDragStart={() => {}} />;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts draggable div with keyboard handler", () => {
    expect(
      draggingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div draggable onDragStart={() => {}} onKeyDown={() => {}} />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
