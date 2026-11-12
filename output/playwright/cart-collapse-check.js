async (page) => {
 const headers={'access-control-allow-origin':'http://localhost:3000','access-control-allow-credentials':'true','access-control-allow-headers':'content-type','access-control-allow-methods':'GET, POST, OPTIONS'};
 await page.route('**/auth/cart', route=>route.fulfill({status:401,headers,json:{message:'Unauthorized'}}));
 await page.addInitScript(() => localStorage.setItem('anres-cart',JSON.stringify([{id:'old',product:'Produk Lama',category:'PPOB',details:'Pilihan lama',target:'123',contact:'lama',price:1000,quantity:1},{id:'new',product:'Produk Baru',category:'PPOB',details:'Pilihan baru',target:'456',contact:'baru',price:2000,quantity:1}])));
 await page.goto('http://localhost:3000/katalog');
 await page.getByRole('button',{name:/Buka keranjang/}).click();
 const rows=page.locator('.cart-dialog .cart-row'); await rows.first().waitFor();
 if(!(await rows.first().innerText()).includes('Produk Baru')) throw Error('Urutan salah');
 if(await rows.first().getByText('Tujuan: 456').count()) throw Error('Detail seharusnya tertutup');
 await rows.first().getByRole('button',{name:'Lihat detail'}).click();
 await rows.first().getByText('Tujuan: 456').waitFor();
 await rows.first().getByRole('button',{name:'Tutup detail'}).click();
 if(await rows.first().getByText('Tujuan: 456').count()) throw Error('Detail gagal ditutup');
 await rows.first().getByRole('button',{name:'Edit',exact:true}).click();
 await rows.first().getByLabel('Tujuan / detail').waitFor();
}
