async page => {
  await page.locator('.ops-notice[role=alert]').waitFor();
  if (!(await page.locator('.ops-notice[role=alert]').innerText()).includes('ADMIN_USER_IDS')) throw new Error('Missing configuration guidance');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'output/playwright/admin-connected-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Katalog & harga',exact:true}).click();
  if (!(await page.getByRole('button',{name:'Tambah produk',exact:true}).isDisabled())) throw new Error('Anonymous product write enabled');
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile overflow');
  await page.screenshot({path:'output/playwright/admin-connected-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Buka menu',exact:true}).click();
  await page.getByRole('button',{name:'Pesanan & invoice',exact:true}).click();
  await page.getByRole('heading',{name:'Pesanan & invoice',exact:true}).waitFor();
  await page.goto('http://localhost:3000/katalog');
  await page.getByRole('main').waitFor();
  await page.screenshot({path:'output/playwright/admin-storefront-review.png',fullPage:true});
  return {anonymousAccess:'blocked with setup guidance',productWrite:'disabled',mobileNavigation:'passed',mobileOverflow:false,storefront:page.url()};
}

