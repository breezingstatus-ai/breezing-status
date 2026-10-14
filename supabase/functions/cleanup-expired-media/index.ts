// supabase/functions/cleanup-expired-media/index.ts
// Production automated media cleanup routine:
// 1. Queries unexpired assets exceeding the 24-hour retention window.
// 2. Calls Cloudinary Destroy API to permanently delete the physical asset.
// 3. Verifies deletion confirmation before marking records deleted in Postgres.
// 4. Retries failed deletions up to 5 times.
// 5. Cleans up stale quota reservations.

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cloudinaryApiKey = Deno.env.get("CLOUDINARY_API_KEY") ?? "";
    const cloudinaryApiSecret = Deno.env.get("CLOUDINARY_API_SECRET") ?? "";
    const cloudinaryCloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Release any stale reservations older than 1 hour to free quota
    try {
      await supabase.rpc("release_stale_reservations");
    } catch (e: any) {
      console.warn("release_stale_reservations error:", e);
    }

    // 2. Fetch expired assets needing destruction
    const { data: expiredAssets, error: fetchError } = await supabase.rpc("get_expired_assets_for_cleanup", {
      p_limit: 50,
    });

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500, headers: corsHeaders });
    }

    if (!expiredAssets || expiredAssets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No expired assets to clean up", cleanedCount: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Check Cloudinary credentials upfront before processing
    if (!cloudinaryApiKey || !cloudinaryApiSecret || !cloudinaryCloudName) {
      await supabase.from("admin_audit_logs").insert({
        action: "cleanup_cloudinary_credentials_missing",
        target_type: "external_service",
        target_id: "cloudinary",
        details: {
          error: "Cloudinary credentials missing in Edge Function environment secrets",
          expired_assets_pending: expiredAssets.length,
        },
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Cloudinary credentials not configured in Edge Function environment secrets",
          cleanedCount: 0,
          pendingAssetsCount: expiredAssets.length,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let deletedCount = 0;
    const errors: any[] = [];

    // 4. Process each asset with Cloudinary Destroy API
    for (const asset of expiredAssets) {
      try {
        const timestamp = Math.round(new Date().getTime() / 1000);
        const paramsToSign = `public_id=${asset.cloudinary_public_id}&timestamp=${timestamp}${cloudinaryApiSecret}`;

        const encoder = new TextEncoder();
        const data = encoder.encode(paramsToSign);
        const hashBuffer = await crypto.subtle.digest("SHA-1", data);
        const signature = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const formData = new FormData();
        formData.append("public_id", asset.cloudinary_public_id);
        formData.append("api_key", cloudinaryApiKey);
        formData.append("timestamp", timestamp.toString());
        formData.append("signature", signature);
        formData.append("invalidate", "true");

        const destroyUrl = `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/${asset.resource_type || "image"}/destroy`;
        const res = await fetch(destroyUrl, { method: "POST", body: formData });
        
        if (!res.ok) {
          const errText = await res.text();
          const errDetail = `Cloudinary HTTP ${res.status}: ${errText}`;
          await supabase.rpc("record_asset_deletion_result", {
            p_asset_id: asset.asset_id,
            p_success: false,
            p_error: errDetail,
          });
          errors.push({ assetId: asset.asset_id, error: errDetail });
          continue;
        }

        const resJson = await res.json();

        // 5. Verify confirmation: Cloudinary returns result: 'ok' or 'not found' (already removed)
        if (resJson.result === "ok" || resJson.result === "not found") {
          await supabase.rpc("record_asset_deletion_result", {
            p_asset_id: asset.asset_id,
            p_success: true,
            p_error: null,
          });
          deletedCount++;
        } else {
          const errDetail = resJson.error?.message || resJson.result || "Cloudinary deletion rejected";
          await supabase.rpc("record_asset_deletion_result", {
            p_asset_id: asset.asset_id,
            p_success: false,
            p_error: errDetail,
          });
          errors.push({ assetId: asset.asset_id, error: errDetail });
        }
      } catch (err: any) {
        await supabase.rpc("record_asset_deletion_result", {
          p_asset_id: asset.asset_id,
          p_success: false,
          p_error: err.message,
        });
        errors.push({ assetId: asset.asset_id, error: err.message });
      }
    }

    const isAllSuccessful = errors.length === 0 && deletedCount === expiredAssets.length;
    const isPartialSuccess = deletedCount > 0 && errors.length > 0;

    // Record failure in admin_audit_logs if any deletions failed
    if (errors.length > 0) {
      await supabase.from("admin_audit_logs").insert({
        action: "cleanup_cloudinary_deletions_failed",
        target_type: "media_assets",
        target_id: "batch",
        details: {
          totalAssets: expiredAssets.length,
          deletedCount,
          errorsCount: errors.length,
          errors: errors.slice(0, 10),
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: isAllSuccessful,
        status: isAllSuccessful ? "completed" : isPartialSuccess ? "partial_failure" : "failed",
        cleanedCount: deletedCount,
        errorsCount: errors.length,
        errors,
      }),
      { 
        status: isAllSuccessful ? 200 : isPartialSuccess ? 207 : 502, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
