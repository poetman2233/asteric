import type { Metadata, Viewport } from "next";
import "@/styles/app.css";

export const metadata: Metadata = {
  title: { default: "Asteric", template: "%s · Asteric" },
  description: "Decision intelligence for contingency litigation.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
