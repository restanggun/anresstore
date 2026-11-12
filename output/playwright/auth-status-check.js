async (page) => {
 await page.route('**/auth/resend-signup', route => route.fulfill({status:200,headers:{'access-control-allow-origin':'http://localhost:3000','access-control-allow-credentials':'true','access-control-allow-headers':'content-type','access-control-allow-methods':'POST, OPTIONS'},json:{ok:true}}));
 await page.goto('http://localhost:3000/auth/confirm-signup');
 await page.getByRole('textbox',{name:'Email'}).fill('test@example.invalid');
 await page.getByRole('button',{name:'Kirim ulang kode'}).click();
 const msg=page.getByRole('status'); await msg.waitFor();
 const bg=await msg.evaluate(el=>getComputedStyle(el).backgroundColor);
 if(bg!=='rgb(232, 247, 238)') throw Error('Warna sukses tidak sesuai: '+bg);
 if(await page.locator('#confirm-code').getAttribute('maxlength') !== '6') throw Error('Panjang kode tidak sesuai');
}
