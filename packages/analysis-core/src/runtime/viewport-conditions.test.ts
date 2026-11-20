import type { Page } from "playwright-core";
import { describe, expect, it, vi } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withPlaywrightPage,
} from "./custom-checks/playwright-page";
import { registerPlaywrightBrowserTeardown } from "./custom-checks/playwright-test-teardown";
import {
  COARSE_POINTER_LABEL,
  emulateCoarsePointer,
  MOBILE_TARGET_SIZE_LABEL,
  MOBILE_VIEWPORT,
  TARGET_SIZE_AXE_RULE,
  TARGET_SIZE_ENHANCED_MIN_PX,
} from "./viewport-conditions";

registerPlaywrightBrowserTeardown();

describe("viewport target-size conditions", () => {
  it("keeps the 24×24 AA rule and a separate 44×44 AAA size", () => {
    expect(TARGET_SIZE_AXE_RULE).toBe("target-size");
    expect(TARGET_SIZE_ENHANCED_MIN_PX).toBe(44);
    expect(MOBILE_VIEWPORT).toEqual({ width: 320, height: 568 });
    expect(MOBILE_TARGET_SIZE_LABEL).toBe("320×568");
    expect(COARSE_POINTER_LABEL).toBe("pointer: coarse");
  });

  it.skipIf(!chromiumExecutableAvailable())(
    "emulates pointer: coarse without replacing the default fine pointer after reset",
    async () => {
      const { page, close } = await withPlaywrightPage(
        `<!doctype html><html lang="en"><body><p id="probe">probe</p></body></html>`,
      );
      try {
        const before = await page.evaluate(
          () => matchMedia("(pointer: coarse)").matches,
        );
        const during = await emulateCoarsePointer(page, () =>
          page.evaluate(() => matchMedia("(pointer: coarse)").matches),
        );
        const after = await page.evaluate(
          () => matchMedia("(pointer: coarse)").matches,
        );
        expect(before).toBe(false);
        expect(during).toBe(true);
        expect(after).toBe(false);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});

describe("emulateCoarsePointer", () => {
  function cdpPage(viewport: { width: number; height: number } | null) {
    const session = {
      send: vi.fn<(method: string, params?: unknown) => Promise<void>>(
        async () => {},
      ),
      detach: vi.fn(async () => {}),
    };
    const page = {
      viewportSize: () => viewport,
      context: () => ({ newCDPSession: async () => session }),
    } as unknown as Page;
    return { page, session };
  }

  it("emulates a touch device and restores the default pointer", async () => {
    const { page, session } = cdpPage({ width: 390, height: 844 });

    const result = await emulateCoarsePointer(page, async () => "done");

    expect(result).toBe("done");
    expect(session.send.mock.calls).toEqual([
      [
        "Emulation.setDeviceMetricsOverride",
        {
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          mobile: true,
        },
      ],
      [
        "Emulation.setTouchEmulationEnabled",
        { enabled: true, maxTouchPoints: 5 },
      ],
      ["Emulation.setTouchEmulationEnabled", { enabled: false }],
      ["Emulation.clearDeviceMetricsOverride"],
    ]);
    expect(session.detach).toHaveBeenCalledOnce();
  });

  it("falls back to a desktop viewport when the page reports none", async () => {
    const { page, session } = cdpPage(null);

    await emulateCoarsePointer(page, async () => {});

    expect(session.send).toHaveBeenNthCalledWith(
      1,
      "Emulation.setDeviceMetricsOverride",
      expect.objectContaining({ width: 1280, height: 720 }),
    );
  });

  it("restores the pointer when the probe throws", async () => {
    const { page, session } = cdpPage({ width: 320, height: 568 });

    await expect(
      emulateCoarsePointer(page, async () => {
        throw new Error("probe failed");
      }),
    ).rejects.toThrow("probe failed");

    expect(session.send).toHaveBeenLastCalledWith(
      "Emulation.clearDeviceMetricsOverride",
    );
    expect(session.detach).toHaveBeenCalledOnce();
  });
});
