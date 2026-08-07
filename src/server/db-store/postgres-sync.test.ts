import { describe, expect, it, vi } from "vitest";
import { syncPayloadTable } from "./postgres-sync";

describe("syncPayloadTable", () => {
  it("deletes all rows when memory is empty", async () => {
    const deleteAll = vi.fn(async () => undefined);
    const upsert = vi.fn(async () => undefined);
    const prune = vi.fn(async () => undefined);

    await syncPayloadTable({ length: 0, deleteAll, upsert, prune });

    expect(deleteAll).toHaveBeenCalledOnce();
    expect(upsert).not.toHaveBeenCalled();
    expect(prune).not.toHaveBeenCalled();
  });

  it("upserts then prunes when memory has rows", async () => {
    const deleteAll = vi.fn(async () => undefined);
    const upsert = vi.fn(async () => undefined);
    const prune = vi.fn(async () => undefined);

    await syncPayloadTable({ length: 2, deleteAll, upsert, prune });

    expect(deleteAll).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledOnce();
    expect(prune).toHaveBeenCalledOnce();
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(
      prune.mock.invocationCallOrder[0]!,
    );
  });
});
