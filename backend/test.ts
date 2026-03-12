// test2.ts
console.log("1 - starting");

try {
  const sdk = await import("@henrylabs-interview/payments");
  console.log("2 - imported", Object.keys(sdk));
} catch (e) {
  console.log("2 - import failed:", e);
}

console.log("3 - done");