async (page) => {
 const pass=[];const ok=(v,n)=>{if(!v)throw new Error(n);pass.push(n);};
 const blue='rgb(169, 221, 247)',pink='rgb(255, 181, 213)';
 const pause=()=>page.waitForTimeout(380);
 const bg=e=>e.evaluate(n=>getComputedStyle(n).backgroundColor);
 const shot=async n=>{await pause();await page.screenshot({path:'output/playwright/navbar-'+n+'.png',scale:'css'});};
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:3100');await page.evaluate(()=>document.fonts.ready);await pause();await page.mouse.move(10,500);
 const login=page.locator('.nav-account .login-link'),signup=page.locator('.nav-account .signup-link');
 ok(await bg(login)===pink,'Login defaults pink');ok(await bg(signup)===blue,'Daftar defaults sky');
 const colors=await page.evaluate(()=>({anres:getComputedStyle(document.querySelector('.brand-anres')).color,game:getComputedStyle(document.querySelector('.game-banner')).backgroundColor,store:getComputedStyle(document.querySelector('.brand-store')).color,task:getComputedStyle(document.querySelector('.task-banner')).backgroundColor}));ok(colors.anres===colors.game&&colors.store===colors.task,'brand exactly matches hero colors');
 await signup.hover();await pause();ok(await bg(signup)===pink,'Daftar hover pink');await shot('hover-desktop');
 const bounds=await signup.boundingBox();await page.mouse.down();await pause();ok(await bg(signup)===blue,'pressed Daftar sky');await page.mouse.move(10,500);await page.mouse.up();await pause();ok(new URL(page.url()).pathname==='/','cancelled press does not navigate');
 const nav=page.getByRole('navigation',{name:'Navigasi utama'});const catalog=nav.getByRole('link',{name:'Katalog',exact:true});await catalog.hover();await pause();ok(await bg(catalog)===pink,'nav hover pink');const home=nav.getByRole('link',{name:'Beranda'});await home.hover();await pause();ok(await bg(home)===blue,'current page stays sky while hovered');await page.mouse.move(10,500);await shot('top-desktop');
 const heroY=await page.locator('.hero').evaluate(e=>e.getBoundingClientRect().top+scrollY);
 await page.mouse.wheel(0,650);await page.waitForTimeout(70);await page.screenshot({path:'output/playwright/navbar-transition.png',scale:'css'});await pause();
 const scrolled=await page.locator('.nav-shell').evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,w:r.width,client:document.documentElement.clientWidth,radius:s.borderRadius,top:s.borderTopWidth,right:s.borderRightWidth,left:s.borderLeftWidth,bottom:s.borderBottomWidth};});
 ok(Math.abs(scrolled.x)<1&&Math.abs(scrolled.w-scrolled.client)<1,'scrolled navbar full width');ok(scrolled.radius==='0px','scrolled navbar square corners');ok(scrolled.top==='0px'&&scrolled.right==='0px'&&scrolled.left==='0px'&&scrolled.bottom==='1px','only bottom border');
 ok(Math.abs((await page.locator('.hero').evaluate(e=>e.getBoundingClientRect().top+scrollY))-heroY)<.5,'hero document position unchanged');await shot('scrolled-desktop');
 await page.mouse.wheel(0,-3000);await pause();ok((await page.locator('.nav-shell').evaluate(e=>e.getBoundingClientRect().x))>0,'top navbar restores margins');ok(await page.locator('.nav-shell').evaluate(e=>getComputedStyle(e).borderRadius)!=='0px','top navbar restores rounded corners');
 await login.click();await page.waitForURL('**/login');await page.mouse.move(10,500);await pause();ok(await bg(login)===blue,'current Login route sky');ok(await bg(page.locator('.auth-submit'))===pink,'login form button pink');
 await signup.click();await page.waitForURL('**/daftar');await page.mouse.move(10,500);await pause();ok(await bg(page.locator('.auth-submit'))===blue,'register form button sky');await page.locator('.auth-submit').hover();await pause();ok(await bg(page.locator('.auth-submit'))===pink,'register form hover pink');
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:3100');await pause();await page.mouse.wheel(0,520);await pause();
 ok(await page.locator('.nav-shell').evaluate(e=>Math.abs(e.getBoundingClientRect().x)<1),'mobile full width on scroll');ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile no horizontal overflow');await shot('scrolled-mobile');
 await page.getByRole('button',{name:'Buka menu'}).click();await pause();const menu=page.getByRole('navigation',{name:'Navigasi mobile'});ok(await menu.isVisible(),'mobile menu usable while scrolled');ok(await bg(menu.getByRole('link',{name:'Login',exact:true}))===pink,'mobile Login pink');ok(await bg(menu.getByRole('link',{name:'Daftar',exact:true}))===blue,'mobile Daftar blue');await shot('mobile-menu');
 await page.mouse.move(10,750);await page.mouse.wheel(0,100);await pause();ok(await menu.isVisible(),'scrolling with menu open remains stable');await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
 await page.mouse.wheel(0,-3000);await pause();ok((await page.locator('.nav-shell').evaluate(e=>e.getBoundingClientRect().x))>0,'mobile restores rounded navbar');
 await page.emulateMedia({reducedMotion:'reduce'});await page.mouse.wheel(0,500);await pause();ok(await page.locator('.site-header').evaluate(e=>getComputedStyle(e).transitionDuration)==='0s','reduced motion disables morph transition');await page.emulateMedia({reducedMotion:'no-preference'});
 return {passed:pass.length,checks:pass,colors,scrolled};
}
