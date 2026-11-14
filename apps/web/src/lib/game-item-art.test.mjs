import { test } from "node:test";
import assert from "node:assert/strict";
import { gameItemArt } from "./game-item-art.ts";

test("matches artwork to game and item rather than all memberships", () => {
 const item = (product, section, name) => ({product, section, name, displayName: name});
 assert.match(gameItemArt(item("Mobile Legends", "Membership", "Weekly Diamond Pass")), /weekly-pass/);
 assert.equal(gameItemArt(item("Mobile Legends", "Membership", "Weekly Elite Bundle")), undefined);
 assert.match(gameItemArt(item("Mobile Legends", "Diamond", "86 Diamond")), /mobile-legends\/diamond-candidate/);
 assert.match(gameItemArt(item("Free Fire", "Diamond", "100 Diamond")), /free-fire\/diamond-candidate/);
 assert.match(gameItemArt(item("Free Fire", "Membership", "Membership Bulanan")), /monthly/);
 assert.match(gameItemArt(item("PUBG Mobile", "UC", "60 UC")), /pubg-mobile\/uc/);
 assert.equal(gameItemArt(item("Free Fire", "Membership", "Level Up Pass")), undefined);
 assert.match(gameItemArt(item("Genshin Impact", "Membership", "Blessing Of The Welkin Moon")), /genshin-welkin/);
 assert.match(gameItemArt(item("Honkai Star Rail", "Membership", "Express Supply Pass")), /hsr-pass/);
 assert.match(gameItemArt(item("Zenless Zone Zero", "Paket lainnya", "60 Monochrome")), /zzz-monochrome/);
 assert.match(gameItemArt(item("Blood Strike", "Membership", "Strike Pass Elite Plus")), /blood-elite-plus/);
});
