import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { transform } from 'esbuild';

// Exercise the actual handler with isolated Auth/RPC responses and fake secrets.
const source = (await readFile(new URL('../supabase/functions/sign-cloudinary-upload/index.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\s*$/gm, '');
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
const env = { SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'test', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret', CLOUDINARY_CLOUD_NAME: 'test-cloud' };
env.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({ default: 'test-current-publishable-key' });
let handler;
let validUser = true;
let reserved;
let reserveError = null;
let receivedToken;
let receivedKey;
const createClient = (_url, key) => {
  receivedKey = key;
  return {
  auth: { getUser: async token => {
    receivedToken = token;
    const verified = validUser && token === 'fake-test-token';
    return { data: { user: verified ? { id: 'test-user' } : null }, error: verified ? null : { message: 'invalid' } };
  } },
  rpc: async (_, params) => {
    reserved = params;
    return { data: { success: !reserveError }, error: reserveError };
  },
};
};
new Function('serve', 'createClient', 'crypto', 'Deno', code)(fn => { handler = fn; }, createClient, webcrypto, { env: { get: name => env[name] } });
const request = (body, auth = true) => new Request('https://test.invalid', { method: 'POST', headers: auth ? { Authorization: 'Bearer fake-test-token', 'Content-Type': 'application/json' } : {}, body: JSON.stringify(body) });
const preflight = await handler(new Request('https://test.invalid', { method: 'OPTIONS' }));
assert.equal(preflight.status, 200);
assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
assert.equal((await handler(request({}, false))).status, 401);
validUser = false;
assert.equal((await handler(request({}))).status, 401);
validUser = true;
const secret = env.CLOUDINARY_API_SECRET;
delete env.CLOUDINARY_API_SECRET;
assert.equal((await handler(request({}))).status, 503);
assert.equal(reserved, undefined, 'Missing configuration must not reserve quota');
env.CLOUDINARY_API_SECRET = secret;
const signed = await handler(request({ mediaType: 'image', count: 3, reservationToken: 'existing-batch' }));
assert.equal(signed.status, 200);
assert.equal(receivedToken, 'fake-test-token', 'A server request must verify the caller token explicitly');
assert.equal(receivedKey, 'test-current-publishable-key', 'Use current publishable keys before deprecated legacy keys');
const data = await signed.json();
assert.equal(reserved.p_count, 3);
assert.equal(reserved.p_reservation_token, 'existing-batch', 'Signing must reuse the original batch reservation');
assert.equal(data.signature, createHash('sha1').update(`folder=${data.folder}&timestamp=${data.timestamp}${secret}`).digest('hex'));
reserveError = { message: 'Quota exceeded' };
assert.equal((await handler(request({ mediaType: 'image', count: 3, reservationToken: 'existing-batch' }))).status, 400);
console.log('Upload signing regression checks passed: CORS, authentication, configuration, batch reservation, signature, quota rejection.');
