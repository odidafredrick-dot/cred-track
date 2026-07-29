# Deployment

## Current Recommended Setup

Deploy this repository as one full-stack Next.js app on Vercel.

The app currently uses Next.js API routes under `app/api/*`, so the frontend and backend are still in the same project. This is the simplest stable setup for now. A Render or Cloud Run backend should be split out later when the API is moved into a standalone service.

## Vercel

1. Push the repository to GitHub.
2. Import `https://github.com/odidafredrick-dot/cred-track` in Vercel.
3. Use the default Next.js framework settings.
4. Add the environment variables from `.env.example`.
5. Deploy.

Build command:

```bash
npm run build
```

Install command:

```bash
npm install
```

## Required Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

```env
DATABASE_URL=

NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

AFRICAS_TALKING_USERNAME=
AFRICAS_TALKING_API_KEY=
AFRICAS_TALKING_SENDER_ID=

DARAJA_CONSUMER_KEY=
DARAJA_CONSUMER_SECRET=
DARAJA_PASSKEY=
DARAJA_SHORTCODE=
DARAJA_TILL_NUMBER=
DARAJA_STORE_NUMBER=
DARAJA_CALLBACK_URL=https://YOUR_VERCEL_DOMAIN/api/credits/webhook
MPESA_CALLBACK_TOKEN=
DARAJA_LIVE=false
DARAJA_BASE_URL=
DARAJA_TRANSACTION_TYPE=
```

Optional, only if you intentionally want to enable the dev setup endpoint in a protected production environment:

```env
DEV_SETUP_SECRET=
```

## Firebase Auth

In Firebase Console -> Authentication -> Sign-in method, enable:

- Email/Password
- Google

In Firebase Console -> Authentication -> Settings -> Authorized domains, add your Vercel domain after deployment.

Examples:

```txt
your-project.vercel.app
your-custom-domain.com
```

## Database

The app uses Neon Postgres through Prisma. Vercel needs `DATABASE_URL` set to the Neon pooled connection string.

Migrations are already committed in `prisma/migrations`. Apply them to Neon before or after deployment with:

```bash
npx prisma migrate deploy
```

The Vercel build runs `prisma generate` through `npm run build`.

## Daraja M-Pesa Callback

Set the Daraja callback URL to:

```txt
https://YOUR_VERCEL_DOMAIN/api/credits/webhook
```

If `MPESA_CALLBACK_TOKEN` is set, the app automatically appends it to the callback URL when creating an STK push:

```txt
https://YOUR_VERCEL_DOMAIN/api/credits/webhook?token=YOUR_TOKEN
```

Use the same `DARAJA_CALLBACK_URL` and `MPESA_CALLBACK_TOKEN` values in Vercel.

## Later: Render Backend

To split frontend and backend:

1. Move `app/api/*` logic into a standalone backend app.
2. Deploy that backend to Render.
3. Add `NEXT_PUBLIC_API_BASE_URL=https://YOUR_RENDER_SERVICE.onrender.com` to Vercel.
4. Replace frontend fetch calls from `/api/...` to `${NEXT_PUBLIC_API_BASE_URL}/...`.
5. Configure CORS on the Render backend for the Vercel domain.

The same backend can later be moved to Cloud Run with the frontend still calling `NEXT_PUBLIC_API_BASE_URL`.
