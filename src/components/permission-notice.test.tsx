import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PermissionNotice } from "./permission-notice";

describe("PermissionNotice", () => {
  it("announces view-only guidance with role=status", () => {
    render(
      <PermissionNotice>
        You have view-only access on this project.
      </PermissionNotice>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "You have view-only access on this project.",
    );
  });
});
