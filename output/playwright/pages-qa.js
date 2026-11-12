async (page) => {
 const passed=[];
 const ok=(value,name)=>{if(!value)throw new Error(name);passed.push(name);};
 const base='http://127.0.0.1:3100';
 const settle=async()=>{await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(450);};
 const shot=async name=>{await settle();await page.screenshot({path:'output/playwright/pages-'+name+'.png',scale:'css'});};
 const fit=async label=>{const m=await page.evaluate(()=>({w:innerWidth,sw:document.documentElement.scrollWidth,header:document.querySelector('header').getBoundingClientRect().top}));ok(m.sw<=m.w,label+' no overflow');ok(Math.abs(m.header)<1,label+' sticky header');};
 const nav=page.getByRole('navigation',{name:'Navigasi utama'});
 await page.setViewportSize({width:1440,height:1000});await page.goto(base);await settle();
 await page.evaluate(()=>window.__anresPagesQA='persistent');
 await fit('home desktop');
 const moving=await page.locator('.controller-scene').evaluate(e=>getComputedStyle(e).transform);await page.waitForTimeout(800);const moved=await page.locator('.controller-scene').evaluate(e=>getComputedStyle(e).transform);ok(moving!==moved,'controller graphic moves smoothly');
 await page.getByRole('link',{name:'Pilih game',exact:true}).click();await page.waitForURL('**/katalog?kategori=*');
 ok((await page.getByRole('status').innerText()).startsWith('3 layanan'),'hero category deep link');
 ok(await page.evaluate(()=>window.__anresPagesQA)==='persistent','client navigation avoids full reload');
 await page.goBack();await page.waitForURL(base+'/');
 await page.getByRole('link',{name:'Lihat jasa tugas',exact:true}).click();ok((await page.getByRole('status').innerText()).startsWith('1 layanan'),'task category deep link');
 await nav.getByRole('link',{name:'Katalog',exact:true}).click();await page.waitForURL('**/katalog');
 ok((await page.getByRole('status').innerText()).startsWith('8 layanan'),'plain catalog resets category');
 await fit('catalog desktop');await shot('catalog-desktop');
 const search=page.getByRole('searchbox',{name:'Cari layanan'});
 await search.fill('roblox');ok(await page.getByRole('button',{name:'Roblox Lihat layanan'}).count()===1,'catalog search');
 await page.getByRole('button',{name:'Hapus pencarian'}).click();
 for(const [name,count] of [['Semua',8],['Top up game',3],['Aplikasi premium',1],['Pulsa & tagihan',2],['Media sosial',1],['Format tugas',1]]){await page.getByRole('button',{name,exact:true}).click();ok((await page.getByRole('status').innerText()).startsWith(count+' layanan'),'category '+name);}
 await search.fill('not-an-item');ok(await page.getByRole('heading',{name:'Belum ketemu.'}).isVisible(),'catalog empty state');await page.getByRole('button',{name:'Lihat semua layanan'}).click();
 const product=page.getByRole('button',{name:'Mobile Legends Lihat layanan'});await product.click();await page.getByRole('dialog').waitFor();await shot('catalog-dialog');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});ok(await product.evaluate(e=>document.activeElement===e),'dialog restores focus');
 await nav.getByRole('link',{name:'Tentang',exact:true}).click();await page.waitForURL('**/about');await shot('about-desktop');await fit('about desktop');ok(await nav.getByRole('link',{name:'Tentang',exact:true}).getAttribute('aria-current')==='page','nav active route');
 await nav.getByRole('link',{name:'Bantuan',exact:true}).click();await page.waitForURL('**/bantuan');await shot('help-desktop');
 const faqSearch=page.getByRole('searchbox',{name:'Cari pertanyaan'});await faqSearch.fill('zzzz');ok(await page.getByRole('button',{name:'Lihat semua pertanyaan'}).isVisible(),'help no-match');await page.getByRole('button',{name:'Lihat semua pertanyaan'}).click();
 const faq=page.getByRole('button',{name:'Sudah bisa transaksi di website ini?'});await faq.click();ok(await faq.getAttribute('aria-expanded')==='true','help accordion opens');await faq.press('Enter');ok(await faq.getAttribute('aria-expanded')==='false','help accordion keyboard closes');
 await page.getByRole('link',{name:'Login',exact:true}).click();await page.waitForURL('**/login');await shot('login-desktop');
 await page.getByRole('button',{name:'Login',exact:true}).click();ok(await page.locator('#error-email').isVisible(),'login required validation');
 await page.getByLabel('Email',{exact:true}).fill('wrong');await page.getByLabel('Password',{exact:true}).fill('demo-password');await page.getByRole('button',{name:'Login',exact:true}).click();ok(await page.locator('#error-email').isVisible(),'login email validation');
 await page.getByLabel('Email',{exact:true}).fill('qa@example.com');await page.getByRole('button',{name:'Lihat password'}).click();ok(await page.getByLabel('Password',{exact:true}).getAttribute('type')==='text','show password');await page.getByRole('button',{name:'Sembunyikan password'}).click();ok(await page.getByLabel('Password',{exact:true}).getAttribute('type')==='password','hide password');
 const posts=[];const listener=req=>{if(req.method()==='POST')posts.push(req.url());};page.on('request',listener);
 await page.getByRole('button',{name:'Login',exact:true}).click();ok((await page.getByRole('status').innerText()).includes('Login belum tersedia'),'login preview honest notice');
 await page.locator('.auth-form-heading').getByRole('link',{name:'Daftar',exact:true}).click();await page.waitForURL('**/daftar');await shot('signup-desktop');
 await page.getByRole('button',{name:'Daftar',exact:true}).click();ok(await page.locator('#error-name').isVisible(),'signup required validation');
 await page.getByLabel('Nama',{exact:true}).fill('QA User');await page.getByLabel('Email',{exact:true}).fill('qa@example.com');await page.getByLabel('Password',{exact:true}).fill('short');await page.getByLabel('Ulangi password',{exact:true}).fill('different');await page.getByRole('button',{name:'Daftar',exact:true}).click();ok(await page.locator('#error-password').isVisible(),'signup short password');ok(await page.locator('#error-confirmation').isVisible(),'signup mismatch');
 await page.getByLabel('Password',{exact:true}).fill('sample-password');await page.getByLabel('Ulangi password',{exact:true}).fill('sample-password');await page.getByRole('button',{name:'Daftar',exact:true}).click();ok((await page.getByRole('status').innerText()).includes('Belum ada akun yang dibuat'),'signup preview honest notice');ok(posts.length===0,'forms never transmit credentials in preview');page.off('request',listener);
 await page.getByRole('link',{name:'Butuh bantuan tentang akun?'}).click();await page.waitForURL('**/bantuan');
 await page.getByRole('link',{name:'Anres Store beranda',exact:true}).click();await page.waitForURL(base+'/');await shot('home-desktop');
 for(const [route,title] of [['/','Anres Store'],['/katalog','Katalog'],['/about','Tentang'],['/bantuan','Bantuan'],['/login','Login'],['/daftar','Daftar']]){const response=await page.goto(base+route);ok(response.status()===200,'direct load '+route);ok((await page.title()).includes(title),'title '+route);ok(await page.getByRole('main').getByRole('heading',{level:1}).count()===1,'one H1 '+route);}
 await page.goto(base+'/katalog?kategori=unknown');ok((await page.getByRole('status').innerText()).startsWith('8 layanan'),'unknown category fallback');
 await page.setViewportSize({width:768,height:1024});await page.goto(base);await shot('home-tablet');await fit('tablet');
 await page.setViewportSize({width:390,height:844});await page.goto(base);await shot('home-mobile');await fit('home mobile');
 for(const [label,path,file] of [['Katalog','/katalog','catalog-mobile'],['Tentang','/about','about-mobile'],['Bantuan','/bantuan','help-mobile'],['Login','/login','login-mobile'],['Daftar','/daftar','signup-mobile'],['Beranda','/','home-mobile']]){
  await page.getByRole('button',{name:'Buka menu'}).click();const menu=page.getByRole('navigation',{name:'Navigasi mobile'});await menu.getByRole('link',{name:label,exact:true}).click();await page.waitForURL(base+path);await menu.waitFor({state:'hidden'});await shot(file);await fit(file);
 }
 await page.getByRole('button',{name:'Buka menu'}).click();await shot('mobile-menu');await page.keyboard.press('Escape');await page.getByRole('navigation',{name:'Navigasi mobile'}).waitFor({state:'hidden'});ok(await page.getByRole('button',{name:'Buka menu'}).evaluate(e=>document.activeElement===e),'menu Escape focus');
 await page.setViewportSize({width:360,height:800});await page.goto(base+'/daftar');await fit('minimum signup');await shot('signup-360');
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base);await settle();const r1=await page.locator('.controller-scene').evaluate(e=>e.getBoundingClientRect().y);await page.waitForTimeout(600);const r2=await page.locator('.controller-scene').evaluate(e=>e.getBoundingClientRect().y);ok(Math.abs(r1-r2)<.2,'reduced motion graphic stays still');await page.emulateMedia({reducedMotion:'no-preference'});
 return {passed:passed.length,checks:passed};
}
