async (page) => {
  const settle = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700); };
  const shot = async (name) => { await settle(); await page.screenshot({path:'output/playwright/' + name + '.png',scale:'css'}); };
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:3100');
  await shot('redesign-desktop');
  const metrics = await page.evaluate(() => {
    const rgb = hex => hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    const l = hex => {const c=rgb(hex);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
    const contrast = (a,b) => {const x=l(a),y=l(b);return +((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2);};
    const pairs = [['ink / white','#17191c','#ffffff'],['ink / sky','#17191c','#a9ddf7'],['ink / pink','#17191c','#ffb5d5'],['muted / white','#5b626b','#ffffff'],['muted / light gray','#5b626b','#f5f8fa'],['notice / pink soft','#7b3455','#fff0f6'],['white / dark action','#ffffff','#17191c']];
    return {contrast:pairs.map(([name,a,b]) => ({name,ratio:contrast(a,b)})),font:getComputedStyle(document.body).fontFamily,gradientCount:[...document.querySelectorAll('body *')].filter(e=>getComputedStyle(e).backgroundImage.includes('gradient')).length};
  });
  if (metrics.contrast.some(p => p.ratio < 4.5)) throw new Error('Contrast failure');
  if (metrics.gradientCount !== 0) throw new Error('Unexpected gradients');
  await page.getByRole('link',{name:'Katalog',exact:true}).click(); await shot('redesign-catalog');
  await page.getByRole('button',{name:'Mobile Legends Lihat layanan'}).click(); await shot('redesign-dialog');
  const dialogOpacity = await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).opacity);
  if (+dialogOpacity !== 1) throw new Error('Dialog did not settle');
  await page.keyboard.press('Escape'); await settle();
  await page.getByRole('link',{name:'Cara order',exact:true}).click(); await shot('redesign-order');
  await page.getByRole('link',{name:'Bantuan',exact:true}).click();
  await page.getByRole('button',{name:'Sudah bisa transaksi di website ini?'}).click(); await shot('redesign-faq');
  await page.setViewportSize({width:768,height:1024}); await page.goto('http://127.0.0.1:3100'); await shot('redesign-tablet');
  await page.setViewportSize({width:390,height:844}); await page.goto('http://127.0.0.1:3100'); await shot('redesign-mobile');
  await page.getByRole('button',{name:'Buka menu'}).click(); await shot('redesign-mobile-menu');
  await page.getByRole('navigation',{name:'Navigasi mobile'}).getByRole('link',{name:'Katalog'}).click(); await shot('redesign-mobile-catalog');
  await page.getByRole('button',{name:'Mobile Legends Lihat layanan'}).click(); await shot('redesign-mobile-dialog');
  await page.keyboard.press('Escape'); await settle();
  await page.getByRole('button',{name:'Buka menu'}).click();
  await page.getByRole('navigation',{name:'Navigasi mobile'}).getByRole('link',{name:'Bantuan'}).click();
  await page.getByRole('button',{name:'Sudah bisa transaksi di website ini?'}).click(); await shot('redesign-mobile-faq');
  await page.setViewportSize({width:360,height:800}); await page.goto('http://127.0.0.1:3100'); await shot('redesign-mobile-360');
  const bounds = await page.evaluate(() => {const a=document.querySelector('.hero-copy [data-slot="button"]').getBoundingClientRect(); const b=document.querySelector('.controller').getBoundingClientRect(); return {horizontalOverflow:document.documentElement.scrollWidth>innerWidth,button:{x:a.x,y:a.y,right:a.right,bottom:a.bottom},controller:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},header:document.querySelector('header').getBoundingClientRect().top};});
  await page.getByRole('link',{name:'Pilih game',exact:true}).click(); await settle();
  await page.getByRole('button',{name:'Top up game',exact:true}).focus(); await page.keyboard.press('Tab'); await shot('redesign-keyboard-focus');
  return {metrics,bounds,dialogOpacity};
}
