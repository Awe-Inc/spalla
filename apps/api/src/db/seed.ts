import { ADMIN_ROLE, ALL_PERMISSIONS, SYSTEM_ROLES } from "../auth/permissions.js";
import type { Queryable } from "./db.js";

export interface Settings {
  signupOpen: boolean;
  teacherApprovalRequired: boolean;
  platformName: string;
  supportEmail: string;
}

export const DEFAULT_SETTINGS: Settings = {
  signupOpen: true,
  teacherApprovalRequired: true,
  platformName: "Fretless",
  supportEmail: "",
};

export async function seed(db: Queryable): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const existing = await db.query<{ id: string }>("SELECT id FROM roles WHERE key = $1", [role.key]);
    if (existing[0]) {
      if (role.key === ADMIN_ROLE) await grantAll(db, existing[0].id);
      continue;
    }
    const [created] = await db.query<{ id: string }>(
      "INSERT INTO roles (key, name, description, built_in) VALUES ($1, $2, $3, true) RETURNING id",
      [role.key, role.name, role.description],
    );
    for (const permission of role.permissions) {
      await db.query("INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2)", [created!.id, permission]);
    }
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.query("INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING", [key, JSON.stringify(value)]);
  }
}

async function grantAll(db: Queryable, roleId: string): Promise<void> {
  for (const permission of ALL_PERMISSIONS) {
    await db.query("INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING", [roleId, permission]);
  }
}

export async function readSettings(db: Queryable): Promise<Settings> {
  const rows = await db.query<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const stored = Object.fromEntries(rows.filter((row) => row.key in DEFAULT_SETTINGS).map((row) => [row.key, row.value]));
  return { ...DEFAULT_SETTINGS, ...stored };
}
