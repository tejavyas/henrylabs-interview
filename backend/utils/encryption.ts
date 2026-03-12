import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Utility for encrypting/decrypting sensitive numbers (e.g. credit card numbers).
 * Uses AES-256-GCM. Key must be 32 bytes; set ENCRYPTION_KEY in .env to a base64-encoded 32-byte value.
 *
 * Generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export class NumberEncryption {
  private readonly key: Buffer;

  constructor(key?: Buffer) {
    const raw = key ?? Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
    if (raw.length !== KEY_LENGTH) {
      throw new Error(
        `ENCRYPTION_KEY must be a base64-encoded 32-byte value (got ${raw.length} bytes). ` +
          "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
      );
    }
    this.key = raw;
  }

  /**
   * Encrypts a string (e.g. credit card number). Returns a base64 string (IV + auth tag + ciphertext).
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  /**
   * Decrypts a value produced by encrypt(). Returns the original string.
   */
  decrypt(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, "base64");
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error("Invalid ciphertext: too short");
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}

let defaultInstance: NumberEncryption | null = null;

/**
 * Shared instance using ENCRYPTION_KEY from env. Throws if key is missing or invalid.
 */
export function getNumberEncryption(): NumberEncryption {
  if (!defaultInstance) {
    defaultInstance = new NumberEncryption();
  }
  return defaultInstance;
}
