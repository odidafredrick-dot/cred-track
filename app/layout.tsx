import type { Metadata } from "next";
import AuthRedirectHandler from "./auth-redirect-handler";
import PwaRegister from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://hol-wa.com"),
  title: {
    default: "Holwa - Credit Tracking for Kenyan Businesses",
    template: "%s | Holwa",
  },
  description:
    "Holwa helps Kenyan businesses track goods and services credit, customer balances, stock, supplier orders, M-Pesa payments, and payment reminders.",
  applicationName: "Holwa",
  keywords: [
    "Holwa",
    "Hol-wa",
    "credit tracking Kenya",
    "business credit records",
    "customer debt tracking",
    "supplier credit management",
    "M-Pesa payment reminders",
    "stock and credit app",
  ],
  authors: [{ name: "Holwa" }],
  creator: "Holwa",
  publisher: "Holwa",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Holwa - Credit Tracking for Kenyan Businesses",
    description:
      "Track goods and services credit, customer balances, stock, supplier orders, M-Pesa payments, and reminders in one Holwa workspace.",
    url: "https://hol-wa.com",
    siteName: "Holwa",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "Holwa logo",
      },
    ],
    locale: "en_KE",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Holwa - Credit Tracking for Kenyan Businesses",
    description:
      "Track goods and services credit, customer balances, stock, supplier orders, M-Pesa payments, and reminders.",
    images: ["/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Holwa",
  },
  formatDetection: {
    telephone: true,
  },
  icons: {
    icon: [
      { url: "/logo.jpeg", type: "image/jpeg" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#1d4ed8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthRedirectHandler />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
