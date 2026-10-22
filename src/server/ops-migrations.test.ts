import { describe, expect, it } from "vitest";

import { migrationDrift } from "./ops-migrations";

describe("migrationDrift", () => {
  it("reports nothing when the database has every checkout migration", () => {
    expect(
      migrationDrift(
        ["0000_init.sql", "0006_typed_query_columns.sql"],
        ["0000_init.sql", "0006_typed_query_columns.sql"],
      ),
    ).toEqual({ pending: [], unknown: [] });
  });

  it("reports a checkout migration the database never applied", () => {
    expect(
      migrationDrift(
        ["0000_init.sql", "0006_typed_query_columns.sql"],
        ["0000_init.sql"],
      ),
    ).toEqual({ pending: ["0006_typed_query_columns.sql"], unknown: [] });
  });

  it("treats every migration as pending on a never-migrated database", () => {
    expect(migrationDrift(["0000_init.sql"], [])).toEqual({
      pending: ["0000_init.sql"],
      unknown: [],
    });
  });

  it("flags a database ahead of the checkout without failing it", () => {
    expect(
      migrationDrift(["0000_init.sql"], ["0000_init.sql", "0007_ahead.sql"]),
    ).toEqual({ pending: [], unknown: ["0007_ahead.sql"] });
  });

  it("keeps filename order (migrations apply in it)", () => {
    const { pending } = migrationDrift(
      ["0002_b.sql", "0003_c.sql", "0001_a.sql"],
      [],
    );
    expect(pending).toEqual(["0002_b.sql", "0003_c.sql", "0001_a.sql"]);
  });
});
