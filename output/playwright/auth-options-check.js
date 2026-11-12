async (page) => {
 await page.route('**/auth/check-email', route => route.fulfill({status:200,headers:{'access-control-allow-origin':'http://localhost:3000','access-control-allow-credentials':'true','access-control-allow-headers':'content-type','access-control-allow-methods':'POST, OPTIONS'},json:{exists:true,confirmed:true,providers:['email','google']}}));
 await page.goto('http://localhost:3000/login');
 await page.getByRole('textbox',{name:'Email'}).fill('sample@example.invalid');
 await page.getByRole('button',{name:'Lanjutkan',exact:true}).click();
 await page.getByRole('button',{name:'Masuk dengan password'}).waitFor();
 await page.getByRole('button',{name:'Masuk dengan kode email'}).waitFor();
}
