import { describe, expect, it } from "vitest";
import {
  isDatabaseSslInsecureEnabled,
  resolvePostgresSslOptions,
} from "./postgres-ssl";

describe("resolvePostgresSslOptions", () => {
  it("verifies certificates for sslmode=require by default", () => {
    expect(
      resolvePostgresSslOptions({
        sslmode: "require",
        hostname: "db.example.com",
        allowInsecureSsl: false,
      }),
    ).toEqual({
      rejectUnauthorized: true,
      servername: "db.example.com",
    });
  });

  it("allows an explicit insecure opt-in for require", () => {
    expect(
      resolvePostgresSslOptions({
        sslmode: "require",
        hostname: "db.example.com",
        allowInsecureSsl: true,
      }),
    ).toEqual({
      rejectUnauthorized: false,
      servername: "db.example.com",
    });
  });

  it("always verifies for verify-full even if insecure is requested", () => {
    expect(
      resolvePostgresSslOptions({
        sslmode: "verify-full",
        hostname: "db.example.com",
        allowInsecureSsl: true,
      }),
    ).toEqual({
      rejectUnauthorized: true,
      servername: "db.example.com",
    });
  });

  it("disables TLS for sslmode=disable", () => {
    expect(
      resolvePostgresSslOptions({
        sslmode: "disable",
        hostname: "localhost",
        allowInsecureSsl: false,
      }),
    ).toBeUndefined();
  });
});

describe("isDatabaseSslInsecureEnabled", () => {
  it("reads the documented env opt-in", () => {
    expect(isDatabaseSslInsecureEnabled({ DATABASE_SSL_INSECURE: "true" })).toBe(
      true,
    );
    expect(isDatabaseSslInsecureEnabled({ DATABASE_SSL_INSECURE: "0" })).toBe(
      false,
    );
  });
});
