import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('===============================================================');
  console.log('   BREEZING STATUS HD — LIVE POSTGRESQL ENGINE TEST RUNNER     ');
  console.log('===============================================================');

  const db = new PGlite();

  // 1. Setup mock Supabase environment
  console.log('\n[1/6] Bootstrapping Supabase Auth schema and session context...');
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    -- Mock auth.uid() and auth.role() responding to current session settings
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
    BEGIN
      RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
    BEGIN
      RETURN COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
    EXCEPTION WHEN OTHERS THEN
      RETURN 'anon';
    END;
    $$ LANGUAGE plpgsql STABLE;

    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
    BEGIN
      RETURN jsonb_build_object(
        'sub', current_setting('request.jwt.claim.sub', true),
        'role', COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon'),
        'email', current_setting('request.jwt.claim.email', true)
      );
    EXCEPTION WHEN OTHERS THEN
      RETURN '{}'::jsonb;
    END;
    $$ LANGUAGE plpgsql STABLE;

    -- Mock uuid_generate_v4 using Postgres native gen_random_uuid
    CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid AS $$ 
      SELECT gen_random_uuid(); 
    $$ LANGUAGE sql;

    -- Roles
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END $$;
  `);

  console.log('   Auth schema, mock functions, and roles created.');

  // Helper to set auth session context
  async function setSession(userId: string | null, role: 'anon' | 'authenticated' | 'service_role', email: string = '') {
    if (userId) {
      await db.exec(`SET request.jwt.claim.sub = '${userId}'; SET request.jwt.claim.email = '${email}';`);
    } else {
      await db.exec(`SET request.jwt.claim.sub = ''; SET request.jwt.claim.email = '';`);
    }
    await db.exec(`SET request.jwt.claim.role = '${role}'; SET ROLE ${role};`);
  }

  async function resetToSuperuser() {
    await db.exec(`RESET ROLE; SET request.jwt.claim.sub = ''; SET request.jwt.claim.role = 'service_role';`);
  }

  // 2. Load the 5 SQL files
  console.log('\n[2/6] Loading 5 official SQL setup files in sequence...');
  const setupFiles = [
    '01_initial_schema.sql',
    '02_functions_and_triggers.sql',
    '03_row_level_security.sql',
    '04_default_data_and_realtime.sql',
    '05_cleanup_and_maintenance.sql',
  ];

  for (const file of setupFiles) {
    const fullPath = path.join(process.cwd(), 'supabase', 'setup', file);
    let sql = fs.readFileSync(fullPath, 'utf8');

    // Strip CREATE EXTENSION calls since native WASM Postgres doesn't load external dynamic libraries
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS\s+[^;]+;/gi, '-- extension stripped for wasm');
    
    // In file 05, ignore net.http_post call if net schema is not present
    if (file === '05_cleanup_and_maintenance.sql') {
      sql = sql.replace(/SELECT net\.http_post\([\s\S]*?\) INTO v_request_id;/g, 'v_request_id := 1;');
    }

    try {
      await db.exec(sql);
      console.log(`   ✓ Successfully executed ${file}`);
    } catch (err: any) {
      console.error(`\n[ERROR in ${file}]:`, err.message, err.detail, err.hint, err.code);
      throw err;
    }
  }

  // 3. Create test accounts
  console.log('\n[3/6] Setting up verified test accounts...');
  await resetToSuperuser();

  const superAdminId = '11111111-1111-1111-1111-111111111111';
  const superAdminEmail = 'breezingstatus@gmail.com';

  const customer1Id = '22222222-2222-2222-2222-222222222222';
  const customer1Email = 'customer1@example.com';

  const customer2Id = '33333333-3333-3333-3333-333333333333';
  const customer2Email = 'customer2@example.com';

  // Insert auth.users -> triggers handle_new_user() automatically creating profiles!
  await db.query(`
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES 
      ('${superAdminId}', '${superAdminEmail}', '{"full_name": "Super Admin User"}'::jsonb),
      ('${customer1Id}', '${customer1Email}', '{"full_name": "Customer One"}'::jsonb),
      ('${customer2Id}', '${customer2Email}', '{"full_name": "Customer Two"}'::jsonb);
  `);

  console.log('   ✓ auth.users created and profiles populated via on_auth_user_created trigger.');

  // 4. Run Targeted Test Suite for the 8 Issues
  console.log('\n[4/6] Executing targeted test suite against real PostgreSQL engine...\n');
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, details: string = '') {
    if (condition) {
      console.log(`  ✓ PASS: ${testName} ${details ? '(' + details + ')' : ''}`);
      passedCount++;
    } else {
      console.error(`  ✗ FAIL: ${testName} - ${details}`);
      failedCount++;
    }
  }

  // TEST 1: Initial Super-Admin Setup and Privilege Protection (Issue 3 & 7)
  console.log('--- TEST SUITE 1: Super-Admin Setup & Role Protection ---');

  // Customer attempts to self-bootstrap when 0 admins exist -> MUST BE BLOCKED
  await setSession(customer1Id, 'authenticated', customer1Email);
  let customerBootstrapFailed = false;
  try {
    await db.query(`
      INSERT INTO public.admin_roles (user_id, email, role, assigned_by)
      VALUES ('${customer1Id}', '${customer1Email}', 'super_admin', 'initial_database_setup');
    `);
  } catch (err: any) {
    customerBootstrapFailed = true;
  }
  assert(customerBootstrapFailed, 'Ordinary customer blocked from bootstrapping super_admin when 0 admins exist');

  // Trusted initial bootstrap via direct session / SQL Editor:
  await resetToSuperuser();
  await db.exec(`
    INSERT INTO public.admin_roles (user_id, email, role, assigned_by)
    VALUES ('${superAdminId}', '${superAdminEmail}', 'super_admin', 'initial_database_setup');

    UPDATE public.profiles
    SET role = 'admin'
    WHERE id = '${superAdminId}';
  `);
  
  const adminRoleCheck = await db.query(`SELECT * FROM public.admin_roles WHERE user_id = '${superAdminId}';`);
  assert(adminRoleCheck.rows.length === 1 && adminRoleCheck.rows[0].role === 'super_admin', 'Initial super-admin bootstrap succeeds via trusted database administrator session');

  // Customer attempts to self-assign administrator role
  await setSession(customer1Id, 'authenticated', customer1Email);
  let customerEscalationFailed = false;
  try {
    await db.query(`
      INSERT INTO public.admin_roles (user_id, email, role, assigned_by)
      VALUES ('${customer1Id}', '${customer1Email}', 'admin', 'hacker_attempt');
    `);
  } catch (err: any) {
    customerEscalationFailed = true;
  }
  assert(customerEscalationFailed, 'Ordinary customer blocked from assigning admin roles');

  // Customer attempts to delete super_admin
  let customerDeleteFailed = false;
  try {
    const delRes: any = await db.query(`DELETE FROM public.admin_roles WHERE user_id = '${superAdminId}';`);
    await resetToSuperuser();
    const adminStillExists = await db.query(`SELECT 1 FROM public.admin_roles WHERE user_id = '${superAdminId}';`);
    customerDeleteFailed = (delRes.affectedRows === 0 && adminStillExists.rows.length === 1);
  } catch (err: any) {
    customerDeleteFailed = true;
  }
  assert(customerDeleteFailed, 'Ordinary customer blocked from deleting administrator roles');

  // Super-admin attempts to delete the ONLY remaining super_admin (must be blocked by protection trigger)
  await setSession(superAdminId, 'authenticated', superAdminEmail);
  let deleteLastSuperAdminFailed = false;
  try {
    await db.query(`DELETE FROM public.admin_roles WHERE user_id = '${superAdminId}';`);
  } catch (err: any) {
    deleteLastSuperAdminFailed = err.message.includes('last remaining super-administrator');
  }
  assert(deleteLastSuperAdminFailed, 'Protection trigger blocks deletion of the final super-admin');

  // TEST 2: Anonymous Active Package Reading (Issue 2)
  console.log('\n--- TEST SUITE 2: Anonymous Package Reading RLS (Issue 2) ---');
  await setSession(null, 'anon');
  let anonPackagesSucceeded = false;
  let pkgRows: any[] = [];
  try {
    const res = await db.query(`SELECT id, name, price, monthly_pictures, is_active FROM public.packages;`);
    pkgRows = res.rows;
    anonPackagesSucceeded = true;
  } catch (err: any) {
    console.error('Anon package query error:', err.message);
  }
  assert(anonPackagesSucceeded && pkgRows.length === 3, 'Anonymous visitors can query active packages without is_admin permission error', `Found ${pkgRows.length} packages`);

  // Verify anonymous user CANNOT insert or update packages
  let anonPackageTamperFailed = false;
  try {
    await db.query(`UPDATE public.packages SET price = 0 WHERE id = 'premium';`);
  } catch {
    anonPackageTamperFailed = true;
  }
  assert(anonPackageTamperFailed, 'Anonymous visitors cannot update packages');

  // TEST 3: Public Settings vs. Private Administrator Settings (Issue 3)
  console.log('\n--- TEST SUITE 3: Application Settings Privacy (Issue 3) ---');
  // As anonymous visitor:
  await setSession(null, 'anon');
  const anonSettings = await db.query(`SELECT * FROM public.app_settings WHERE id = 1;`);
  const hasAdminEmailInApp = anonSettings.rows.length > 0 && 'admin_email' in anonSettings.rows[0];
  assert(!hasAdminEmailInApp, 'Public app_settings table does NOT contain or expose admin_email column');

  const publicViewRes = await db.query(`SELECT * FROM public.public_app_settings;`);
  assert(publicViewRes.rows.length === 1 && publicViewRes.rows[0].official_whatsapp_number === '+265 99 374 1274', 'public_app_settings view returns official WhatsApp and business settings');

  const publicRpcRes = await db.query(`SELECT public.get_public_settings() as settings;`);
  assert(publicRpcRes.rows.length === 1 && publicRpcRes.rows[0].settings.app_name === 'breezing status HD', 'get_public_settings() RPC returns clean public settings');

  // Anon tries to read admin_private_settings
  let anonPrivateBlocked = false;
  try {
    const privRes = await db.query(`SELECT * FROM public.admin_private_settings;`);
    anonPrivateBlocked = (privRes.rows.length === 0);
  } catch {
    anonPrivateBlocked = true;
  }
  assert(anonPrivateBlocked, 'Anonymous visitors cannot read admin_private_settings (0 rows returned via RLS)');

  // Customer tries to read admin_private_settings
  await setSession(customer1Id, 'authenticated', customer1Email);
  const custPrivate = await db.query(`SELECT * FROM public.admin_private_settings;`);
  assert(custPrivate.rows.length === 0, 'Authenticated customer cannot read admin_private_settings (0 rows returned via RLS)');

  // Admin reads admin_private_settings
  await setSession(superAdminId, 'authenticated', superAdminEmail);
  const adminPrivate = await db.query(`SELECT * FROM public.admin_private_settings;`);
  assert(adminPrivate.rows.length === 1 && adminPrivate.rows[0].admin_email === 'breezingstatus@gmail.com', 'Administrator can read admin_private_settings containing admin email');

  // Customer tries to read admin_full_settings (Critical Issue 1: View Privacy)
  await setSession(customer1Id, 'authenticated', customer1Email);
  const custFullSettings = await db.query(`SELECT * FROM public.admin_full_settings;`);
  assert(
    custFullSettings.rows.length === 0,
    'Authenticated customer cannot read admin_full_settings view (0 rows returned via security_invoker and is_admin filter)'
  );

  // Admin reads admin_full_settings (Critical Issue 1: View Privacy)
  await setSession(superAdminId, 'authenticated', superAdminEmail);
  const adminFullSettings = await db.query(`SELECT * FROM public.admin_full_settings;`);
  assert(
    adminFullSettings.rows.length === 1 && adminFullSettings.rows[0].admin_email === 'breezingstatus@gmail.com',
    'Administrator can query admin_full_settings view and access settings'
  );

  // TEST 4: Subscription Expiry & Profile Protection Trigger (Issue 4)
  console.log('\n--- TEST SUITE 4: Subscription Expiry & Profile Protection (Issue 4) ---');
  await resetToSuperuser();
  // Set customer1 to an expired Premium package
  await db.query(`
    UPDATE public.profiles
    SET package_id = 'premium',
        package_expiry = timezone('utc'::text, now()) - interval '2 days'
    WHERE id = '${customer1Id}';
  `);

  // Customer1 attempts to tamper with their own profile by setting package to 'business'
  await setSession(customer1Id, 'authenticated', customer1Email);
  await db.query(`
    UPDATE public.profiles
    SET package_id = 'business'
    WHERE id = '${customer1Id}';
  `);
  const profileAfterTamper = await db.query(`SELECT package_id FROM public.profiles WHERE id = '${customer1Id}';`);
  assert(profileAfterTamper.rows[0].package_id === 'premium', 'Profile trigger blocks customer from forging package upgrade');

  // Legitimate server-authorized downgrade: customer reserves quota while subscription has expired
  const reserveRes = await db.query(`
    SELECT public.reserve_media_quota(
      '${customer1Id}'::UUID,
      1,
      'image',
      'token_expiry_downgrade_test'
    ) as result;
  `);
  
  const profileAfterReserve = await db.query(`SELECT package_id FROM public.profiles WHERE id = '${customer1Id}';`);
  assert(profileAfterReserve.rows[0].package_id === 'free', 'Expired premium subscription successfully downgraded to free');

  // Clean up test reservation
  await db.query(`SELECT public.release_media_quota('token_expiry_downgrade_test');`);

  // TEST 5: Payment Validation Trigger (Issue 5)
  console.log('\n--- TEST SUITE 5: Payment Validation Trigger INSERT & UPDATE (Issue 5) ---');
  await setSession(customer1Id, 'authenticated', customer1Email);

  // Customer submits payment request on INSERT (Tests that OLD is not evaluated)
  let paymentInsertSucceeded = false;
  let newPaymentId = '';
  try {
    const payRes = await db.query(`
      INSERT INTO public.payment_requests (
        user_id,
        package_id,
        amount,
        currency,
        payment_method,
        reference_number,
        notes
      ) VALUES (
        '${customer1Id}',
        'premium',
        99999.00, -- forged price by customer; must be locked to official 3500.00
        'USD',
        'Airtel Money',
        'AIRTEL-REF-9988',
        'Please upgrade my account'
      ) RETURNING id, amount, status, approved_by;
    `);
    newPaymentId = payRes.rows[0].id;
    paymentInsertSucceeded = (
      payRes.rows[0].status === 'pending' &&
      Number(payRes.rows[0].amount) === 3500.00 &&
      payRes.rows[0].approved_by === null
    );
  } catch (err: any) {
    console.error('Payment insert error:', err.message);
  }
  assert(paymentInsertSucceeded, 'Payment request INSERT succeeds without referencing OLD and locks package price');

  // Customer tries to self-approve
  await db.query(`
    UPDATE public.payment_requests
    SET status = 'approved'
    WHERE id = '${newPaymentId}';
  `);
  const payAfterCustAttempt = await db.query(`SELECT status FROM public.payment_requests WHERE id = '${newPaymentId}';`);
  assert(payAfterCustAttempt.rows[0].status === 'pending', 'Customer cannot self-approve payment request');

  // Administrator approves payment request on UPDATE
  await setSession(superAdminId, 'authenticated', superAdminEmail);
  await db.query(`
    UPDATE public.payment_requests
    SET status = 'approved'
    WHERE id = '${newPaymentId}';
  `);
  const payApproved = await db.query(`SELECT status, approved_by FROM public.payment_requests WHERE id = '${newPaymentId}';`);
  const profileUpgraded = await db.query(`SELECT package_id, package_expiry FROM public.profiles WHERE id = '${customer1Id}';`);
  assert(
    payApproved.rows[0].status === 'approved' &&
    payApproved.rows[0].approved_by === superAdminId &&
    profileUpgraded.rows[0].package_id === 'premium' &&
    profileUpgraded.rows[0].package_expiry !== null,
    'Administrator payment approval updates status, sets approved_by, and activates subscription with expiry'
  );

  // TEST 6: finalize_media_quota Exact Reservation Linking (Issue 1)
  console.log('\n--- TEST SUITE 6: finalize_media_quota Verification & Asset Linking (Issue 1) ---');
  // Reserve 2 images for customer1
  await setSession(customer1Id, 'authenticated', customer1Email);
  const resToken = 'res_token_exact_link_test_1';
  await db.query(`
    SELECT public.reserve_media_quota(
      '${customer1Id}'::UUID,
      2,
      'image',
      '${resToken}'
    );
  `);

  // Quota reserved check
  const quotaBefore = await db.query(`
    SELECT pictures_reserved, pictures_used 
    FROM public.usage_quotas 
    WHERE user_id = '${customer1Id}' AND month_year = public.get_current_blantyre_month();
  `);
  assert(quotaBefore.rows[0].pictures_reserved >= 2, 'Quota reservation allocated 2 pictures in reserved balance');

  // Create an upload request for this reservation
  await resetToSuperuser(); // finalize-request edge function runs as service_role
  const reqRes = await db.query(`
    INSERT INTO public.upload_requests (
      request_code,
      user_id,
      reservation_token,
      customer_name,
      customer_email,
      customer_phone,
      package_id,
      package_name,
      media_type,
      media_count
    ) VALUES (
      'BRZ-TEST-LINK-1',
      '${customer1Id}',
      '${resToken}',
      'Customer One',
      '${customer1Email}',
      '+265991112233',
      'premium',
      'Premium',
      'image',
      2
    ) RETURNING id;
  `);
  const targetRequestId = reqRes.rows[0].id;

  // Customer attempts to invoke finalize_media_quota directly -> MUST FAIL with permission/access denied (Issue 2)
  await setSession(customer1Id, 'authenticated', customer1Email);
  let custFinalizeBlocked = false;
  try {
    await db.query(`SELECT public.finalize_media_quota('${resToken}', '${targetRequestId}'::UUID);`);
  } catch (err: any) {
    custFinalizeBlocked = err.message.toLowerCase().includes('permission denied') || err.message.toLowerCase().includes('access denied');
  }
  assert(custFinalizeBlocked, 'Direct customer invocation of finalize_media_quota is strictly blocked (Issue 2)');

  // Try finalization as backend service_role BEFORE assets are inserted -> MUST FAIL
  await resetToSuperuser();
  const failNoAssets = await db.query(`
    SELECT public.finalize_media_quota('${resToken}', '${targetRequestId}'::UUID) as res;
  `);
  assert(failNoAssets.rows[0].res.success === false, 'Finalization rejected when no assets exist for this specific request');

  // Insert only 1 asset (mismatch count: reserved 2, but only 1 uploaded)
  const asset1Res = await db.query(`
    INSERT INTO public.media_assets (
      request_id,
      user_id,
      cloudinary_public_id,
      resource_type,
      secure_url,
      original_filename
    ) VALUES (
      '${targetRequestId}',
      '${customer1Id}',
      'breezing_hd_status/c1/photo_1',
      'image',
      'https://res.cloudinary.com/test/image/upload/v1/photo_1.jpg',
      'status_1.jpg'
    ) RETURNING id;
  `);
  const asset1Id = asset1Res.rows[0].id;

  const failCountMismatch = await db.query(`
    SELECT public.finalize_media_quota('${resToken}', '${targetRequestId}'::UUID) as res;
  `);
  assert(failCountMismatch.rows[0].res.success === false, 'Finalization rejected when asset count (1) does not match reserved count (2)');

  // Insert 2nd asset with empty Cloudinary ID -> MUST FAIL Cloudinary confirmation
  const asset2Res = await db.query(`
    INSERT INTO public.media_assets (
      request_id,
      user_id,
      cloudinary_public_id,
      resource_type,
      secure_url,
      original_filename
    ) VALUES (
      '${targetRequestId}',
      '${customer1Id}',
      '', -- invalid Cloudinary public ID
      'image',
      'https://res.cloudinary.com/test/image/upload/v1/photo_2.jpg',
      'status_2.jpg'
    ) RETURNING id;
  `);
  const asset2Id = asset2Res.rows[0].id;

  const failInvalidCloudinary = await db.query(`
    SELECT public.finalize_media_quota('${resToken}', '${targetRequestId}'::UUID) as res;
  `);
  assert(failInvalidCloudinary.rows[0].res.success === false, 'Finalization rejected when Cloudinary public ID confirmation is missing');

  // Fix 2nd asset to have valid Cloudinary public ID
  await db.query(`
    UPDATE public.media_assets
    SET cloudinary_public_id = 'breezing_hd_status/c1/photo_2'
    WHERE id = '${asset2Id}';
  `);

  // Now finalize -> MUST SUCCEED
  const finalSuccess = await db.query(`
    SELECT public.finalize_media_quota('${resToken}', '${targetRequestId}'::UUID) as res;
  `);
  assert(finalSuccess.rows[0].res.success === true, 'Finalization succeeds when exact request, file count, media type, ownership, and Cloudinary confirmation are verified');

  // Check quota balance shift: pictures_reserved decreased, pictures_used increased
  const quotaAfter = await db.query(`
    SELECT pictures_reserved, pictures_used 
    FROM public.usage_quotas 
    WHERE user_id = '${customer1Id}' AND month_year = public.get_current_blantyre_month();
  `);
  assert(
    quotaAfter.rows[0].pictures_used >= 2 &&
    quotaAfter.rows[0].pictures_reserved === quotaBefore.rows[0].pictures_reserved - 2,
    'Quota atomically shifted from reserved balance to used balance'
  );

  // Check reservation status and request_id linking
  const resRecord = await db.query(`SELECT status, request_id FROM public.quota_reservations WHERE reservation_token = '${resToken}';`);
  assert(
    resRecord.rows[0].status === 'finalized' &&
    resRecord.rows[0].request_id === targetRequestId,
    'Reservation marked finalized and linked directly to request_id'
  );

  // Idempotency: call finalize again with same token
  const idempotentRes = await db.query(`
    SELECT public.finalize_media_quota('${resToken}', '${targetRequestId}'::UUID) as res;
  `);
  assert(idempotentRes.rows[0].res.already_finalized === true, 'Repeated finalization returns idempotent success');

  // TEST 7: Scheduled Cleanup & Cloudinary Deletion Status Handling (Issue 6)
  console.log('\n--- TEST SUITE 7: Scheduled Cleanup & Cloudinary Deletion Status (Issue 6) ---');
  await resetToSuperuser();

  // Test failure recording with real Cloudinary error message
  await db.query(`
    SELECT public.record_asset_deletion_result(
      '${asset1Id}'::UUID,
      false,
      'Cloudinary API 404: Resource not found'
    );
  `);
  const asset1AfterFail = await db.query(`SELECT deletion_status, deletion_attempts, last_deletion_error FROM public.media_assets WHERE id = '${asset1Id}';`);
  assert(
    asset1AfterFail.rows[0].deletion_status === 'failed' &&
    asset1AfterFail.rows[0].deletion_attempts === 1 &&
    asset1AfterFail.rows[0].last_deletion_error === 'Cloudinary API 404: Resource not found',
    'Failed deletion records exact Cloudinary error and increments attempt count'
  );

  // Test success recording with Cloudinary confirmation on asset 1
  await db.query(`
    SELECT public.record_asset_deletion_result(
      '${asset1Id}'::UUID,
      true,
      NULL
    );
  `);
  const asset1AfterSuccess = await db.query(`SELECT deletion_status, is_deleted, deleted_at, last_deletion_error FROM public.media_assets WHERE id = '${asset1Id}';`);
  assert(
    asset1AfterSuccess.rows[0].deletion_status === 'deleted' &&
    asset1AfterSuccess.rows[0].is_deleted === true &&
    asset1AfterSuccess.rows[0].deleted_at !== null &&
    asset1AfterSuccess.rows[0].last_deletion_error === null,
    'Successful deletion marks asset deleted, records deleted_at timestamp, and clears error'
  );

  // Delete remaining asset 2 -> verify request status transitions to 'expired'
  await db.query(`
    SELECT public.record_asset_deletion_result(
      '${asset2Id}'::UUID,
      true,
      NULL
    );
  `);
  const reqAfterAllDeleted = await db.query(`SELECT status FROM public.upload_requests WHERE id = '${targetRequestId}';`);
  assert(reqAfterAllDeleted.rows[0].status === 'expired', 'Upload request automatically marked expired once all assets are confirmed deleted in Cloudinary');

  // Customer attempts to invoke downgrade_expired_subscriptions directly -> MUST FAIL (Issue 2)
  await setSession(customer1Id, 'authenticated', customer1Email);
  let custDowngradeBlocked = false;
  try {
    await db.query(`SELECT public.downgrade_expired_subscriptions();`);
  } catch (err: any) {
    custDowngradeBlocked = err.message.toLowerCase().includes('permission denied') || err.message.toLowerCase().includes('access denied');
  }
  assert(custDowngradeBlocked, 'Direct customer invocation of downgrade_expired_subscriptions is strictly blocked (Issue 2)');

  // Customer attempts to invoke get_failed_deletion_assets directly -> MUST FAIL (Issue 2)
  let custFailedAssetsBlocked = false;
  try {
    await db.query(`SELECT * FROM public.get_failed_deletion_assets(10);`);
  } catch (err: any) {
    custFailedAssetsBlocked = true;
  }
  assert(custFailedAssetsBlocked, 'Direct customer invocation of get_failed_deletion_assets is strictly blocked (Issue 2)');

  // Expired subscription maintenance routine test via backend service_role
  await resetToSuperuser();
  const downgradeCount = await db.query(`SELECT public.downgrade_expired_subscriptions() as count;`);
  assert(typeof downgradeCount.rows[0].count === 'number', 'downgrade_expired_subscriptions() routine executes cleanly via service_role');

  // TEST 8: Scheduled Cleanup, NULL auth.role() Immunity & Vault Incident Logging
  console.log('\n--- TEST SUITE 8: Scheduled Maintenance, NULL Role Immunity & Vault Logging ---');

  // A. Customer attempts to call get_expired_assets_for_cleanup -> BLOCKED
  await setSession(customer1Id, 'authenticated', customer1Email);
  let custExpiredAssetsBlocked = false;
  try {
    await db.query(`SELECT * FROM public.get_expired_assets_for_cleanup(10);`);
  } catch (err: any) {
    custExpiredAssetsBlocked = err.message.toLowerCase().includes('permission denied') || err.message.toLowerCase().includes('access denied');
  }
  assert(custExpiredAssetsBlocked, 'Direct customer invocation of get_expired_assets_for_cleanup is strictly blocked');

  // B. Customer attempts to invoke invoke_cleanup_expired_media -> BLOCKED
  let custInvokeBlocked = false;
  try {
    await db.query(`SELECT public.invoke_cleanup_expired_media();`);
  } catch (err: any) {
    custInvokeBlocked = err.message.toLowerCase().includes('permission denied') || err.message.toLowerCase().includes('access denied');
  }
  assert(custInvokeBlocked, 'Direct customer invocation of invoke_cleanup_expired_media is strictly blocked');

  // C. Anonymous visitor attempts to invoke invoke_cleanup_expired_media -> BLOCKED
  await setSession(null, 'anon');
  let anonInvokeBlocked = false;
  try {
    await db.query(`SELECT public.invoke_cleanup_expired_media();`);
  } catch (err: any) {
    anonInvokeBlocked = err.message.toLowerCase().includes('permission denied') || err.message.toLowerCase().includes('access denied');
  }
  assert(anonInvokeBlocked, 'Anonymous visitor invocation of invoke_cleanup_expired_media is strictly blocked');

  // D. NULL auth.role() in uninitialized session context -> CANNOT BYPASS SECURITY
  // Simulate an unprivileged session where auth.role() evaluates to NULL
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.role = ''; SET request.jwt.claim.sub = '';`);
  let nullRoleExpiredBlocked = false;
  try {
    await db.query(`SELECT * FROM public.get_expired_assets_for_cleanup(10);`);
  } catch (err: any) {
    nullRoleExpiredBlocked = err.message.toLowerCase().includes('permission denied') || err.message.toLowerCase().includes('access denied');
  }
  assert(nullRoleExpiredBlocked, 'NULL auth.role() cannot bypass security in get_expired_assets_for_cleanup');

  let nullRoleInvokeBlocked = false;
  try {
    await db.query(`SELECT public.invoke_cleanup_expired_media();`);
  } catch (err: any) {
    nullRoleInvokeBlocked = err.message.toLowerCase().includes('permission denied') || err.message.toLowerCase().includes('access denied');
  }
  assert(nullRoleInvokeBlocked, 'NULL auth.role() cannot bypass security in invoke_cleanup_expired_media');

  // E. Genuine PostgreSQL Scheduled Job / pg_cron Session (session_user = 'postgres' or service_role)
  // When executed without configured Supabase Vault secrets:
  // Must return success: false with status: 'missing_vault_credentials' AND record audit log entry!
  await resetToSuperuser();
  const cronRes: any = await db.query(`SELECT public.invoke_cleanup_expired_media() as res;`);
  const cronOutput = cronRes.rows[0].res;
  assert(
    cronOutput.success === false && cronOutput.status === 'missing_vault_credentials',
    'invoke_cleanup_expired_media reports missing Vault credentials as failure (not a fake success)',
    `Returned status: ${cronOutput.status}`
  );

  // Verify that an audit incident was logged in admin_audit_logs
  const auditLogs = await db.query(`
    SELECT action, target_type, target_id, details 
    FROM public.admin_audit_logs 
    WHERE action = 'cleanup_missing_vault_credentials'
    ORDER BY created_at DESC 
    LIMIT 1;
  `);
  assert(
    auditLogs.rows.length === 1 && auditLogs.rows[0].target_id === 'vault',
    'Missing Vault credentials incident is explicitly recorded in admin_audit_logs'
  );

  // F. Backend service_role calling get_expired_assets_for_cleanup
  await setSession(null, 'service_role');
  const serviceAssets = await db.query(`SELECT * FROM public.get_expired_assets_for_cleanup(10);`);
  assert(Array.isArray(serviceAssets.rows), 'service_role can legitimately query get_expired_assets_for_cleanup');

  // 5. Final Summary
  console.log('\n===============================================================');
  console.log(`   TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===============================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
