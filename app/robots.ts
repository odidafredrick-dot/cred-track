import type { MetadataRoute } from "next";

const siteUrl = "https://hol-wa.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/privacy", "/terms", "/policy"],
        disallow: [
          "/admin",
          "/api",
          "/dashboard",
          "/dev",
          "/profile",
          "/signup",
          "/creditors",
          "/suppliers",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
