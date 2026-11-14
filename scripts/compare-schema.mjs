import {readFile,writeFile} from 'node:fs/promises';
function decode(buffer) { return buffer[0]===255&&buffer[1]===254?buffer.toString('utf16le').replace(/^\uFEFF/,''):buffer.toString('utf8').replace(/^\uFEFF/,''); }
const expected=JSON.parse(decode(await readFile('output/schema-expected.json')));
const remote=JSON.parse(decode(await readFile(process.argv[2]||'output/schema-remote-before.json'))).rows;
function canonical(v) {
 if(typeof v==='string') return v.replace(/\r/g,'').replace(/\n/g,' ').replace(/\s+/g,' ').replace(/public\./g,'').trim();
 if(Array.isArray(v)) return v.map(canonical);
 if(v && typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
 return v;
}
const norm=v=>JSON.stringify(canonical(v));
const remoteMap=new Map(remote.map(r=>[r.kind+':'+r.key,r]));
const differences=[];
for(const row of expected) {
 if(row.kind==='constraint' && row.key.endsWith('_not_null')) continue; // PG18 names NOT NULL constraints; PG17 stores them on columns.
 const actual=remoteMap.get(row.kind+':'+row.key);
 if(!actual) differences.push({kind:row.kind,key:row.key,status:'missing',expected:row.value});
 else if(norm(row.value)!==norm(actual.value)) differences.push({kind:row.kind,key:row.key,status:'different',expected:row.value,actual:actual.value});
}
await writeFile('output/schema-differences.json',JSON.stringify(differences,null,2));
console.log(JSON.stringify(differences.map(({kind,key,status})=>({kind,key,status})),null,2));
