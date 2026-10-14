import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
const headers = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
serve(async req => {
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  try {
    const token=req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if(!token) return new Response(JSON.stringify({error:'Sign in required'}),{status:401,headers});
    const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');
    const client=createClient(Deno.env.get('SUPABASE_URL')!,keys.default||Object.values(keys)[0]||Deno.env.get('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
    const {data:{user},error}=await client.auth.getUser(token);
    if(error || !user) return new Response(JSON.stringify({error:'Invalid session'}),{status:401,headers});
    const {data:admin,error:adminError}=await client.rpc('is_admin');
    if(adminError || !admin) return new Response(JSON.stringify({error:'Administrator access required'}),{status:403,headers});
    const key=Deno.env.get('RESEND_API_KEY'), to=Deno.env.get('ADMIN_NOTIFICATION_EMAIL'), from=Deno.env.get('RESEND_FROM_EMAIL');
    if(!key || !to || !from) throw new Error('Resend email settings are incomplete');
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject:'Breezing Status HD — email test',text:'Your administrator test email was sent through Resend.'})});
    const body=await response.json();
    if(!response.ok) return new Response(JSON.stringify({error:body.message||'Resend rejected the email'}),{status:502,headers});
    return new Response(JSON.stringify({success:true,id:body.id}),{headers});
  }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:'Email test failed'}),{status:500,headers});}
});
