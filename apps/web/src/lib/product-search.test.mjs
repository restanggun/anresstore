import { test } from "node:test";
import assert from "node:assert/strict";
import { productSearchScore, searchProducts } from "./product-search.ts";

test("finds typos, transpositions, abbreviations and reordered terms", () => {
 for (const query of ["moblie legends", "mobile legnds", "mlbb", "legends mobile"]) {
  assert.notEqual(productSearchScore(query, ["Mobile Legends"]), null, query);
 }
});

test("ranks exact names first and searches category and developer", () => {
 const items = [{name:"Mobile Legends", category:"Top up game", developer:"Moonton"}, {name:"Mobile Legends Adventure", category:"Top up game", developer:"Moonton"}];
 assert.deepEqual(searchProducts([...items].reverse(), "mobile legends", item => [item.name, item.category, item.developer]), items);
 assert.equal(searchProducts(items, "moonton", item => [item.name, item.category, item.developer]).length, 2);
 assert.equal(searchProducts(items, "pulsa", item => [item.name, item.category, item.developer]).length, 0);
});

test("does not fuzzy match numbers or unrelated short terms", () => {
 assert.equal(productSearchScore("500", ["100 diamond"]), null);
 assert.equal(productSearchScore("xy", ["Mobile Legends"]), null);
 assert.notEqual(productSearchScore("100 diamon", ["100 Diamond"]), null);
});
