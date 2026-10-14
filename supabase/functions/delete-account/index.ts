// supabase/functions/delete-account/index.ts
// Production customer account deletion routine:
// 1. Verifies caller authentication.
// 2. Destroys all physical Cloudinary assets (request media and profile photos).
// 3. Deletes customer profile in database (triggering cascades).
// 4. Calls Supabase Auth Admin API to purge the auth.users record.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cloudinaryApiKey = Deno.env.get("CLOUDINARY_API_KEY") ?? "";
    const cloudinaryApiSecret = Deno.env.get("CLOUDINARY_API_SECRET") ?? "";
    const cloudinaryCloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization token" }), { status: 401, headers: corsHeaders });
    }

    // 1. Authenticate caller
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user token" }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Retrieve user media assets to destroy in Cloudinary
    const { data: userAssets } = await supabaseAdmin
      .from("media_assets")
      .select("cloudinary_public_id, resource_type")
      .eq("user_id", user.id)
      .eq("is_deleted", false);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("avatar_cloudinary_id")
      .eq("id", user.id)
      .single();

    // 3. Destroy assets in Cloudinary
    if (cloudinaryApiKey && cloudinaryApiSecret && cloudinaryCloudName) {
      const destroyTargets: Array<{ publicId: string; type: string }> = [];

      if (userAssets && userAssets.length > 0) {
        userAssets.forEach((a: any) => {
          if (a.cloudinary_public_id) {
            destroyTargets.push({ publicId: a.cloudinary_public_id, type: a.resource_type || "image" });
          }
        });
      }

      if (profile?.avatar_cloudinary_id) {
        destroyTargets.push({ publicId: profile.avatar_cloudinary_id, type: "image" });
      }

      for (const target of destroyTargets) {
        try {
          const timestamp = Math.round(new Date().getTime() / 1000);
          const paramsToSign = `public_id=${target.publicId}&timestamp=${timestamp}${cloudinaryApiSecret}`;

          const encoder = new TextEncoder();
          const data = encoder.encode(paramsToSign);
          const hashBuffer = await crypto.subtle.digest("SHA-1", data);
          const signature = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          const formData = new FormData();
          formData.append("public_id", target.publicId);
          formData.append("api_key", cloudinaryApiKey);
          formData.append("timestamp", timestamp.toString());
          formData.append("signature", signature);
          formData.append("invalidate", "true");

          const destroyUrl = `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/${target.type}/destroy`;
          await fetch(destroyUrl, { method: "POST", body: formData });
        } catch (e: any) {
          console.warn(`Cloudinary destroy error for ${target.publicId}:`, e);
        }
      }
    }

    // 4. Delete profile (cascades upload_requests, media_assets, usage_quotas, quota_reservations)
    await supabaseAdmin.from("profiles").delete().eq("id", user.id);

    // 5. Delete Supabase Auth User via Auth Admin API
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      console.error("Auth admin delete error:", deleteUserError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Customer account, media assets, and authentication profile permanently deleted.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
