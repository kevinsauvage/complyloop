import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: vi.fn(
    (
      callback: (scope: {
        setExtra: ReturnType<typeof vi.fn>;
        setUser: ReturnType<typeof vi.fn>;
        setTag: ReturnType<typeof vi.fn>;
      }) => void,
    ) => {
      callback({
        setExtra: vi.fn(),
        setUser: vi.fn(),
        setTag: vi.fn(),
      });
    },
  ),
  init: vi.fn(),
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));
