import { createHash } from "node:crypto";

/**
 * Generates a 16-character hex confirmation ID from customerId and timestamp.
 * Matches the previous frontend implementation (SHA-256 of "customerId:timestamp", first 16 hex chars).
 */
export function generateConfirmationId(customerId: string, timestamp: number): string {
  const msg = `${customerId}:${timestamp}`;
  const hex = createHash("sha256").update(msg, "utf8").digest("hex");
  return hex.slice(0, 16);
}
