import { describe, expect, it, vi } from "vitest";

import { withEmulatedMedia } from "./with-emulated-media";

describe("withEmulatedMedia", () => {
  it("restores media when evaluate throws", async () => {
    const emulateMedia = vi.fn(async () => undefined);
    const page = { emulateMedia } as unknown as import("playwright").Page;

    await expect(
      withEmulatedMedia(
        page,
        { forcedColors: "active" },
        { forcedColors: "none" },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");

    expect(emulateMedia).toHaveBeenNthCalledWith(1, { forcedColors: "active" });
    expect(emulateMedia).toHaveBeenNthCalledWith(2, { forcedColors: "none" });
  });
});
