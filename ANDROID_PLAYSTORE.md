# Android and Play Store Release

Holwa is a Next.js app, so the recommended Android path is a Progressive Web App wrapped with a Trusted Web Activity.

## Before Packaging

1. Deploy the production app to Vercel or a custom domain.
2. Add the production domain to Firebase Authentication authorized domains.
3. Set all production environment variables in the host:
   - `DATABASE_URL`
   - Firebase public keys
   - Africa's Talking keys
   - Daraja M-Pesa keys and callback token
4. Run database migrations against production:

```bash
npx prisma migrate deploy
```

5. Confirm these URLs work in production:
   - `/manifest.webmanifest`
   - `/sw.js`
   - `/icon-192.png`
   - `/icon-512.png`

## Android Wrapper

Use Bubblewrap to create a Trusted Web Activity wrapper after the production URL is live:

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR_DOMAIN/manifest.webmanifest
bubblewrap build
```

Use the generated Android App Bundle for Play Console. Do not upload until the TWA verification passes.

## Digital Asset Links

After the Android package name and signing certificate fingerprint are known, create:

```txt
public/.well-known/assetlinks.json
```

The file must reference the real package name and SHA-256 signing certificate fingerprint. Bubblewrap can help generate the correct contents.

## Play Console Checklist

- Google Play developer account.
- App name: Holwa.
- Short and full descriptions.
- App icon from `public/icon-512.png`.
- Phone screenshots from the production app.
- Privacy policy URL.
- Data Safety form for account data, phone numbers, payments, SMS/reminder processing, and analytics if enabled.
- Content rating questionnaire.
- Closed testing if required for your Play Console account.

As of August 31, 2026, new Google Play Android apps and updates must target Android 16 / API 36 or higher unless Google grants an extension.
