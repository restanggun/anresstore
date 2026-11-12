async (page) => {
 const checks=[];const ok=(v,n)=>{if(!v)throw new Error(n);checks.push(n);};
 const bg=e=>e.evaluate(n=>getComputedStyle(n).backgroundColor);
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:3100');await page.waitForTimeout(350);await page.mouse.move(5,500);
 const login=page.locator('.nav-account .login-link'),signup=page.locator('.nav-account .signup-link');
 ok(await bg(login)==='rgb(255, 181, 213)','Login pink');await login.hover();await page.waitForTimeout(200);ok(await bg(login)==='rgb(169, 221, 247)','Login hover sky');await page.mouse.move(5,500);await page.waitForTimeout(200);
 ok(await bg(signup)==='rgb(169, 221, 247)','Daftar sky');await signup.hover();await page.waitForTimeout(200);ok(await bg(signup)==='rgb(255, 181, 213)','Daftar hover pink');await page.mouse.move(5,500);
 ok(await page.locator('header .brand-anres').evaluate(e=>getComputedStyle(e).color)==='rgb(0, 0, 0)','black brand retained');
 const c=page.locator('.controller-scene');const idle=await c.evaluate(e=>getComputedStyle(e).transform);await page.waitForTimeout(400);ok(await c.evaluate(e=>getComputedStyle(e).transform)===idle,'controller idle static');await c.hover();await page.waitForTimeout(500);ok(await c.evaluate(e=>getComputedStyle(e).transform)!==idle,'controller hover responds');await page.mouse.move(5,500);await page.waitForFunction(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('.controller-scene')).transform);return Math.abs(m.m42)<.02&&Math.abs(m.m12)<.002;});ok(true,'controller returns to rest');
 await page.goto('http://127.0.0.1:3000');await page.waitForTimeout(500);ok(await page.locator('.page-transition').evaluate(e=>+getComputedStyle(e).opacity===1),'existing dev server content visible after refresh');
 return {passed:checks.length,checks};
}
