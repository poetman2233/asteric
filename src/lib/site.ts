/**
 * Public, non-secret site configuration. Edit here (or via the NEXT_PUBLIC_ variables)
 * to change contact details shown on public pages. No address, incorporation details,
 * customers or certifications are stated anywhere on the site.
 */
export const site = {
  name: "Asteric",
  /** Optional. When empty, public pages direct people to the in-app contact form. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  securityEmail: process.env.NEXT_PUBLIC_SECURITY_EMAIL ?? "",
  legalEntity: process.env.NEXT_PUBLIC_LEGAL_ENTITY ?? "Asteric",
  governingLaw: process.env.NEXT_PUBLIC_GOVERNING_LAW ?? "",
};
