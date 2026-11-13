import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const tabs=await (await fetch('http://localhost:9226/json')).json();
const ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map();
ws.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const callback=pending.get(data.id);pending.delete(data.id);if(data.error)callback.reject(Error(data.error.message));else callback.resolve(data.result);}};
function send(method,params={}) {return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression) {const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;}
async function waitFor(expression) {return evaluate(`new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve(true);}else if(Date.now()-start>30000){clearInterval(timer);reject(Error('UI timeout'));}},100);})`);}
async function navigate(path,condition) {await send('Page.navigate',{url:'http://localhost:3000'+path});await waitFor(condition);}
async function screenshot(name) {await evaluate(`new Promise(resolve=>setTimeout(resolve,850))`);const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL(name,import.meta.url),Buffer.from(data,'base64'));}
try {
 await send('Page.enable');await send('Runtime.enable');
 await navigate('/katalog/top-up-game',`document.querySelectorAll('.catalog-product-card').length>10`);
 console.log('game-products',await evaluate(`document.querySelectorAll('.catalog-product-card').length`));
 for(const width of [320,390,768,1024,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  const dimensions=await evaluate(`({viewport:innerWidth,scroll:document.documentElement.scrollWidth})`);
  assert.ok(dimensions.scroll<=dimensions.viewport+1,JSON.stringify(dimensions));
  console.log('layout',width,'OK');if(width===390||width===1440)await screenshot(`games-${width}.png`);
 }
 await navigate('/katalog/top-up-game/mobile-legends',`document.querySelectorAll('.order-options button').length>5`);
 const before=await evaluate(`({title:document.querySelector('h1').innerText,variants:document.querySelectorAll('.order-options button').length,disabled:document.querySelector('.order-primary').disabled})`);
 assert.ok(before.title.includes('Mobile Legends'));assert.equal(before.disabled,true);console.log('mobile-legends',JSON.stringify(before));
 await evaluate(`document.querySelector('.order-options button').click()`);
 assert.equal(await evaluate(`document.querySelectorAll('.order-options button[aria-pressed="true"]').length`),1);
 await screenshot('mobile-legends-1440.png');
 await evaluate(`const select=document.querySelector('.order-card select');select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));`);
 assert.equal(await evaluate(`document.querySelectorAll('.order-options button[aria-pressed="true"]').length`),0);
 await navigate('/katalog/ppob/paket-data',`document.querySelectorAll('.order-options button').length>5`);
 console.log('data-operators',await evaluate(`document.querySelector('.order-card select').options.length-1`));
 for(const width of [320,390,768,1024,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  const dimensions=await evaluate(`({viewport:innerWidth,scroll:document.documentElement.scrollWidth})`);
  assert.ok(dimensions.scroll<=dimensions.viewport+1,JSON.stringify(dimensions));
  if(width===390)await screenshot('data-390.png');
 }
 await navigate('/katalog/aplikasi-premium/canva',`document.querySelectorAll('.order-options button').length>0`);
 console.log('canva-variants',await evaluate(`document.querySelectorAll('.order-options button').length`));
 await navigate('/katalog/top-up-game/ace-racer',`document.querySelectorAll('.order-options button').length>0`);
 assert.ok((await evaluate(`document.querySelector('h1').innerText`)).includes('Ace Racer'));
 await navigate('/katalog?q=ace',`[...document.querySelectorAll('.catalog-product-card')].some(card=>card.innerText.includes('Ace Racer'))`);
 assert.ok(await evaluate(`[...document.querySelectorAll('.catalog-product-card')].some(card=>card.innerText.includes('Ace Racer'))`));
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await navigate('/katalog/top-up-game/free-fire',`document.querySelectorAll('.order-options button').length>5`);
 await evaluate(`const more=[...document.querySelectorAll('button')].find(button=>button.innerText.startsWith('Tampilkan lebih banyak'));if(more)more.click();`);
 await waitFor(`document.querySelectorAll('.order-options button').length>40`);
 await evaluate(`const input=document.querySelector('.order-card input[type=search]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'nonexistent-code-xyz');input.dispatchEvent(new Event('input',{bubbles:true}));`);
 await waitFor(`document.querySelectorAll('.order-options button').length===0`);
 assert.equal(await evaluate(`document.querySelector('.order-primary').disabled`),true);
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*localhost:4000/v1/catalog/*']});
 await navigate('/katalog/ppob/pulsa',`document.querySelector('.order-card [role=alert]')!==null`);
 assert.equal(await evaluate(`document.querySelector('.order-primary').disabled`),true);
 await send('Network.setBlockedURLs',{urls:[]});
 await evaluate(`document.querySelector('.order-card [role=alert] button').click()`);
 await waitFor(`document.querySelectorAll('.order-options button').length>5`);
 console.log('variant-search, pagination, unavailable catalog and retry OK');
 console.log('UI catalog checks passed');
} finally {ws.close();}
