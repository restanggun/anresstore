async (page) => {
 const result=[];
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:3100');await page.waitForTimeout(400);
  const before=await page.evaluate(()=>({header:document.querySelector('header').getBoundingClientRect().height,heroMargin:parseFloat(getComputedStyle(document.querySelector('.hero')).marginTop),heroY:document.querySelector('.hero').getBoundingClientRect().y+scrollY,x:document.querySelector('header .brand').getBoundingClientRect().x}));
  await page.mouse.wheel(0,500);await page.waitForTimeout(400);
  const after=await page.evaluate(()=>({height:document.querySelector('header').getBoundingClientRect().height,padding:getComputedStyle(document.querySelector('header')).paddingTop,heroY:document.querySelector('.hero').getBoundingClientRect().y+scrollY,x:document.querySelector('header .brand').getBoundingClientRect().x}));
  if(after.height!==(width===1440?70:66)||after.padding!=='0px')throw new Error('Navbar not compact');
  if(Math.abs(before.x-after.x)>.1||Math.abs(before.heroY-after.heroY)>.1)throw new Error('Page or horizontal alignment shifted');
  if(before.heroMargin!==(width===1440?8:0))throw new Error('Hero spacing mismatch');
  await page.screenshot({path:`output/playwright/scroll-spacing-${width}.png`,scale:'css'});result.push({width,before,after});
 }
 return {passed:true,result};
}
