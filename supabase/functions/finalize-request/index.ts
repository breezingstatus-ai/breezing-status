// supabase/functions/finalize-request/index.ts
// Finalizes upload request, saves media assets, commits quotas, and sends Resend notification

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";

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
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const supabaseServiceKey = secretKeys.default || Object.values(secretKeys)[0] || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ?? "breezingstatus@gmail.com";
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "notifications@breezing.com";
    const appUrl = Deno.env.get("APP_URL") ?? "https://breezing.breezingstatus.workers.dev";
    const cloudinaryApiKey = Deno.env.get("CLOUDINARY_API_KEY") ?? "";
    const cloudinaryApiSecret = Deno.env.get("CLOUDINARY_API_SECRET") ?? "";
    const cloudinaryCloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "";

    const authHeader = req.headers.get("Authorization");
    const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const supabaseAnonKey = publishableKeys.default || Object.values(publishableKeys)[0] || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(accessToken);
    if (userError || !user) {
      console.warn("Finalization authentication rejected", userError?.code, userError?.status, userError?.message);
      return new Response(JSON.stringify({ error: "Invalid user token" }), { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();
    const { mediaType, assets, customerNotes, reservationToken } = payload;

    if (!['image','video'].includes(mediaType)) throw new Error('Invalid media type');
    if (!assets || !Array.isArray(assets) || assets.length === 0) {
      return new Response(JSON.stringify({ error: "No media assets submitted" }), { status: 400, headers: corsHeaders });
    }

    if (!reservationToken) {
      return new Response(JSON.stringify({ error: "Missing required reservation token" }), { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const {data: service, error: serviceError} = await supabaseAdmin.from("app_settings").select("service_available,maintenance_mode").eq("id",1).single();
    if (serviceError || !service) return new Response(JSON.stringify({error:"Cannot verify upload availability. Please try again."}),{status:503,headers:corsHeaders});
    if (!service.service_available || service.maintenance_mode) return new Response(JSON.stringify({error:"Uploads are temporarily paused. Please check the service notice.",code:"SERVICE_PAUSED"}),{status:503,headers:corsHeaders});

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

    if (new Set(assets.map(a=>a.public_id)).size !== assets.length) throw new Error('Duplicate media in one submission');
    // Verify each asset has non-empty Cloudinary identifiers
    for (const [index, a] of assets.entries()) {
      if (a.public_id !== `breezing_hd_status/${user.id}/${reservationToken}/${index}` || !a.secure_url) {
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
          a.secure_url = cldData.secure_url;
          if (!a.secure_url?.startsWith(`https://res.cloudinary.com/${cloudinaryCloudName}/`)) throw new Error('Cloudinary did not return a trusted delivery URL');
          a.bytes = cldData.bytes;
          if (!Number.isFinite(a.bytes) || a.bytes <= 0) throw new Error('Cloudinary did not return a valid file size');
          a.width = cldData.width;
          a.height = cldData.height;
          if (!Number.isFinite(a.width) || !Number.isFinite(a.height) || a.width <= 0 || a.height <= 0) throw new Error('Cloudinary did not return valid media dimensions');
          a.format = cldData.format || a.format || "jpg";
          if (resourceType === "video") {
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
      throw new Error('Cloudinary verification credentials are missing');
    }

    // 1. Get user profile
    const { data: profileRow, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup failed", profileError.code, profileError.message);
      return new Response(JSON.stringify({ error: `Profile lookup failed: ${profileError.message}` }), { status: 500, headers: corsHeaders });
    }
    if (!profileRow) {
      return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: corsHeaders });
    }
    if (profileRow.status !== 'active' || !profileRow.full_name?.trim() || profileRow.full_name.trim().length < 2 || !/^\+[1-9]\d{7,14}$/.test(profileRow.whatsapp_number || '') || !profileRow.whatsapp_consent) {
      return new Response(JSON.stringify({error:'Name, valid WhatsApp number, and delivery consent are required for an active account'}),{status:400,headers:corsHeaders});
    }
    // Fetch the package separately: a missing/ambiguous PostgREST relationship
    // must not hide a valid customer profile behind a false 404.
    const { data: pkg, error: packageError } = await supabaseAdmin
      .from("packages").select("*").eq("id", profileRow.package_id || "free").single();
    if (!pkg?.is_active) throw new Error("Package unavailable");
    if (packageError) throw new Error(`Package lookup failed: ${packageError.message}`);
    const profile = { ...profileRow, packages: pkg };
    const { data: watermark, error: watermarkError } = await supabaseAdmin
      .from("watermark_settings").select("*").eq("id", 1).single();
    if (watermarkError) throw new Error(`Watermark settings lookup failed: ${watermarkError.message}`);

    for (const asset of assets) {
      if (mediaType === 'image' && asset.bytes > 25 * 1024 * 1024) throw new Error('Picture exceeds 25 MB');
      if (mediaType === 'video' && (asset.bytes > pkg.max_video_size_mb * 1024 * 1024 || !Number.isFinite(asset.duration) || asset.duration <= 0 || asset.duration > pkg.max_video_duration_seconds)) throw new Error('Video exceeds the package size or duration limit');
    }
    // Apply branding to trusted delivery URLs on the server. Browser flags cannot remove it.
    if (pkg.watermark_required) {
      const appUrl = Deno.env.get('APP_URL') || 'https://breezing.breezingstatus.workers.dev';
      const logoSource = watermark.logo_url.startsWith('data:image/png;base64,') ? watermark.logo_url : new URL(watermark.logo_url, appUrl).href;
      if (!logoSource.startsWith('data:image/png;base64,') && new URL(logoSource).origin !== new URL(appUrl).origin) throw new Error('Use the official logo or upload a PNG in watermark settings');
      const hash = async (value: string, algorithm = 'SHA-1') => Array.from(new Uint8Array(await crypto.subtle.digest(algorithm,new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
      const logoId = `breezing_brand/${(await hash(logoSource,'SHA-256')).slice(0,32)}`;
      const apiBase = `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}`;
      const authorization = `Basic ${btoa(`${cloudinaryApiKey}:${cloudinaryApiSecret}`)}`;
      let logoResponse = await fetch(`${apiBase}/resources/image/upload/${encodeURIComponent(logoId)}`,{headers:{Authorization:authorization}});
      let logo;
      if (logoResponse.ok) logo = await logoResponse.json();
      else if (logoResponse.status === 404) {
        const timestamp = Math.floor(Date.now()/1000);
        const form = new FormData();
        form.set('file',logoSource);form.set('public_id',logoId);form.set('overwrite','false');form.set('timestamp',String(timestamp));form.set('api_key',cloudinaryApiKey);
        form.set('signature',await hash(`overwrite=false&public_id=${logoId}&timestamp=${timestamp}${cloudinaryApiSecret}`));
        logoResponse = await fetch(`${apiBase}/image/upload`,{method:'POST',body:form});
        logo = await logoResponse.json();
        if (!logoResponse.ok) throw new Error(logo.error?.message || 'Logo upload failed');
      } else throw new Error('Could not verify the watermark logo');
      if (!logo.width || !logo.height) throw new Error('Invalid watermark logo dimensions');
      for (const asset of assets) {
        const width = Math.max(80,Math.min(asset.width * watermark.relative_size,450));
        const height = width * logo.height / logo.width;
        let x=watermark.padding_pixels, y=watermark.padding_pixels;
        if(watermark.position==='bottom-right'){x=asset.width-width-x;y=asset.height-height-y;}
        if(watermark.position==='bottom-left') y=asset.height-height-y;
        if(watermark.position==='top-right') x=asset.width-width-x;
        if(watermark.position==='center'){x=(asset.width-width)/2;y=(asset.height-height)/2;}
        if(watermark.position==='custom'){x=(asset.width-width)*(watermark.offset_x_percent??50)/100;y=(asset.height-height)*(watermark.offset_y_percent??50)/100;}
        x=Math.round(Math.max(0,Math.min(asset.width-width,x)));y=Math.round(Math.max(0,Math.min(asset.height-height,y)));
        const transform=`l_${logoId.replaceAll('/',':')}/c_scale,w_${Math.round(width)},o_${Math.round(watermark.opacity*100)}/fl_layer_apply,fl_no_overflow,g_north_west,x_${x},y_${y}`;
        asset.secure_url = asset.secure_url.replace('/upload/',`/upload/${transform}/`);
        if(mediaType==='image') {
          const check=await fetch(asset.secure_url,{method:'HEAD'});
          if(!check.ok) throw new Error('Watermark rendering failed. Please retry.');
        }
      }
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
        watermark_applied: pkg.watermark_required,
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
    const thumbnailUrl=(asset:any)=>{
      const transform=mediaType==='video'?'so_0,c_fill,w_160,h_160,q_35,f_jpg':'c_fill,w_160,h_160,q_35,f_auto';
      const version=asset.secure_url.match(/\/v\d+\//);
      let url=version?asset.secure_url.replace(version[0],`/${transform}${version[0]}`):asset.secure_url.replace('/upload/',`/upload/${transform}/`);
      if(mediaType==='video')url=url.replace(/\.[a-z0-9]+(?:\?.*)?$/i,'.jpg');
      return url;
    };
    const mediaAssetRows = assets.map((asset: any) => ({
      request_id: newRequest.id,
      user_id: user.id,
      cloudinary_public_id: asset.public_id,
      cloudinary_asset_id: asset.asset_id || null,
      resource_type: mediaType || "image",
      secure_url: asset.secure_url,
      thumbnail_url: thumbnailUrl(asset),
      original_filename: asset.original_filename || "status_media",
      file_size_bytes: asset.bytes || 0,
      width: asset.width || null,
      height: asset.height || null,
      duration_seconds: asset.duration || null,
      format: asset.format || "jpg",
      expires_at: newRequest.expires_at,
    }));

    let savedAssets: any[] = [];
    try {
    const { data: storedAssets, error: assetError } = await supabaseAdmin.from("media_assets").insert(mediaAssetRows).select('*');
    if (assetError) throw new Error(assetError.message);
    savedAssets = storedAssets || [];

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

    } catch (error) {
      await supabaseAdmin.from('upload_requests').update({status:'failed'}).eq('id',newRequest.id);
      await supabaseAdmin.rpc('release_media_quota',{p_reservation_token:reservationToken});
      throw error;
    }
    // Return trusted delivery URLs, including server-applied branding.
    newRequest.assets = savedAssets;
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

        const emailResponse = await fetch("https://api.resend.com/emails", {
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
          status: emailResponse.ok ? "sent" : "failed",
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
