// supabase/functions/sign-cloudinary-upload/index.ts
// Secure signed upload parameter generator for Cloudinary

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const supabaseAnonKey = publishableKeys.default || Object.values(publishableKeys)[0] || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const cloudinaryApiKey = Deno.env.get("CLOUDINARY_API_KEY") ?? "";
    const cloudinaryApiSecret = Deno.env.get("CLOUDINARY_API_SECRET") ?? "";
    const cloudinaryCloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "";

    // 1. Verify Authentication
    const authHeader = req.headers.get("Authorization");
    const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Edge requests have no stored browser session: verify the supplied JWT explicitly.
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      console.warn("Upload authentication rejected", userError?.code, userError?.status, userError?.message);
      return new Response(JSON.stringify({ error: "Invalid user token" }), { status: 401, headers: corsHeaders });
    }

    if (!cloudinaryApiKey || !cloudinaryApiSecret || !cloudinaryCloudName) {
      return new Response(JSON.stringify({ error: "Cloudinary credentials are not configured in Supabase Edge Function secrets" }), { status: 503, headers: corsHeaders });
    }

    const { mediaType, count, reservationToken, assetIndex = 0 } = await req.json();
    const mediaCount = Number(count) || 1;
    const token = reservationToken || `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(token) || !Number.isInteger(assetIndex) || assetIndex < 0 || assetIndex >= mediaCount) {
      return new Response(JSON.stringify({error:'Invalid upload reservation or file index'}),{status:400,headers:corsHeaders});
    }

    // 2. Reserve Quota atomically with reservation token
    const { data: reserveResult, error: reserveError } = await supabase.rpc("reserve_media_quota", {
      p_user_id: user.id,
      p_count: mediaCount,
      p_media_type: mediaType || "image",
      p_reservation_token: token,
    });

    if (reserveError || !reserveResult?.success) {
      return new Response(
        JSON.stringify({ error: reserveResult?.error || "Quota reservation failed", details: reserveResult }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 3. Generate Cloudinary Signature
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `breezing_hd_status/${user.id}`;
    const publicId = `${token}/${assetIndex}`;
    const allowedFormats = mediaType === 'video' ? 'mp4,mov,webm,mkv,m4v,avi,wmv,flv' : 'jpg,jpeg,png,webp';
    
    // Cloudinary signature string parameters must be sorted alphabetically
    const paramsToSign = `allowed_formats=${allowedFormats}&folder=${folder}&overwrite=false&public_id=${publicId}&timestamp=${timestamp}${cloudinaryApiSecret}`;
    
    // Compute SHA-1
    const encoder = new TextEncoder();
    const data = encoder.encode(paramsToSign);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return new Response(
      JSON.stringify({
        signature,
        timestamp,
        folder,
        publicId,
        allowedFormats,
        overwrite: false,
        apiKey: cloudinaryApiKey,
        cloudName: cloudinaryCloudName,
        reservationToken: token,
        packageInfo: reserveResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
