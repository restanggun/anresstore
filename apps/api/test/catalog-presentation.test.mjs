import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCatalog, catalogSection } from '../dist/catalog/catalog-mapping.js';
import { presentCatalog, catalogCampaigns } from '../dist/catalog/catalog-promotions.js';
import { tidyVariants, currentPrice } from '../../web/src/lib/catalog.ts';

const game=(overrides={})=>({code:'ML86',game:'Mobile Legends A',name:'86 Diamonds ( 78 + 8 Bonus )',price:{basic:20000},status:'available',...overrides});
const catalog=()=>({source:'vipayment',updatedAt:'2026-11-13T00:00:00Z',items:mapCatalog('game',[game()])});

test('user categories distinguish membership, currency, app duration and operator',()=>{
 assert.equal(catalogSection('game','Weekly Diamond Pass','Mobile Legends A'),'Membership');
 assert.equal(catalogSection('game','86 Diamonds','Mobile Legends B'),'Diamond');
 assert.equal(catalogSection('game','60 UC','PUBGM INDO A'),'UC');
 assert.equal(catalogSection('apps','Premium 12 Bulan','Canva Pro'),'Tahunan');
 assert.equal(catalogSection('apps','Sharing 1 Bulan','Canva Pro'),'Bulanan');
 assert.equal(catalogSection('apps','Private 1 Bulan [Garansi 1 Tahun]','Canva Pro'),'Bulanan');
 assert.equal(catalogSection('prepaid','5 GB 30 Hari','XL'),'XL');
 const item=catalog().items[0];
 assert.equal(item.displayName,'86 Diamond');assert.equal(item.section,'Diamond');assert.equal(item.code,'ML86');
});

test('sale cards and exact variants share a price and absolute expiry without mutating cache',()=>{
 const data=catalog(),during=Date.parse('2026-11-15T00:00:00+07:00');
 const feed=presentCatalog(data,during),variant=feed.items[0],card=feed.products[0];
 assert.equal(card.minPrice,variant.price);assert.deepEqual(card.promotion,variant.promotion);
 assert.ok(variant.price<data.items[0].price);assert.ok(variant.price>20000);
 assert.equal(variant.promotion.endsAt,catalogCampaigns[0].endsAt);
 assert.equal(presentCatalog(data,during+3600000).items[0].promotion.endsAt,variant.promotion.endsAt);
 assert.equal(data.items[0].price,24000);
});

test('campaign boundary restores regular price in the API and in already loaded browser data',()=>{
 const data=catalog(),end=Date.parse(catalogCampaigns[0].endsAt);
 const loaded=presentCatalog(data,end-1000).items[0];
 for(const now of [Date.parse('2026-11-12T23:59:59+07:00'),end]){
  const feed=presentCatalog(data,now);assert.equal(feed.items[0].price,data.items[0].price);assert.equal(feed.items[0].promotion,null);assert.equal(feed.products[0].minPrice,data.items[0].price);
 }
 assert.equal(currentPrice(loaded,end),data.items[0].price);
 assert.equal(currentPrice(loaded,end-1),loaded.price);
});

test('a tiny undiscounted denomination does not hide offers and promo cards identify the exact service',()=>{
 const data={source:'vipayment',updatedAt:'2026-11-13T00:00:00Z',items:mapCatalog('game',[game({code:'SMALL',price:500}),game({code:'SALE',price:20000})])};
 const feed=presentCatalog(data,Date.parse('2026-11-15T00:00:00+07:00'));
 const offer=feed.products[0],variant=feed.items.find(item=>item.code===offer.offerCode);
 assert.equal(offer.offerCode,'SALE');assert.equal(offer.minPrice,variant.price);assert.equal(offer.offerName,variant.displayName);
 assert.equal(offer.regularMinPrice,700);assert.deepEqual(offer.promotion,variant.promotion);
});

test('tidying identical alternatives preserves the cheapest SKU, separate regions and separate terms',()=>{
 const items=mapCatalog('game',[game({code:'EXPENSIVE',price:22000}),game({code:'CHEAP',game:'Mobile Legends B',price:20000}),game({code:'GLOBAL',game:'Mobile Legends (Global)',price:21000}),game({code:'TERMS',description:'Hanya akun baru',price:19000})]);
 const tidy=tidyVariants(items);
 assert.equal(tidy.length,3);assert.ok(!tidy.some(item=>item.code==='EXPENSIVE'));
 for(const code of ['CHEAP','GLOBAL','TERMS']) assert.ok(tidy.some(item=>item.code===code));
 const boilerplate='Instant Process Masukan User ID dan Server (jika dibutuhkan). Jika Pending Lebih 5 Menit Push ke Whatsapp Admin.';
 const duplicates=mapCatalog('game',[game({code:'BASIC',description:''}),game({code:'NOTE',game:'Mobile Legends B',description:boilerplate})]);
 assert.equal(tidyVariants(duplicates).length,1);
});
