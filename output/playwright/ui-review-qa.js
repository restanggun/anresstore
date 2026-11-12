async (page) => {
 const base='http://127.0.0.1:3100', checks=[],errors=[];
 const onError=e=>errors.push(String(e));page.on('pageerror',onError);
 const ok=(v,n)=>{if(!v)throw new Error(n);checks.push(n);};
 const pause=async()=>{await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);};
 const shot=async name=>{await pause();await page.screenshot({path:'output/playwright/review-'+name+'.png',scale:'css'});};
 const positions=()=>page.evaluate(()=>[...document.querySelectorAll('header .brand,header .desktop-nav,header .nav-account,header #menu-toggle')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
 const stable=(a,b,label)=>ok(a.length===b.length&&a.every((v,i)=>v.every((n,k)=>Math.abs(n-b[i][k])<.1)),label);
 for(const width of [1440,1024,768,390,360]){
  await page.setViewportSize({width,height:900});await page.goto(base);await pause();
  ok(await page.locator('.page-transition').evaluate(e=>+getComputedStyle(e).opacity===1),width+' content visible');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' no horizontal overflow');
  const before=await positions();
  if(width>900){const m=await page.evaluate(()=>{const n=document.querySelector('.desktop-nav').getBoundingClientRect(),p=document.querySelector('.nav-shell').getBoundingClientRect();return {center:Math.abs(n.x+n.width/2-p.x-p.width/2),heights:[...document.querySelectorAll('.desktop-nav a,.nav-account a')].map(e=>e.getBoundingClientRect().height)};});ok(m.center<.2,width+' desktop nav centered');ok(m.heights.every(h=>Math.abs(h-44)<.1),width+' equal control heights');}
  else ok(await page.getByRole('button',{name:'Buka menu'}).isVisible(),width+' mobile/tablet menu shown');
  if([1440,768,390].includes(width))await shot('home-'+width);
  await page.mouse.wheel(0,500);await page.waitForTimeout(65);stable(before,await positions(),width+' content fixed during morph');await pause();stable(before,await positions(),width+' content fixed after morph');
  ok(await page.locator('header').evaluate(e=>{const s=getComputedStyle(e,'::before');return s.left==='0px'&&s.right==='0px'&&s.borderRadius==='0px'&&s.borderTopColor==='rgba(0, 0, 0, 0)';}),width+' full frame with bottom border');
  if(width===1440||width===390)await shot('scrolled-'+width);
  await page.mouse.wheel(0,-3000);await pause();stable(before,await positions(),width+' positions restored');
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base);await pause();
 const toggle=page.getByRole('button',{name:'Buka menu'}),menu=page.getByRole('navigation',{name:'Navigasi mobile'});
 await toggle.click();await shot('mobile-menu');await page.mouse.click(5,700);await menu.waitFor({state:'hidden'});ok(true,'outside click closes mobile menu');
 await toggle.click();await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});ok(await toggle.evaluate(e=>e===document.activeElement),'Escape returns focus');
 await toggle.click();await page.setViewportSize({width:1440,height:1000});await pause();await page.setViewportSize({width:390,height:844});await pause();ok(await menu.count()===0,'resize to desktop clears menu state');
 await toggle.click();await menu.getByRole('link',{name:'Katalog',exact:true}).click();await page.waitForURL('**/katalog');await menu.waitFor({state:'hidden'});ok(true,'mobile route navigation closes menu');
 const search=page.getByRole('searchbox',{name:'Cari layanan'});await search.fill('not-here');ok(await page.getByRole('heading',{name:'Belum ketemu.'}).isVisible(),'catalog no-match');await page.getByRole('button',{name:'Lihat semua layanan'}).click();
 await page.getByRole('button',{name:'Top up game',exact:true}).click();ok((await page.getByRole('status').innerText()).startsWith('3 layanan'),'catalog filtering');await page.getByRole('button',{name:'Mobile Legends Lihat layanan'}).click();await page.getByRole('dialog').waitFor();await shot('mobile-dialog');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.setViewportSize({width:1440,height:1000});
 for(const [route,file] of [['/katalog','catalog'],['/about','about'],['/bantuan','help'],['/login','login'],['/daftar','signup']]){await page.goto(base+route);await pause();ok(await page.getByRole('main').getByRole('heading',{level:1}).isVisible(),route+' visible heading');ok(await page.locator('.page-transition').evaluate(e=>+getComputedStyle(e).opacity===1),route+' visible page');await shot(file+'-desktop');}
 await page.goto(base+'/bantuan');await page.getByRole('searchbox',{name:'Cari pertanyaan'}).fill('zzzz');ok(await page.getByRole('button',{name:'Lihat semua pertanyaan'}).isVisible(),'help no-match reset');await page.getByRole('button',{name:'Lihat semua pertanyaan'}).click();const faq=page.getByRole('button',{name:'Sudah bisa transaksi di website ini?'});await faq.click();ok(await faq.getAttribute('aria-expanded')==='true','FAQ opens');await faq.press('Enter');ok(await faq.getAttribute('aria-expanded')==='false','FAQ keyboard close');
 await page.goto(base+'/daftar');await page.getByRole('button',{name:'Daftar',exact:true}).click();ok(await page.locator('#error-name').isVisible(),'signup validation');
 await page.setViewportSize({width:390,height:844});
 for(const [route,file] of [['/about','about'],['/bantuan','help'],['/login','login'],['/daftar','signup']]){await page.goto(base+route);await shot(file+'-mobile');ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' mobile fit');}
 await page.setViewportSize({width:390,height:400});await page.goto(base);await toggle.click();await pause();ok(await menu.evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),'short viewport menu fits');await menu.getByRole('link',{name:'Daftar',exact:true}).click();await page.waitForURL('**/daftar');ok(true,'short viewport account link reachable');
 const nojs=await page.context().browser().newContext({javaScriptEnabled:false,viewport:{width:1440,height:1000}});const plain=await nojs.newPage();await plain.goto(base);await plain.waitForTimeout(350);ok(await plain.locator('.page-transition').evaluate(e=>+getComputedStyle(e).opacity===1),'content visible without JavaScript');await nojs.close();
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base);ok(await page.locator('.page-transition').evaluate(e=>getComputedStyle(e).animationName)==='none','reduced motion disables route animation');await page.emulateMedia({reducedMotion:'no-preference'});
 page.off('pageerror',onError);ok(errors.length===0,'no application runtime errors');return {passed:checks.length,checks,errors};
}
