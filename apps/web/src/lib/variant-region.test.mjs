import { test } from "node:test";
import assert from "node:assert/strict";
import { variantRegion } from "./catalog.ts";

test("uses explicit region information without guessing unspecified regions", () => {
 const item = (group, displayName) => ({group, displayName, name: displayName});
 assert.equal(variantRegion(item("PUBG Mobile (ID)", "60 UC")), "Indonesia");
 assert.equal(variantRegion(item("Free Fire Global", "100 Diamond")), "Global");
 assert.equal(variantRegion(item("Genshin Impact", "60 Genesis Crystals (USA)")), "Amerika Serikat");
 assert.equal(variantRegion(item("Mobile Legends A", "86 Diamond")), "Tidak disebutkan");
});
