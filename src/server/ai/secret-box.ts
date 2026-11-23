import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { aiKeysEncryptionKey } from "../env";

/** AES-256-GCM envelope fields stored on `org_ai_settings`. */
export interface SealedSecret {
  iv: string;
  tag: string;
  ciphertext: string;
}

export type SecretBoxFailure =
  "not_configured" | "invalid_key" | "authentication_failed";

export class SecretBoxError extends Error {
  readonly reason: SecretBoxFailure;

  constructor(reason: SecretBoxFailure, message: string) {
    super(message);
    this.name = "SecretBoxError";
    this.reason = reason;
  }
}

const KEY_BYTES = 32;
const IV_BYTES = 12;
/** Full 128-bit GCM tag: Node otherwise accepts a truncated tag on decrypt. */
const TAG_BYTES = 16;

function encryptionKey(): Buffer {
  const encoded = aiKeysEncryptionKey();
  if (!encoded) {
    throw new SecretBoxError(
      "not_configured",
      "AI_KEYS_ENCRYPTION_KEY is required to store organization AI keys.",
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_BYTES) {
    throw new SecretBoxError(
      "invalid_key",
      "AI_KEYS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

/** True when this deployment can seal and open secrets. */
export function isSecretBoxConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * `aad` (the org id) is authenticated, so a ciphertext copied into another
 * org's row fails to open.
 */
export function sealSecret(plaintext: string, aad: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

/**
 * Any authentication failure is a typed error. Rotating
 * AI_KEYS_ENCRYPTION_KEY makes stored keys unreadable: admins re-enter them.
 */
export function openSecret(row: SealedSecret, aad: string): string {
  const key = encryptionKey();
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(row.iv, "base64"),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(row.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SecretBoxError(
      "authentication_failed",
      "Stored AI key failed authentication (wrong key or copied ciphertext).",
    );
  }
}

/** Last four characters of a credential, for the masked display. */
export function lastFour(secret: string): string {
  return secret.slice(-4);
}
