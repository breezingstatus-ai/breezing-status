import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

const source=(await readFile(new URL('../supabase/functions/finalize-request/index.ts',import.meta.url),'utf8')).replace(/^import .*;\s*$/gm,'');
const {code}=await transform(source,{loader:'ts',format:'cjs'});
const env={SUPABASE_URL:'https://test.invalid',SUPABASE_PUBLISHABLE_KEYS:'{"default":"test-public"}',SUPABASE_SECRET_KEYS:'{"default":"test-secret"}',CLOUDINARY_CLOUD_NAME:'test-cloud',CLOUDINARY_API_KEY:'test-key',CLOUDINARY_API_SECRET:'test-secret'};
let handler;
let profileError=null;
let missingProfile=false;
let insertError=null;
const selections=[];
const createClient=()=>({
 auth:{getUser:async token=>({data:{user:token==='fake-test-token'?{id:'test-user'}:null},error:null})},
 from(table){
  const chain={select(fields){selections.push({table,fields});return chain;},eq(){return chain;},insert(){return chain;},
   async single(){return chain.result();},async maybeSingle(){return chain.result();},
   result(){
    if(table==='quota_reservations')return {data:{user_id:'test-user',status:'active',count:1,media_type:'image',expires_at:new Date(Date.now()+3600000).toISOString()},error:null};
    if(table==='profiles')return {data:missingProfile?null:{id:'test-user',package_id:'free',full_name:'Test'},error:profileError};
    if(table==='packages')return {data:{name:'Free',watermark_required:true},error:null};
    if(table==='upload_requests')return {data:{id:'test-request',request_code:'BRZ-test',expires_at:new Date().toISOString()},error:null};
    return {data:null,error:insertError};
   },then(resolve,reject){return Promise.resolve(chain.result()).then(resolve,reject);}};
  return chain;
 },
 rpc:async()=>({data:{success:true},error:null}),
});
const fakeFetch=async()=>Response.json({public_id:'test-user/image',secure_url:'https://example.invalid/image.jpg',bytes:100,format:'jpg'});
new Function('serve','createClient','Deno','fetch',code)(fn=>{handler=fn;},createClient,{env:{get:name=>env[name]}},fakeFetch);
const request=()=>new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer fake-test-token','Content-Type':'application/json'},body:JSON.stringify({reservationToken:'test-batch',mediaType:'image',assets:[{public_id:'test-user/image',secure_url:'https://example.invalid/image.jpg'}]})});
const success=await handler(request());
assert.equal(success.status,200);
assert.equal((await success.json()).success,true);
assert.deepEqual(selections.find(x=>x.table==='profiles'),{table:'profiles',fields:'*'},'Profile lookup must not depend on a PostgREST package relationship');
assert.ok(selections.some(x=>x.table==='packages'));
profileError={code:'PGRST200',message:'Database lookup unavailable'};
const failedLookup=await handler(request());
assert.equal(failedLookup.status,500,'Query errors must not be reported as a missing profile');
assert.match((await failedLookup.json()).error,/Profile lookup failed/);
profileError=null;missingProfile=true;
assert.equal((await handler(request())).status,404);
missingProfile=false;insertError={message:'Asset insert rejected'};
assert.equal((await handler(request())).status,500,'Do not report success if asset persistence failed');
console.log('Finalization checks passed: independent profile/package reads, successful completion, accurate lookup errors, missing profile, failed asset insertion.');
