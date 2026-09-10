import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const CONTRACT_DIR = path.resolve(__dirname, "..");

/**
 * `contract/` is the shared leaf: `domain` and `src/core` may import only
 * `@complyloop/analysis-core/contract/*`. If a contract file reaches outside the
 * directory it silently drags the whole engine graph (parser → typescript) into
 * those consumers. Keep contract/ self-contained.
 */
describe("contract is self-contained", () => {
  it("no production contract file imports outside the contract directory", async () => {
    const files = (await readdir(CONTRACT_DIR)).filter(
      (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
    );

    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(CONTRACT_DIR, file), "utf8");
      for (const line of source.split("\n")) {
        const match = /from\s+["'](\.\.(?:\/[^"']*)?)["']/.exec(line);
        if (match) {
          offenders.push(`${file}: ${match[1]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});