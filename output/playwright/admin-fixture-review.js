async page => {
  try {
    if(await page.getByLabel('Identitas provider',{exact:true}).inputValue()!=='manual')throw new Error('Wrong provider populated');
    await page.getByRole('spinbutton',{name:'Harga dasar (Rp)',exact:true}).fill('15000');
    await page.getByRole('checkbox',{name:'Tampilkan di katalog web',exact:true}).uncheck();
    const saving=page.waitForRequest(request=>request.url().endsWith('/v1/admin/products')&&request.method()==='POST');
    await page.getByRole('button',{name:'Simpan produk',exact:true}).click();
    const request=await saving;const payload=request.postDataJSON();
    if(payload.price!==15000 || payload.active!==false || payload.provider_code!=='TEST-10')throw new Error('Wrong saved product data');
    await page.getByRole('status').filter({hasText:'Produk disimpan.'}).waitFor();
    await page.getByRole('textbox',{name:'Cari pada halaman ini',exact:true}).fill('not-found');
    await page.getByText('Tidak ada hasil yang cocok pada halaman ini.',{exact:true}).waitFor();
    return {editForm:'passed',savePayload:'passed',search:'passed',databaseWrites:0};
  } finally {
    await page.unroute('**/v1/admin/**');
    await page.goto('http://localhost:3001',{waitUntil:'domcontentloaded'});
  }
}
