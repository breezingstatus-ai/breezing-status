// supabase/functions/finalize-request/index.ts
// Finalizes upload request, saves media assets, commits quotas, and sends Resend notification

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ?? "breezingstatus@gmail.com";
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "notifications@breezing.com";
    const appUrl = Deno.env.get("APP_URL") ?? "https://breezing-status-hd.breezingstatus.workers.dev";
    const cloudinaryApiKey = Deno.env.get("CLOUDINARY_API_KEY") ?? "";
    const cloudinaryApiSecret = Deno.env.get("CLOUDINARY_API_SECRET") ?? "";
    const cloudinaryCloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user token" }), { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();
    const { mediaType, assets, customerNotes, reservationToken } = payload;

    if (!assets || !Array.isArray(assets) || assets.length === 0) {
      return new Response(JSON.stringify({ error: "No media assets submitted" }), { status: 400, headers: corsHeaders });
    }

    if (!reservationToken) {
      return new Response(JSON.stringify({ error: "Missing required reservation token" }), { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify reservation token ownership, active status, expiration, and count match
    const { data: reservation, error: resError } = await supabaseAdmin
      .from("quota_reservations")
      .select("*")
      .eq("reservation_token", reservationToken)
      .single();

    if (resError || !reservation) {
      return new Response(JSON.stringify({ error: "Invalid or nonexistent quota reservation token" }), { status: 400, headers: corsHeaders });
    }

    if (reservation.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Security violation: reservation belongs to another user" }), { status: 403, headers: corsHeaders });
    }

    if (reservation.status !== "active") {
      return new Response(JSON.stringify({ error: `Reservation is no longer active (status: ${reservation.status})` }), { status: 400, headers: corsHeaders });
    }

    if (new Date(reservation.expires_at).getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: "Reservation token has expired" }), { status: 400, headers: corsHeaders });
    }

    if (reservation.count !== assets.length || reservation.media_type !== (mediaType || "image")) {
      return new Response(JSON.stringify({ error: "Media assets do not match reserved count or type" }), { status: 400, headers: corsHeaders });
    }

    // Verify each asset has non-empty Cloudinary identifiers
    for (const a of assets) {
      if (!a.public_id || !a.secure_url) {
        return new Response(JSON.stringify({ error: "Invalid asset: missing Cloudinary public_id or secure_url" }), { status: 400, headers: corsHeaders });
      }
    }

    // Confirm that uploads are verified through actual trusted Cloudinary API responses,
    // not merely client-populated payload fields.
    if (cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret) {
      const resourceType = (mediaType || "image") === "video" ? "video" : "image";
      const basicAuth = btoa(`${cloudinaryApiKey}:${cloudinaryApiSecret}`);

      for (const a of assets) {
        const encodedId = encodeURIComponent(a.public_id);
        const cldUrl = `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/resources/${resourceType}/upload/${encodedId}`;

        try {
          const cldRes = await fetch(cldUrl, {
            headers: { Authorization: `Basic ${basicAuth}` },
          });

          if (!cldRes.ok) {
            const errBody = await cldRes.text();
            console.error(`Cloudinary API verification failed for ${a.public_id}:`, cldRes.status, errBody);
            return new Response(
              JSON.stringify({
                error: `Upload verification rejected: Cloudinary resource '${a.public_id}' could not be verified on the server`,
                status: cldRes.status,
              }),
              { status: 400, headers: corsHeaders }
            );
          }

          const cldData = await cldRes.json();

          // Populate database records directly from verified Cloudinary API response
          a.public_id = cldData.public_id;
          a.asset_id = cldData.asset_id || a.asset_id || null;
          a.secure_url = cldData.secure_url || a.secure_url;
          a.bytes = cldData.bytes ?? a.bytes ?? 0;
          a.width = cldData.width ?? a.width ?? null;
          a.height = cldData.height ?? a.height ?? null;
          a.format = cldData.format || a.format || "jpg";
          if (resourceType === "video" && cldData.duration) {
            a.duration = cldData.duration;
          }
        } catch (fetchErr: any) {
          console.error("Cloudinary verification network error:", fetchErr);
          return new Response(
            JSON.stringify({ error: `Cloudinary API verification network error: ${fetchErr.message}` }),
            { status: 502, headers: corsHeaders }
          );
        }
      }
    } else {
      console.warn("Cloudinary API credentials not configured in environment; proceeding with schema validation.");
    }

    // 1. Get user profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*, packages(*)")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: corsHeaders });
    }

    // 2. Generate unique Request Code: BRZ-XXXXX
    const requestCode = `BRZ-${Math.floor(10000 + Math.random() * 90000)}`;

    // 3. Create upload request record
    const { data: newRequest, error: reqError } = await supabaseAdmin
      .from("upload_requests")
      .insert({
        request_code: requestCode,
        user_id: user.id,
        reservation_token: reservationToken,
        customer_name: profile.full_name || "Customer",
        customer_email: profile.email || "",
        customer_phone: profile.whatsapp_number || "",
        package_id: profile.package_id || "free",
        package_name: profile.packages?.name || "Free",
        media_type: mediaType || "image",
        media_count: assets.length,
        watermark_applied: profile.packages?.watermark_required ?? true,
        status: "pending",
        admin_notes: customerNotes || null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (reqError || !newRequest) {
      return new Response(JSON.stringify({ error: reqError?.message || "Failed to create request" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // 4. Insert media assets
    const mediaAssetRows = assets.map((asset: any) => ({
      request_id: newRequest.id,
      user_id: user.id,
      cloudinary_public_id: asset.public_id,
      cloudinary_asset_id: asset.asset_id || null,
      resource_type: mediaType || "image",
      secure_url: asset.secure_url,
      original_filename: asset.original_filename || "status_media",
      file_size_bytes: asset.bytes || 0,
      width: asset.width || null,
      height: asset.height || null,
      duration_seconds: asset.duration || null,
      format: asset.format || "jpg",
      expires_at: newRequest.expires_at,
    }));

    const { error: assetError } = await supabaseAdmin.from("media_assets").insert(mediaAssetRows);
    if (assetError) throw new Error(assetError.message);

    // 5. Finalize media quota atomically using reservation token and linked request ID
    if (reservationToken) {
      const { data: finalized, error: finalizeError } = await supabaseAdmin.rpc("finalize_media_quota", {
        p_reservation_token: reservationToken,
        p_request_id: newRequest.id,
      });
      if (finalizeError || !finalized?.success) {
        throw new Error(finalizeError?.message || finalized?.error || "Could not finalize upload quota");
      }
    }

    // 6. Send transactional Resend email alert to administrator
    if (resendApiKey) {
      try {
        const numPictures = mediaType === "image" ? assets.length : 0;
        const numVideos = mediaType === "video" ? assets.length : 0;
        const submissionDate = new Date().toUTCString();
        const secureAdminLink = `${appUrl}?admin_view=true&req=${newRequest.id}`;

        const emailSubject = `New HD Status Submission: ${profile.full_name} (${numPictures} photos, ${numVideos} videos)`;
        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #19241E; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #E4EAE5; border-radius: 16px;">
            <div style="background-color: #173B2A; color: #FFFFFF; padding: 16px 20px; border-radius: 12px; margin-bottom: 20px;">
              <h2 style="margin: 0; font-size: 18px;">breezing status HD — New Customer Request</h2>
              <p style="margin: 4px 0 0; font-size: 13px; color: #58C994;">Package: <strong>${profile.packages?.name || "Free"}</strong></p>
            </div>
            <p style="font-size: 14px; margin: 0 0 16px;">A new customer media submission has been received and verified. Details below:</p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
              <tr style="border-bottom: 1px solid #F1F5F1;"><td style="padding: 8px 0; color: #748078;">Customer Name:</td><td style="padding: 8px 0; font-weight: 600;">${profile.full_name}</td></tr>
              <tr style="border-bottom: 1px solid #F1F5F1;"><td style="padding: 8px 0; color: #748078;">Customer Google Email:</td><td style="padding: 8px 0;">${profile.email}</td></tr>
              <tr style="border-bottom: 1px solid #F1F5F1;"><td style="padding: 8px 0; color: #748078;">WhatsApp Number:</td><td style="padding: 8px 0; font-weight: 600; color: #21A36B;">${profile.whatsapp_number}</td></tr>
              <tr style="border-bottom: 1px solid #F1F5F1;"><td style="padding: 8px 0; color: #748078;">Number of Pictures:</td><td style="padding: 8px 0; font-weight: 600;">${numPictures}</td></tr>
              <tr style="border-bottom: 1px solid #F1F5F1;"><td style="padding: 8px 0; color: #748078;">Number of Videos:</td><td style="padding: 8px 0; font-weight: 600;">${numVideos}</td></tr>
              <tr style="border-bottom: 1px solid #F1F5F1;"><td style="padding: 8px 0; color: #748078;">Package Name:</td><td style="padding: 8px 0;">${profile.packages?.name || "Free"}</td></tr>
              <tr style="border-bottom: 1px solid #F1F5F1;"><td style="padding: 8px 0; color: #748078;">Submission Date & Time:</td><td style="padding: 8px 0;">${submissionDate}</td></tr>
              <tr><td style="padding: 8px 0; color: #748078;">Secure Admin Link:</td><td style="padding: 8px 0;"><a href="${secureAdminLink}" style="color: #21A36B; font-weight: bold; text-decoration: underline;">Open Administrator Request Console</a></td></tr>
            </table>
            <div style="background-color: #F8F9F7; border-radius: 8px; padding: 12px; text-align: center;">
              <p style="font-size: 12px; color: #748078; margin: 0;">Notice: Temporary media files will be purged automatically 24 hours from submission.</p>
            </div>
          </div>
        `;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `breezing status HD <${fromEmail}>`,
            to: [adminEmail],
            subject: emailSubject,
            html: emailHtml,
          }),
        });

        // Log notification attempt
        await supabaseAdmin.from("notification_logs").insert({
          request_id: newRequest.id,
          recipient_email: adminEmail,
          subject: emailSubject,
          status: "sent",
        });
      } catch (err: any) {
        console.error("Resend notification error:", err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        request: newRequest,
        requestCode: newRequest.request_code,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
