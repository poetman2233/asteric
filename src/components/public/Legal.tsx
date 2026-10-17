import Link from "next/link";
import { site } from "@/lib/site";

export function ContactLine({ kind = "general" }: { kind?: "general" | "security" }) {
  const email = kind === "security" ? site.securityEmail || site.contactEmail : site.contactEmail;
  return email ? <a className="link" href={`mailto:${email}`}>{email}</a> : <Link className="link" href="/contact">our contact form</Link>;
}
