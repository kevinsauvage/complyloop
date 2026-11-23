import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for secrets at rest. Two features seal credentials —
 * GitHub user tokens and organization AI keys — with different key sources and
 * AADs; the mechanics live here once so IV/tag handling cannot drift between
 * them.
 */
export interface SealedBox {
  iv: string;
  tag: string;
  ciphertext: string;
}

const IV_BYTES = 12;
/** Full 128-bit GCM tag: Node otherwise accepts a truncated tag on decrypt. */
const TAG_BYTES = 16;

/**
 * `aad` is authenticated, not encrypted: a box copied onto another row only
 * opens when the same AAD is supplied. Leaving it undefined sets no AAD at all,
 * which is a different ciphertext from an empty one — a caller whose stored
 * rows were sealed without AAD must keep passing nothing.
 */
export function sealAead(
  plaintext: string,
  key: Buffer,
  aad?: string,
): SealedBox {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_BYTES,
  });
  if (aad !== undefined) cipher.setAAD(Buffer.from(aad, "utf8"));
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

/** Throws on any authentication failure (wrong key, tampered or copied box). */
export function openAead(box: SealedBox, key: Buffer, aad?: string): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(box.iv, "base64"),
    { authTagLength: TAG_BYTES },
  );
  if (aad !== undefined) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(box.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
