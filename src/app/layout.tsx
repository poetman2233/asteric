import type { Metadata, Viewport } from "next";
import "@/styles/app.css";

export const metadata: Metadata = {
  title: { default: "Asteric", template: "%s · Asteric" },
  description: "Decision intelligence for contingency litigation.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};

/**
 * Every page is rendered per request so Next.js can attach the per-request CSP nonce
 * (set in src/proxy.ts) to its scripts. A prerendered page would have its scripts blocked.
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
