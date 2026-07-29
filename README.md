# Cred Track

A Next.js application for credit tracking, allowing shops to text people who have picked items from their shop.

## Project Structure

This project uses:
- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Firebase Auth** for authentication

### Key Files Explained:

1. **`package.json`** - Defines project dependencies and scripts
   - `npm run dev` - Start development server
   - `npm run build` - Build for production
   - `npm start` - Start production server

2. **`tsconfig.json`** - TypeScript configuration
   - Enables strict type checking
   - Sets up path aliases (`@/*` points to root)

3. **`tailwind.config.ts`** - Tailwind CSS configuration
   - Configures which files Tailwind should scan for classes
   - Defines custom theme colors

4. **`postcss.config.mjs`** - PostCSS configuration
   - Processes Tailwind CSS and adds vendor prefixes

5. **`app/`** - App Router directory (Next.js 13+)
   - `layout.tsx` - Root layout component (wraps all pages)
   - `page.tsx` - Login page (root page)
   - `signup/page.tsx` - Sign up page
   - `dashboard/page.tsx` - Protected dashboard page
   - `globals.css` - Global styles with Tailwind directives

6. **`lib/firebase.ts`** - Firebase client app configuration
7. **`lib/auth-client.ts`** - Firebase Auth client utilities
8. **`app/api/firebase-user/route.ts`** - Syncs Firebase users into the app database

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   Copy `.env.example` to `.env.local` and fill in your values:
   ```env
   DATABASE_URL=your_neon_database_url
   NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
   AFRICAS_TALKING_USERNAME=your_africas_talking_username
   AFRICAS_TALKING_API_KEY=your_africas_talking_api_key
   AFRICAS_TALKING_SENDER_ID=your_sender_id
   DARAJA_CONSUMER_KEY=your_daraja_consumer_key
   DARAJA_CONSUMER_SECRET=your_daraja_consumer_secret
   DARAJA_PASSKEY=your_daraja_passkey
   DARAJA_SHORTCODE=your_paybill_shortcode
   DARAJA_TILL_NUMBER=your_till_number_if_using_buy_goods
   DARAJA_STORE_NUMBER=your_store_number_if_safaricom_provides_one
   DARAJA_CALLBACK_URL=https://your-domain.com/api/credits/webhook
   MPESA_CALLBACK_TOKEN=your_private_callback_token
   DARAJA_LIVE=false
   DARAJA_BASE_URL=
   DARAJA_TRANSACTION_TYPE=
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Authentication

The app includes:
- **Login page** (root page `/`) with phone/password and Google sign-in through Firebase
- **Sign up page** (`/signup`) with phone/password and Google sign-up through Firebase
- **Protected dashboard** (`/dashboard`) - requires authentication

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel setup, required environment variables, Firebase authorized domains, and the later Render/Cloud Run backend split plan.

## Next Steps

We'll build the credit tracking system step by step, allowing shops to:
- Track items picked by customers
- Send text messages to customers
- Manage credit records
