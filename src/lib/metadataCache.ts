// Only public, bounded JSON metadata belongs here. Sessions, profiles, requests and media stay out.
const ALLOWED = new Set(['packages', 'watermark']);
const MAX_ENTRY = 16 * 1024;
const MAX_TOTAL = 64 * 1024;
const TTL = 60_000;
type Entry = { key: string; value: unknown; expires: number; bytes: number };
const memory = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
const versions = new Map<string, number>();
let database: Promise<IDBDatabase | null> | undefined;
function open() {
  return database ||= new Promise<IDBDatabase | null>(resolve => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const request = indexedDB.open('breezing-public-metadata', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('entries', {keyPath:'key'});
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database=undefined; }; resolve(request.result); };
    request.onerror = request.onblocked = () => resolve(null);
  });
}
async function diskEntries(): Promise<Entry[]> {
  const db = await open();
  if (!db) return [];
  return new Promise(resolve => {
    try { const req=db.transaction('entries').objectStore('entries').getAll(); req.onsuccess=()=>resolve(req.result); req.onerror=()=>resolve([]); } catch { resolve([]); }
  });
}
async function prune() {
  const entries = (await diskEntries()).sort((a,b)=>b.expires-a.expires);
  const db=await open(); if (!db) return;
  let bytes=0;
  try { const tx=db.transaction('entries','readwrite'); for(const e of entries) {
    if (!ALLOWED.has(e.key) || e.expires<=Date.now() || e.bytes>MAX_ENTRY || (bytes+=e.bytes)>MAX_TOTAL) tx.objectStore('entries').delete(e.key);
  }} catch { /* Private browsing/storage exhaustion: network and memory still work. */ }
  for(const [key,e] of memory) if(e.expires<=Date.now()) memory.delete(key);
}
export function invalidateMetadata(key: string) {
  versions.set(key,(versions.get(key)||0)+1); memory.delete(key); pending.delete(key);
  void open().then(db=> { try { db?.transaction('entries','readwrite').objectStore('entries').delete(key); } catch {} });
}
export async function cachedMetadata<T>(key: string, loader:()=>Promise<T>, force=false): Promise<T> {
  if (!ALLOWED.has(key)) return loader();
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const version=versions.get(key)||0;
  const task=(async()=> {
    let entry=memory.get(key);
    if (!force && !entry) entry=(await diskEntries()).find(e=>e.key===key);
    if (!force && entry && entry.expires>Date.now() && entry.bytes<=MAX_ENTRY) { memory.set(key,entry); return entry.value as T; }
    const value=await loader();
    const json=JSON.stringify(value);
    // Never persist encoded images, signed credentials or binaries, even inside a JSON field.
    if ((versions.get(key)||0)===version && json && !/data:|blob:|access_token|refresh_token|api_secret|Bearer /i.test(json)) {
      const bytes=new TextEncoder().encode(json).length;
      if(bytes<=MAX_ENTRY) {
        const item={key,value,expires:Date.now()+TTL,bytes}; memory.set(key,item);
        const db=await open(); try { db?.transaction('entries','readwrite').objectStore('entries').put(item); } catch {}
      }
    }
    void prune(); return value;
  })();
  pending.set(key,task);
  try { return await task; } finally { if(pending.get(key)===task) pending.delete(key); }
}
void prune();
