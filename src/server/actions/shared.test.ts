import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/server/auth-session", () => ({ getSession: vi.fn() }));

import { refresh } from "./shared";

describe("refresh", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
  });

  it("revalidates the whole app layout when given no paths", () => {
    refresh();
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("revalidates only the given routes, de-duplicated", () => {
    refresh("/findings", "/dashboard", "/findings");
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/findings");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });
});
