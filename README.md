<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/5d7245d6-62ab-4795-9b50-7cd5c0e2cb87

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Cloudflare Workers from GitHub

Commit `wrangler.toml` at the repository root with its `[assets]` section enabled.
Wrangler serves the Vite output from `./dist` and falls back to `index.html` for
single-page application navigation. Commenting out `[assets]` causes the
"Missing entry-point to Worker script or to assets directory" deployment error.

Use these Cloudflare build settings:

- Root directory: `/`
- Build command: `bun run build` (or `npm run build`)
- Deploy command: `npx wrangler deploy`
- Worker name: match the `name` in `wrangler.toml` to the connected Cloudflare Worker.

Under Cloudflare **Build variables**, set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` using the frontend values in `.env.example`.
Set `VITE_CLOUDINARY_CLOUD_NAME` if using a different Cloudinary account.
Vite embeds these values during the build; adding Worker runtime variables alone
does not configure the frontend. Backend secrets belong in Supabase Edge Function
secrets, not in `VITE_` variables.

Push the configuration to the connected GitHub branch, then retry the deployment.
To check deployment packaging locally without publishing:

```sh
npx wrangler deploy --dry-run
```
