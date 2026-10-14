import {serve} from "https://deno.land/std@0.177.0/http/server.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.117.3";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 try {
  const token=req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return reply({error:'Sign in required'},401);
  const url=Deno.env.get('SUPABASE_URL')!;
  const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');
  const caller=createClient(url,keys.default||Object.values(keys)[0]||Deno.env.get('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await caller.auth.getUser(token);
  if(authError||!user)return reply({error:'Invalid session'},401);
  const {data:isAdmin,error:adminError}=await caller.rpc('is_admin');
  if(adminError||!isAdmin)return reply({error:'Administrator access required'},403);
  const {requestId}=await req.json();
  if(typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requestId))return reply({error:'Invalid request'},400);
  const secrets=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
  const client=createClient(url,secrets.default||Object.values(secrets)[0]||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  const {data:request,error:requestError}=await client.from('upload_requests').select('id').eq('id',requestId).maybeSingle();
  if(requestError)throw new Error('Cannot load request');
  if(!request)return reply({success:true,alreadyDeleted:true});
  const {data:assets,error:assetsError}=await client.from('media_assets').select('id,cloudinary_public_id,resource_type').eq('request_id',requestId);
  if(assetsError)throw new Error('Cannot load request media');
  const name=Deno.env.get('CLOUDINARY_CLOUD_NAME'),key=Deno.env.get('CLOUDINARY_API_KEY'),secret=Deno.env.get('CLOUDINARY_API_SECRET');
  if(assets?.length&&(!name||!key||!secret))throw new Error('Media deletion service is not configured');
  // Keep request/asset records until every provider deletion is confirmed. Retry is idempotent.
  for(const asset of assets||[]) {
   if(!asset.cloudinary_public_id || !['image','video'].includes(asset.resource_type))throw new Error('Media deletion target is invalid');
   const timestamp=Math.floor(Date.now()/1000);
   const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(`invalidate=true&public_id=${asset.cloudinary_public_id}&timestamp=${timestamp}${secret}`));
   const signature=Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
   const form=new FormData();form.set('public_id',asset.cloudinary_public_id);form.set('invalidate','true');form.set('timestamp',String(timestamp));form.set('api_key',key!);form.set('signature',signature);
   const result=await fetch(`https://api.cloudinary.com/v1_1/${name}/${asset.resource_type}/destroy`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)});
   const body=await result.json();
   if(!result.ok || !['ok','not found'].includes(body.result))return reply({error:'Cloudinary could not delete every file. The request has been kept; retry deletion.'},502);
  }
  const {error:deleteError}=await client.from('upload_requests').delete().eq('id',requestId);
  if(deleteError)throw new Error('Media removed, but request cleanup failed. Retry deletion.');
  return reply({success:true});
 }catch(error){return reply({error:error instanceof Error?error.message:'Request deletion failed'},500);}
});
