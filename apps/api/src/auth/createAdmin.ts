import type { Queryable } from "../db/db.js";
import { emailField, nameField, passwordField } from "../http/schemas.js";
import { hashPassword } from "./password.js";
import { ADMIN_ROLE } from "./permissions.js";

export async function createAdmin(db: Queryable, input: { email: string; name: string; password: string }): Promise<"criado" | "promovido"> {
  const email = emailField.parse(input.email);
  const [role] = await db.query<{ id: string }>("SELECT id FROM roles WHERE key = $1", [ADMIN_ROLE]);
  if (!role) throw new Error("Papel admin não existe. Rode as migrações antes.");
  const [existing] = await db.query<{ id: string }>("SELECT id FROM users WHERE lower(email) = $1", [email]);
  if (existing) {
    await db.query("UPDATE users SET status = 'active' WHERE id = $1", [existing.id]);
    await db.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [existing.id, role.id]);
    return "promovido";
  }
  const [user] = await db.query<{ id: string }>("INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id", [
    email,
    nameField.parse(input.name),
    await hashPassword(passwordField.parse(input.password)),
  ]);
  await db.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [user!.id, role.id]);
  return "criado";
}
