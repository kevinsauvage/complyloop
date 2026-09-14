import { describe, expect, it } from "vitest";

import { hoverContentViolation } from "./hover-content";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withProbePage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("hoverContentViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "does not flag aria-describedby static hints as hover-only content",
    async () => {
      await withProbePage(`
        <!doctype html><html lang="fr"><body>
          <label for="email">Email</label>
          <input id="email" aria-describedby="hint" />
          <p id="hint">Use your work address.</p>
        </body></html>
      `,
        async (page) => {
        const violation = await hoverContentViolation(page);
        expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags hover-only supplementary content",
    async () => {
      await withProbePage(`
        <!doctype html><html lang="fr"><head><style>
          .tip { position: relative; display: inline-block; }
          .tip .panel {
            display: none;
            position: absolute;
            background: #fff;
            border: 1px solid #000;
            padding: 8px;
          }
          .tip:hover .panel { display: block; }
        </style></head><body>
          <span class="tip" title="More info">
            Help
            <span class="panel">Extended help text only on hover.</span>
          </span>
        </body></html>
      `,
        async (page) => {
        const violation = await hoverContentViolation(page);
        expect(violation?.id).toBe("hover-content");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when no trigger reveals extra content",
    async () => {
      await withProbePage(`
        <!doctype html><html lang="fr"><body>
          <button type="button">Help</button>
        </body></html>
      `,
        async (page) => {
        const violation = await hoverContentViolation(page);
        expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when a title tooltip does not inject extra body text",
    async () => {
      await withProbePage(`
        <!doctype html><html lang="fr"><body>
          <button type="button" title="Short native tooltip">Go</button>
        </body></html>
      `,
        async (page) => {
        const violation = await hoverContentViolation(page);
        expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "skips hidden triggers",
    async () => {
      await withProbePage(`
        <!doctype html><html lang="fr"><body>
          <button type="button" style="visibility:hidden" title="Hidden trigger">
            Hidden
          </button>
        </body></html>
      `,
        async (page) => {
        const violation = await hoverContentViolation(page);
        expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
