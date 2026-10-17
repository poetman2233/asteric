import { PublicFooter, PublicNav } from "@/components/public/PublicChrome";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <PublicNav />
      <main id="main">{children}</main>
      <PublicFooter />
    </>
  );
}
