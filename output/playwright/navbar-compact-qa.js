async (page) => {
 const results=[];
 const get=()=>page.evaluate(()=>[...document.querySelectorAll('header .brand,header .desktop-nav,header .nav-account,header #menu-toggle')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:3100');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);
  const before=await get();const header=await page.locator('header').evaluate(e=>e.getBoundingClientRect().toJSON());
  if(header.x!==0||header.y!==0||header.height!==(width===390?60:64))throw new Error('Incorrect compact header geometry');
  await page.screenshot({path:`output/playwright/navbar-compact-${width}-top.png`,scale:'css'});
  await page.mouse.wheel(0,450);await page.waitForTimeout(400);const after=await get();let drift=0;before.forEach((a,i)=>{for(const k of ['x','y','w','h'])drift=Math.max(drift,Math.abs(a[k]-after[i][k]));});if(drift>.1)throw new Error('Content moved on scroll');
  const frame=await page.locator('header').evaluate(e=>{const s=getComputedStyle(e,'::before');return {inset:s.inset,radius:s.borderRadius,top:s.borderTopColor,right:s.borderRightColor,left:s.borderLeftColor};});
  if(frame.inset!=='0px'||frame.radius!=='0px'||frame.top!=='rgba(0, 0, 0, 0)')throw new Error('Frame did not become edge-to-edge');
  await page.screenshot({path:`output/playwright/navbar-compact-${width}-scrolled.png`,scale:'css'});
  if(width===390){await page.getByRole('button',{name:'Buka menu'}).click();await page.getByRole('navigation',{name:'Navigasi mobile'}).waitFor();await page.keyboard.press('Escape');}
  await page.mouse.wheel(0,-3000);await page.waitForTimeout(400);const restored=await get();before.forEach((a,i)=>{for(const k of ['x','y'])if(Math.abs(a[k]-restored[i][k])>.1)throw new Error('Content moved after restoring');});
  results.push({width,height:header.height,maxContentDrift:drift,outerMargin:0});
 }
 return {passed:true,results};
}
