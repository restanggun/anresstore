import { test } from "node:test";
import assert from "node:assert/strict";
import { readEnvironment } from "../src/config/environment.ts";

test("default development menggunakan port dan origin aplikasi lokal", () => {
  assert.deepEqual(readEnvironment({}), { port: 4000, origins: ["http://localhost:3000", "http://localhost:3001"] });
});
test("menolak port invalid dan origin wildcard", () => {
  for (const port of ["0", "65536", "abc", "1.2"]) assert.throws(() => readEnvironment({ PORT: port }));
  for (const origin of ["*", "", "https://example.com/path", "file:///tmp"]) {
    assert.throws(() => readEnvironment({ CORS_ORIGINS: origin }));
  }
});
