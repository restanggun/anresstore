import { writeFile } from 'node:fs/promises';
const games = [
 ['ea-sports-fc-mobile',1094930513],['magic-chess-go-go',6612014908],['whiteout-survival',6443575749],['honkai-star-rail',1599719154],['honor-of-kings-global',1619254071],['delta-force-garena',6670604287],['call-of-duty-mobile-indonesia',1465688043],['arena-breakout',1560765304],['blood-strike',1637059453],['love-and-deepspace',6443467666],['zenless-zone-zero',1606356401],['identity-v',1347780764],['lords-mobile',1071976327],['war-robots',806077016],['age-of-empires-mobile',6476261995],
];
for (const [slug,id] of games) {
 const data=await (await fetch(`https://itunes.apple.com/lookup?id=${id}&country=id`)).json(); const app=data.results[0];
 if(!app || !app.artworkUrl512 || !app.screenshotUrls?.[0]) throw new Error(`Missing assets: ${slug}`);
 for(const [url,path] of [[app.artworkUrl512,`apps/web/public/brand/games/${slug}.jpg`],[app.screenshotUrls[0].replace(/\d+x\d+bb\.(jpg|png)$/, '1200x1200bb.$1'),`apps/web/public/brand/games/covers/${slug}.${app.screenshotUrls[0].endsWith('.png')?'png':'jpg'}`]]) {
  const response=await fetch(url); if(!response.ok) throw new Error(`Asset unavailable: ${slug}`); await writeFile(path,Buffer.from(await response.arrayBuffer()));
 }
 console.log(`${slug}: ${app.trackName} / ${app.artistName}`);
}
