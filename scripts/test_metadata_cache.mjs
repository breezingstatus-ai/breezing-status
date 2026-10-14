import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const directory=await mkdtemp(`${tmpdir()}/breezing-cache-`);
const entries=new Map();
const store={getAll(){const request={};queueMicrotask(()=>{request.result=[...entries.values()];request.onsuccess?.();});return request;},put(value){entries.set(value.key,value);},delete(key){entries.delete(key);}};
const db={createObjectStore(){},transaction(){return {objectStore:()=>store};},close(){}};
globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{request.result=db;request.onupgradeneeded?.();request.onsuccess?.();});return request;}};
try {
 await build({entryPoints:['src/lib/metadataCache.ts'],outfile:`${directory}/cache.mjs`,bundle:true,format:'esm',platform:'node'});
 const {cachedMetadata,invalidateMetadata}=await import(`${directory}/cache.mjs`);
 let calls=0;
 const loader=async()=>{calls++;return [{id:'free',price:0}];};
 await Promise.all([cachedMetadata('packages',loader),cachedMetadata('packages',loader)]);assert.equal(calls,1,'Concurrent readers share one request');
 await cachedMetadata('packages',loader);assert.equal(calls,1,'Fresh metadata is reused');
 assert.equal(entries.size,1);assert.ok(entries.get('packages').bytes<16384);
 await cachedMetadata('packages',loader,true);assert.equal(calls,2,'Forced reads reach server');
 invalidateMetadata('packages');await cachedMetadata('packages',loader);assert.equal(calls,3);
 let sensitive=0;const privateLoader=async()=>{sensitive++;return {access_token:'test-secret'};};
 await cachedMetadata('profiles',privateLoader);await cachedMetadata('profiles',privateLoader);assert.equal(sensitive,2);assert.equal(entries.has('profiles'),false);
 await cachedMetadata('watermark',async()=>({logo_url:'data:image/png;base64,'+'x'.repeat(20000)}));assert.equal(entries.has('watermark'),false,'Media data must not enter metadata storage');
 await cachedMetadata('watermark',async()=>({logo_url:'https://example.invalid/logo.svg',padding_pixels:20}));assert.equal(entries.has('watermark'),true);
 const originalNow=Date.now;Date.now=()=>originalNow()+120000;
 await cachedMetadata('packages',loader);assert.equal(calls,4,'Expired metadata must refresh');
 Date.now=originalNow;
 console.log('Metadata cache checks passed: coalescing, reuse, force refresh, invalidation, expiry, byte bounds, private data/media exclusion.');
} finally {await rm(directory,{recursive:true,force:true});}
