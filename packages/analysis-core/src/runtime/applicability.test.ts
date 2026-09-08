import { describe, expect, it } from "vitest";
import {
  aggregateApplicabilityObservations,
  applicabilityObservationsForPage,
  isApplicabilityObservableCheck,
} from "./applicability";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./custom-checks/playwright-page";
import {
  documentWithBody,
  LAYOUT_TABLE_DATA_BODY,
  LAYOUT_TABLE_IMPLICIT_BODY,
  LAYOUT_TABLE_PRESENTATION_BODY,
} from "./custom-checks/layout-table-fixtures";

registerPlaywrightBrowserTeardown();

describe("isApplicabilityObservableCheck", () => {
  it("includes media, captcha, and layout-table probes", () => {
    expect(isApplicabilityObservableCheck("video-caption")).toBe(true);
    expect(isApplicabilityObservableCheck("media-controls-present")).toBe(true);
    expect(isApplicabilityObservableCheck("captcha-alternative")).toBe(true);
    expect(isApplicabilityObservableCheck("layout-table-linearization")).toBe(
      true,
    );
    expect(isApplicabilityObservableCheck("hover-content")).toBe(false);
  });
});

describe("aggregateApplicabilityObservations", () => {
  it("requires every page to confirm absence", () => {
    const facts = aggregateApplicabilityObservations([
      {
        applicabilityObservations: [
          {
            checkId: "captcha-alternative",
            fact: "No CAPTCHA challenge in audited DOM.",
            url: "https://a/",
          },
        ],
      },
      {
        applicabilityObservations: [
          {
            checkId: "captcha-alternative",
            fact: "No CAPTCHA challenge in audited DOM.",
            url: "https://b/",
          },
        ],
      },
    ]);
    expect(facts.get("captcha-alternative")).toBe(
      "No CAPTCHA challenge in audited DOM.",
    );
  });

  it("does not confirm when one page still has applicable content", () => {
    const facts = aggregateApplicabilityObservations([
      {
        applicabilityObservations: [
          {
            checkId: "video-caption",
            fact: "No video, audio, or track elements in audited DOM.",
            url: "https://a/",
          },
        ],
      },
      { applicabilityObservations: [] },
    ]);
    expect(facts.has("video-caption")).toBe(false);
  });
});

describe("applicabilityObservationsForPage", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "emits temporal media facts when no video or audio exists",
    async () => {
      const { page, close } = await withPlaywrightPage(
        `<!doctype html><html lang="en"><body><h1>Static</h1></body></html>`,
      );
      try {
        const observations = await applicabilityObservationsForPage(
          page,
          "https://app.example/",
        );
        expect(
          observations.some((obs) => obs.checkId === "video-caption"),
        ).toBe(true);
        expect(
          observations.find((obs) => obs.checkId === "video-caption")?.fact,
        ).toMatch(/No video, audio, or track/);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not emit temporal media facts when video is present",
    async () => {
      const { page, close } = await withPlaywrightPage(
        `<!doctype html><html lang="en"><body><video src="x.mp4"></video></body></html>`,
      );
      try {
        const observations = await applicabilityObservationsForPage(
          page,
          "https://app.example/",
        );
        expect(
          observations.some((obs) => obs.checkId === "video-caption"),
        ).toBe(false);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "emits captcha fact when no captcha is present",
    async () => {
      const { page, close } = await withPlaywrightPage(
        `<!doctype html><html lang="en"><body><form><input name="email"></form></body></html>`,
      );
      try {
        const observations = await applicabilityObservationsForPage(
          page,
          "https://app.example/",
        );
        expect(
          observations.some((obs) => obs.checkId === "captcha-alternative"),
        ).toBe(true);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not emit captcha fact when a captcha candidate is present",
    async () => {
      const { page, close } = await withPlaywrightPage(
        `<!doctype html><html lang="en"><body><div class="g-recaptcha" data-sitekey="x"></div></body></html>`,
      );
      try {
        const observations = await applicabilityObservationsForPage(
          page,
          "https://app.example/",
        );
        expect(
          observations.some((obs) => obs.checkId === "captcha-alternative"),
        ).toBe(false);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not emit a layout-table fact for role=presentation tables",
    async () => {
      const { page, close } = await withPlaywrightPage(
        documentWithBody(LAYOUT_TABLE_PRESENTATION_BODY),
      );
      try {
        const observations = await applicabilityObservationsForPage(
          page,
          "https://app.example/",
        );
        expect(
          observations.some(
            (obs) => obs.checkId === "layout-table-linearization",
          ),
        ).toBe(false);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not emit a layout-table fact for implicit multi-cell layout tables",
    async () => {
      const { page, close } = await withPlaywrightPage(
        documentWithBody(LAYOUT_TABLE_IMPLICIT_BODY),
      );
      try {
        const observations = await applicabilityObservationsForPage(
          page,
          "https://app.example/",
        );
        expect(
          observations.some(
            (obs) => obs.checkId === "layout-table-linearization",
          ),
        ).toBe(false);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "emits a layout-table fact for data tables (not layout)",
    async () => {
      const { page, close } = await withPlaywrightPage(
        documentWithBody(LAYOUT_TABLE_DATA_BODY),
      );
      try {
        const observations = await applicabilityObservationsForPage(
          page,
          "https://app.example/",
        );
        expect(
          observations.some(
            (obs) => obs.checkId === "layout-table-linearization",
          ),
        ).toBe(true);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "emits a layout-table fact when no layout table exists",
    async () => {
      const { page, close } = await withPlaywrightPage(
        `<!doctype html><html lang="en"><body><h1>Static</h1></body></html>`,
      );
      try {
        const observations = await applicabilityObservationsForPage(
          page,
          "https://app.example/",
        );
        expect(
          observations.some(
            (obs) => obs.checkId === "layout-table-linearization",
          ),
        ).toBe(true);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
