import { test } from "node:test";
import assert from "node:assert/strict";
import { domainRedirect } from "./domain-routing.ts";
import {domains,loginDestination} from "./domains.ts";
const origins = {web:"https://anresstore.site",auth:"https://auth.anresstore.site",app:"https://app.anresstore.site"};
test("canonical surfaces and query parameters", () => {
  assert.equal(domainRedirect("anresstore.site", "/login", "?auth_error=callback", origins), "https://auth.anresstore.site/login?auth_error=callback");
  assert.equal(domainRedirect("anresstore.site", "/katalog/game", "?q=a", origins), "https://app.anresstore.site/katalog/game?q=a");
  assert.equal(domainRedirect("auth.anresstore.site", "/", "", origins), "https://auth.anresstore.site/login");
  assert.equal(domainRedirect("app.anresstore.site", "/", "", origins), null);
  assert.equal(domainRedirect("app.anresstore.site", "/about", "", origins), "https://anresstore.site/about");
  assert.equal(domainRedirect("auth.anresstore.site", "/auth/reset-password", "", origins), null);
  assert.equal(domainRedirect("anresstore.site", "/dashboard", "", origins), "https://app.anresstore.site/dashboard");
  assert.equal(domainRedirect("app.anresstore.site", "/dashboard", "", origins), null);
});

test("customer login always opens the dashboard, including single-origin development",()=>{
 assert.equal(loginDestination(),`${domains.app.replace(/\/$/,"")}/dashboard`);
 const oldWindow=globalThis.window,oldAdmin=process.env.NEXT_PUBLIC_ADMIN_URL;
 try {
  process.env.NEXT_PUBLIC_ADMIN_URL="https://admin.example";
  globalThis.window={location:{search:"?app=admin"}};
  assert.equal(loginDestination(),"https://admin.example");
  globalThis.window.location.search="?next=https://evil.example";
  assert.equal(loginDestination(),`${domains.app.replace(/\/$/,"")}/dashboard`);
 } finally {
  if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
  if(oldAdmin===undefined)delete process.env.NEXT_PUBLIC_ADMIN_URL;else process.env.NEXT_PUBLIC_ADMIN_URL=oldAdmin;
 }
});
test("unknown hosts cannot control redirect targets", () => {
  assert.equal(domainRedirect("evil.example", "/login", "", origins), "invalid-host");
  assert.equal(domainRedirect("anresstore.site.evil.example", "/", "", origins), "invalid-host");
});
test("legacy localhost and local subdomains", () => {
  const local = {web:"http://anres.localhost:3000",auth:"http://auth.anres.localhost:3000",app:"http://app.anres.localhost:3000"};
  assert.equal(domainRedirect("anres.localhost:3000", "/keranjang", "", local), "http://app.anres.localhost:3000/keranjang");
  assert.equal(domainRedirect("localhost:3000", "/login", "", {web:"http://localhost:3000",auth:"http://localhost:3000",app:"http://localhost:3000"}), null);
});
