async (page) => {
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:3100');await page.evaluate(()=>document.fonts.ready);await page.mouse.move(10,10);await page.waitForTimeout(300);
 const styles=await page.evaluate(()=>{const get=s=>getComputedStyle(document.querySelector(s));return {anres:get('.brand-anres').color,sky:get('.game-banner').backgroundColor,store:get('.brand-store').color,pink:get('.task-banner').backgroundColor,dot:get('.brand-square').backgroundColor,dotWidth:get('.brand-square').width};});
 if(styles.anres!==styles.sky||styles.store!==styles.pink||styles.dot!==styles.pink||styles.dotWidth!=='5px')throw new Error('Brand palette/square mismatch');
 const controller=page.locator('.controller-scene');const resting=await controller.evaluate(e=>getComputedStyle(e).transform);await page.waitForTimeout(750);const idle=await controller.evaluate(e=>getComputedStyle(e).transform);if(resting!==idle)throw new Error('Controller moves while idle');
 await controller.hover();await page.waitForTimeout(600);const hovered=await controller.evaluate(e=>getComputedStyle(e).transform);if(hovered===idle)throw new Error('Hover did not move controller');await page.screenshot({path:'output/playwright/brand-controller-hover.png',scale:'css'});
 await page.mouse.move(10,10);await page.waitForTimeout(650);const reset=await controller.evaluate(e=>getComputedStyle(e).transform);await page.waitForFunction(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('.controller-scene')).transform);return Math.abs(m.m42)<.02&&Math.abs(m.m12)<.002;});
 await page.screenshot({path:'output/playwright/brand-palette.png',scale:'css'});
 return {styles,idle,hovered,reset,passed:true};
}
