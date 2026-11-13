async page => {
  const fixture={id:'f623c4ef-1eb2-49fb-ae0d-123456789012',provider:'manual',provider_code:'TEST-10',category:'game',product:'Game uji',product_slug:'game-uji',name:'10 credits uji',price:12000,description:'Data uji antarmuka, tidak dikirim ke database',active:true,created_at:'2026-11-13T00:00:00Z'};
  await page.route('**/v1/admin/**',async route=>{
    const url=new URL(route.request().url());
    let data={rows:[],hasMore:false,page:0};
    if(url.pathname.endsWith('/session'))data={id:fixture.id,catalogEnabled:true};
    else if(url.pathname.endsWith('/records/products'))data={rows:[fixture],hasMore:false,page:0};
    else if(url.pathname.includes('/catalog/'))data={items:[]};
    else if(url.pathname.endsWith('/products'))data={product:JSON.parse(route.request().postData()),published:true};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'http://localhost:3001','access-control-allow-credentials':'true'}});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://localhost:3001',{waitUntil:'domcontentloaded'});
  await page.getByText('Akun administrator terverifikasi.',{exact:false}).waitFor();
  return {testMode:'Browser-only fixtures. No database writes.'};
}
