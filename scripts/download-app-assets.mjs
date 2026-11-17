import fs from 'node:fs/promises';
import sharp from 'sharp';
const apps=[['Zoom','zoom',546505307,'#e8f1ff'],['Claude AI','claude-ai',6473753684,'#f5ede5'],['iQIYI','iqiyi',1461999674,'#e9f8e7'],['PicsArt','picsart',587366035,'#f6e7fc'],['Vidio','vidio',1048858798,'#ffe9ed'],['Canva','canva',897446215,'#e0f7f6'],['CapCut','capcut',1500855883,'#edf0f3'],['ChatGPT','chatgpt',6448311069,'#e2f3ec'],['Alight Motion','alight-motion',1459833443,'#e3f5ee']];
const root='apps/web/public/brand/apps';await fs.mkdir(root,{recursive:true});
const sources=[];
async function download(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${r.status}: ${url}`);return Buffer.from(await r.arrayBuffer());}
async function save(name,slug,publisher,iconUrl,coverUrl,source,color){
 const [icon,cover]=await Promise.all([download(iconUrl),download(coverUrl)]);
 await sharp(icon).resize(192,192).webp({quality:88}).toFile(`${root}/${slug}-icon.webp`);
 const screenshot=await sharp(cover).resize(380,304,{fit:'contain',background:color}).toBuffer();
 const badge=await sharp(icon).resize(130,130).png().toBuffer();
 await sharp({create:{width:640,height:360,channels:3,background:color}}).composite([{input:screenshot,left:240,top:28},{input:badge,left:58,top:115}]).webp({quality:85}).toFile(`${root}/${slug}-thumbnail.webp`);
 sources.push({name,slug,publisher,source,iconUrl,coverUrl});console.log(slug);
}
for(const [name,slug,id,color] of apps){const j=await(await fetch(`https://itunes.apple.com/lookup?id=${id}&country=id`)).json();const a=j.results[0];if(!a)throw Error(slug);await save(name,slug,a.artistName,a.artworkUrl512,(a.ipadScreenshotUrls?.[0]||a.screenshotUrls[0]).replace(/\d+x\d+bb\.(jpg|png)$/,'1200x1200bb.$1'),a.trackViewUrl,color);}
await save('Loklok','loklok','Loklok','https://loklok.com/assets/ios-app-icon-CZiJvfpm.png','https://loklok.com/assets/home_sec2_1-CSJDjEWA.png','https://loklok.com/','#fff5dc');
await fs.writeFile(`${root}/sources.json`,JSON.stringify(sources,null,2)+'\n');
