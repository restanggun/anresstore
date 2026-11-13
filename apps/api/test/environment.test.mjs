import { test } from "node:test";
import assert from "node:assert/strict";
import { readEnvironment } from "../src/config/environment.ts";

test("default development menggunakan port dan origin aplikasi lokal", () => {
  assert.deepEqual(readEnvironment({}), { port: 4000, origins: ["http://localhost:3000", "http://localhost:3001"], trustedProxies: [] });
});

test("forwarded IP headers are trusted only for explicit proxy IPs/CIDRs", () => {
  for (const proxy of ["true", "*", "0.0.0.0/0", "::/0", "10.0.0.1/99", "127.0.0.1/8/2"]) assert.throws(() => readEnvironment({TRUST_PROXY_CIDRS:proxy}));
  assert.deepEqual(readEnvironment({TRUST_PROXY_CIDRS:"127.0.0.1/32,::1/128"}).trustedProxies,["127.0.0.1/32","::1/128"]);
});
test("production refuses insecure application origins", () => {
  assert.throws(()=>readEnvironment({NODE_ENV:"production"}));
  const env={NODE_ENV:"production",CORS_ORIGINS:"https://shop.example",AUTH_WEB_ORIGIN:"https://shop.example",AUTH_API_ORIGIN:"https://api.example"};
  assert.equal(readEnvironment(env).port,4000);
  assert.throws(()=>readEnvironment({...env,AUTH_API_ORIGIN:"http://api.example"}));
});
test("menolak port invalid dan origin wildcard", () => {
  for (const port of ["0", "65536", "abc", "1.2"]) assert.throws(() => readEnvironment({ PORT: port }));
  for (const origin of ["*", "", "https://example.com/path", "file:///tmp"]) {
    assert.throws(() => readEnvironment({ CORS_ORIGINS: origin }));
  }
});
