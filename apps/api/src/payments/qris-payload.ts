import { HttpException } from "@nestjs/common";

type Tag={id:string;value:string};
function parse(payload:string):Tag[]{
 const tags:Tag[]=[];let i=0;
 while(i<payload.length){if(i+4>payload.length)throw new HttpException("Payload QRIS tidak valid.",400);const id=payload.slice(i,i+2),n=Number(payload.slice(i+2,i+4));i+=4;if(!/^\d{2}$/.test(id)||!Number.isInteger(n)||n<0||i+n>payload.length)throw new HttpException("Payload QRIS tidak valid.",400);tags.push({id,value:payload.slice(i,i+n)});i+=n;}
 return tags;
}
function encode(tags:Tag[]){return tags.map(t=>t.id+String(t.value.length).padStart(2,"0")+t.value).join("");}
export function qrisForAmount(source:unknown,amount:number):string{
 if(typeof source!=="string"||source.length>2000||!Number.isSafeInteger(amount)||amount<1||amount>999999999)throw new HttpException("QRIS atau nominal tidak valid.",400);
 const match=/^(.*)6304([0-9A-Fa-f]{4})$/.exec(source);if(!match)throw new HttpException("QRIS statis harus memiliki checksum EMVCo.",400);
 let crc=0xffff;for(const ch of Buffer.from(match[1]+"6304","ascii")){crc^=ch<<8;for(let b=0;b<8;b++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;}
 if(crc.toString(16).toUpperCase().padStart(4,"0")!==match[2]!.toUpperCase())throw new HttpException("Checksum QRIS tidak cocok.",400);
 const tags=parse(match[1]!);if(tags[0]?.id!=="00"||tags[0].value!=="01"||tags.find(t=>t.id==="53")?.value!=="360"||tags.find(t=>t.id==="58")?.value!=="ID")throw new HttpException("QRIS harus berupa QRIS merchant Indonesia.",400);
 if(tags.some(t=>t.id==="54"))throw new HttpException("Unggah QRIS statis tanpa nominal transaksi.",400);
 const pos=tags.find(t=>t.id==="01");if(pos&&pos.value!=="11")throw new HttpException("QR yang diunggah harus QRIS statis.",400);if(pos)pos.value="12";else tags.splice(1,0,{id:"01",value:"12"});
 const currency=tags.findIndex(t=>t.id==="53");tags.splice(currency+1,0,{id:"54",value:String(amount)});
 const body=encode(tags)+"6304";crc=0xffff;for(const ch of Buffer.from(body,"ascii")){crc^=ch<<8;for(let b=0;b<8;b++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;}
 return body+crc.toString(16).toUpperCase().padStart(4,"0");
}
