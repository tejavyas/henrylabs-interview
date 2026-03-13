/**
 * Minimal Bun polyfill for Node so @henrylabs-interview/payments store.js works.
 * The package uses Bun.file() and Bun.write() with file:// URLs; we use Node fs.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

function toPath(p: string | URL): string {
  return typeof p === "string" ? p : fileURLToPath(p);
}

const Bun = {
  file(p: string | URL) {
    const filePath = toPath(p);
    return {
      async exists() {
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      },
      async text() {
        return await fs.readFile(filePath, "utf8");
      },
    };
  },
  async write(p: string | URL, data: string | Buffer) {
    const filePath = toPath(p);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data, "utf8");
  },
};

if (typeof (globalThis as unknown as { Bun?: unknown }).Bun === "undefined") {
  (globalThis as unknown as { Bun: typeof Bun }).Bun = Bun;
}
