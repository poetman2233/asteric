/**
 * Role-based access control. One table, used by every server action and page.
 * Shared with the client only to decide what to *show*; the server always re-checks.
 */
export const ROLES = ["owner", "admin", "attorney", "analyst", "viewer", "demo"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Organization owner",
  admin: "Administrator",
  attorney: "Partner / Attorney",
  analyst: "Analyst / Operations",
  viewer: "Read only",
  demo: "Demo viewer",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: "Full access, including organization deletion, data export and ownership.",
  admin: "Full product and team access except deletion and ownership changes.",
  attorney: "Views matters and analytics; records and revises predictions and outcomes.",
  analyst: "Manages imports and matter data; views analytics. Cannot record predictions.",
  viewer: "Can inspect permitted data. Cannot change anything.",
  demo: "Synthetic demonstration workspace. Predictions are a resettable sandbox.",
};

const ALL: Role[] = [...ROLES];
export const PERMISSIONS = {
  "analytics.view": ALL,
  "matters.view": ALL,
  "matters.edit": ["owner", "admin", "analyst", "attorney"],
  "events.create": ["owner", "admin", "attorney", "analyst", "demo"],
  "decisions.record": ["owner", "admin", "attorney", "demo"],
  "inbox.act": ["owner", "admin", "attorney", "analyst", "demo"],
  "rules.manage": ["owner", "admin", "demo"],
  "intake.record": ["owner", "admin", "attorney", "analyst", "demo"],
  "outcomes.record": ["owner", "admin", "attorney", "analyst"],
  "predictions.create": ["owner", "admin", "attorney"],
  "predictions.sandbox": ["demo"],
  "imports.view": ["owner", "admin", "analyst", "attorney", "viewer", "demo"],
  "imports.manage": ["owner", "admin", "analyst"],
  "imports.preview": ["demo"],
  "team.view": ["owner", "admin", "attorney", "analyst", "viewer"],
  "team.manage": ["owner", "admin"],
  "org.manage": ["owner", "admin"],
  "org.delete": ["owner"],
  "data.export": ["owner", "admin"],
  "audit.view": ["owner", "admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Roles an actor may assign. Only owners may create owners; nobody assigns "demo". */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "owner") return ["owner", "admin", "attorney", "analyst", "viewer"];
  if (actor === "admin") return ["admin", "attorney", "analyst", "viewer"];
  return [];
}
