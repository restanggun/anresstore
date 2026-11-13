async page => {
  const check = (value,message) => { if(!value) throw new Error(message); };
  const root = 'http://localhost:3000';
  const widths = [320,390,768,1024,1440];
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(root+'/katalog');
  await page.locator('.catalog-overview .service-category').last().waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.flash-products .catalog-product-card').length===3);
  check(await page.locator('.catalog-overview .service-category').count()===5,'The five original category cards must be preserved');
  check(await page.getByRole('tablist',{name:'Kategori produk',exact:true}).count()===0,'Root catalog must use original category cards');
  await page.locator('.catalog-flash').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.flash-products button')).opacity)===1);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'output/playwright/catalog-overview-1440.png',fullPage:true});
  for(const width of widths) {
    await page.setViewportSize({width,height:1000});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Root overflow at '+width);
  }
  await page.setViewportSize({width:390,height:900});
  await page.screenshot({path:'output/playwright/catalog-overview-390.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.catalog-overview a[href="/katalog/top-up-game"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.catalog-directory .catalog-product-card').length===20);
  check(await page.locator('.catalog-directory .catalog-product-card').count()===20,'Show exactly 20 curated available games');
  const flash = page.locator('.flash-products .catalog-product-card').filter({hasText:'Mobile Legends'});
  const flashPrice = await flash.locator('.catalog-product-pricing b').innerText();
  const deadline = await flash.locator('time').getAttribute('datetime');
  const normal = page.locator('.catalog-directory .catalog-product-card').filter({hasText:'Mobile Legends'});
  check(await normal.locator('.catalog-product-pricing b').innerText()===flashPrice,'Sale and normal card prices must match');
  check(await normal.locator('time').getAttribute('datetime')===deadline,'Sale and normal card deadlines must match');
  await page.screenshot({path:'output/playwright/catalog-games-1440.png',fullPage:true});
  await normal.click();
  await page.locator('.variant-card.is-selected').waitFor();
  check(page.url().includes('?pilihan='),'Offer links must point to the exact service');
  check(await page.locator('.variant-card.is-selected .variant-price b').innerText()===flashPrice,'Selected variant price must match both product cards');
  const selected=page.locator('.variant-card.is-selected');
  check(await selected.evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(255, 181, 213)','Selected card must use solid pink');
  check(await selected.locator('.variant-check svg').count()===1,'Selected card must have a checkmark');
  check(await page.locator('.variant-chosen time').getAttribute('datetime')===deadline,'Selected variant deadline must match');
  await page.getByRole('tab',{name:'Membership',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#variant-categories-panel')?.getAttribute('aria-labelledby')==='variant-categories-tab-membership');
  check(await page.locator('.variant-card.is-selected').count()===0,'Switching nominal category must clear a hidden selection');
  await page.locator('.variant-card').first().click();
  await page.getByRole('tab',{name:'Diamond',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#variant-categories-panel')?.getAttribute('aria-labelledby')==='variant-categories-tab-diamond');
  await page.locator('.variant-card').first().click();
  await page.locator('.catalog-variants').scrollIntoViewIfNeeded();
  await page.screenshot({path:'output/playwright/catalog-selection-1440.png'});
  for(const width of widths) {
    await page.setViewportSize({width,height:900});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Variant page overflow at '+width);
    if(width===390){
      await page.locator('.catalog-variants').evaluate(el=>el.scrollIntoView({block:'start'}));
      await page.screenshot({path:'output/playwright/catalog-selection-390.png'});
    }
  }
  await page.getByRole('tab',{name:'Membership',exact:true}).focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>document.querySelector('#variant-categories-tab-diamond')?.getAttribute('aria-selected')==='true');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(root+'/katalog/ppob/paket-data');
  await page.getByRole('tab',{name:'XL',exact:true}).waitFor();
  await page.getByRole('tab',{name:'XL',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#variant-categories-panel')?.getAttribute('aria-labelledby')==='variant-categories-tab-xl');
  await page.locator('.variant-card').first().click();
  for(const width of widths){
    await page.setViewportSize({width,height:900});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'PPOB page overflow at '+width);
  }
  await page.goto(root+'/katalog/aplikasi-premium/canva');
  await page.getByRole('tab',{name:'Tahunan',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Tahunan',exact:true}).click();
  await page.locator('.variant-card').first().click();
  for(const path of ['/katalog/format-tugas/artikel','/katalog/sosial-media/instagram']){
    await page.goto(root+path);await page.locator('.order-card').waitFor();
    check(!await page.getByText('This page could not be found.').count(),'Existing individual service flow must remain available');
  }
  for(const path of ['/','/about','/bantuan','/invoice']){
    await page.goto(root+path);await page.locator('main').waitFor();
    check(!/simulasi|pratinjau/i.test(await page.locator('main').innerText()),'Outdated catalog copy at '+path);
  }
  console.log(JSON.stringify({originalCategoryCards:5,curatedGames:20,flashPrice,deadline,solidPink:true,checkmark:true,nominalTabs:true,keyboard:true,matchingOfferSku:true,widths,existingFlows:true,outdatedCopyRemoved:true}));
}
