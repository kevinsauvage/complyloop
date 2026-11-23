import "server-only";

import { openAead, sealAead, type SealedBox } from "../aead";
import { aiKeysEncryptionKey } from "../env";

/** AES-256-GCM envelope fields stored on `org_ai_settings`. */
export type SealedSecret = SealedBox;

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
  return sealAead(plaintext, encryptionKey(), aad);
}

/**
 * Any authentication failure is a typed error. Rotating
 * AI_KEYS_ENCRYPTION_KEY makes stored keys unreadable: admins re-enter them.
 */
export function openSecret(row: SealedSecret, aad: string): string {
  const key = encryptionKey();
  try {
    return openAead(row, key, aad);
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
