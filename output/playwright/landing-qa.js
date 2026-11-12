async (page) => {
 const base='http://127.0.0.1:3100',checks=[],errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const ok=(v,n)=>{if(!v)throw new Error(n);checks.push(n);};
 const pause=async()=>{await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);};
 const shot=async name=>{await pause();await page.screenshot({path:'output/playwright/landing-'+name+'.png',scale:'css'});};
 for(const width of [1440,1024,768,390,360]){
  await page.setViewportSize({width,height:900});await page.goto(base);await pause();
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' no horizontal overflow');
  ok(await page.getByRole('heading',{level:1}).count()===1,width+' one main heading');
  const b=await page.getByRole('link',{name:'Jelajahi katalog',exact:true}).first().boundingBox();ok(b.y>=0&&b.y+b.height<=900,width+' primary CTA visible');
  const inside=await page.evaluate(()=>{const p=document.querySelector('.landing-primary').getBoundingClientRect();return [...document.querySelectorAll('.landing-hero-copy h1,.landing-hero-copy p,.landing-hero-actions')].every(e=>{const r=e.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom;});});ok(inside,width+' hero text/actions fit');
  await shot('hero-'+width);
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(base);await pause();
 ok(await page.locator('.landing-shortcuts a').count()===5,'five categories');ok(await page.locator('.landing-services .product').count()===4,'four representative services');
 ok(await page.evaluate(()=>[...document.querySelectorAll('main *')].every(e=>!getComputedStyle(e).backgroundImage.includes('gradient'))),'solid backgrounds');
 const links=await page.locator('.landing-page a').evaluateAll(all=>all.map(e=>({href:e.getAttribute('href'),label:e.textContent.trim()})));
 for(let i=0;i<links.length;i++){
  const link=links[i];await page.locator('.landing-page a').nth(i).click();const expected=new URL(link.href,base);await page.waitForURL(url=>url.pathname===expected.pathname&&url.search===expected.search);
  if(expected.pathname==='/katalog'){const category=expected.searchParams.get('kategori');const status=await page.getByRole('status').innerText();ok(category?status.includes(category):status.startsWith('8 layanan'),'landing link '+link.label);}
  else ok(await page.getByRole('main').getByRole('heading',{level:1}).isVisible(),'landing link '+link.label);
  await page.getByRole('link',{name:'Anres Store beranda',exact:true}).click();await page.waitForURL(base+'/');
 }
 await page.locator('.landing-services').scrollIntoViewIfNeeded();await shot('services-desktop');
 await page.locator('.landing-guide').scrollIntoViewIfNeeded();await shot('guide-desktop');
 const faq=page.getByRole('button',{name:'Apakah sudah bisa memesan di website ini?'});await faq.click();ok(await faq.getAttribute('aria-expanded')==='true','FAQ opens');await shot('faq-desktop');
 const faq2=page.getByRole('button',{name:'Perlu akun untuk melihat katalog?'});await faq2.click();ok(await faq.getAttribute('aria-expanded')==='false','FAQ switches');await faq2.press('Enter');ok(await faq2.getAttribute('aria-expanded')==='false','FAQ keyboard close');
 const faq3=page.getByRole('button',{name:'Layanan apa saja yang sedang disiapkan?'});await faq3.click();ok(await faq3.getAttribute('aria-expanded')==='true','third FAQ opens');await faq3.click();
 await page.locator('.landing-closing').scrollIntoViewIfNeeded();await shot('closing-desktop');
 await page.goto(base);await pause();await page.mouse.move(5,500);const c=page.locator('.landing-controller');const idle=await c.evaluate(e=>getComputedStyle(e).transform);await page.waitForTimeout(400);ok(await c.evaluate(e=>getComputedStyle(e).transform)===idle,'controller static at rest');await c.hover();await page.waitForTimeout(500);ok(await c.evaluate(e=>getComputedStyle(e).transform)!==idle,'controller hover');await page.mouse.move(5,500);await page.waitForFunction(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('.landing-controller')).transform);return Math.abs(m.m42)<.02&&Math.abs(m.m12)<.002;});
 await page.locator('.landing-task .document-scene').hover();await page.waitForTimeout(500);ok(await page.locator('.landing-task .document-scene').evaluate(e=>getComputedStyle(e).transform)!=='none','document hover');
 await page.setViewportSize({width:390,height:844});await page.goto(base);await pause();await page.locator('.landing-services').scrollIntoViewIfNeeded();await shot('services-mobile');await page.locator('.landing-guide').scrollIntoViewIfNeeded();await shot('guide-mobile');await page.getByRole('button',{name:'Apakah sudah bisa memesan di website ini?'}).click();await page.locator('.landing-faq').scrollIntoViewIfNeeded();await shot('faq-mobile');await page.locator('.landing-closing').scrollIntoViewIfNeeded();await shot('closing-mobile');
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base);await pause();await c.hover();await page.waitForTimeout(400);ok(await c.evaluate(e=>{const m=new DOMMatrix(getComputedStyle(e).transform);return Math.abs(m.m42)<.02;}),'reduced motion hover suppressed');await page.emulateMedia({reducedMotion:'no-preference'});
 ok(errors.length===0,'no runtime errors');return {passed:checks.length,checks,errors};
}
