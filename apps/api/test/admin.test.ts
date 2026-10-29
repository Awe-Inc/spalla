import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminToken, call, login, makeApp, PASSWORD, signup, uniqueEmail, type TestApp } from "./helpers.js";

let t: TestApp;
let admin: { token: string; id: string };

beforeAll(async () => {
  t = await makeApp();
  admin = await adminToken(t);
});

afterAll(async () => {
  await t.close();
});

async function supportToken(): Promise<{ token: string; id: string }> {
  const account = await signup(t.app);
  await call(t.app, "PUT", `/admin/users/${account.id}/roles`, admin.token, { roles: ["suporte"] });
  return { token: account.token, id: account.id };
}

describe("admin", () => {
  it("lista e filtra usuários com paginação", async () => {
    const { email } = await signup(t.app, { name: "Fulana Filtrável", email: uniqueEmail("filtro") });
    const response = await call(t.app, "GET", `/admin/users?q=${encodeURIComponent("Filtrável")}&limit=5`, admin.token);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.items[0].email).toBe(email);
  });

  it("aluno não entra no admin", async () => {
    const { token } = await signup(t.app);
    expect((await call(t.app, "GET", "/admin/users", token)).statusCode).toBe(403);
    expect((await call(t.app, "GET", "/admin/stats", token)).statusCode).toBe(403);
  });

  it("suporte lê usuários e aprova professor, mas não mexe em papéis", async () => {
    const support = await supportToken();
    expect((await call(t.app, "GET", "/admin/users", support.token)).statusCode).toBe(200);
    const pending = await signup(t.app, { accountType: "professor", email: uniqueEmail("pend") });
    const applications = (await call(t.app, "GET", "/admin/teacher-applications", support.token)).json();
    expect(applications.map((row: { id: string }) => row.id)).toContain(pending.id);
    expect((await call(t.app, "POST", `/admin/teachers/${pending.id}/approve`, support.token)).statusCode).toBe(200);
    expect((await call(t.app, "GET", "/teacher/classes", pending.token)).statusCode).toBe(200);
    expect((await call(t.app, "PUT", `/admin/users/${pending.id}/roles`, support.token, { roles: [] })).statusCode).toBe(403);
    expect((await call(t.app, "POST", "/admin/roles", support.token, { name: "Qualquer", permissions: [] })).statusCode).toBe(403);
  });

  it("ninguém dá permissão que não tem", async () => {
    const role = await call(t.app, "POST", "/admin/roles", admin.token, {
      name: "Gestor de pessoas",
      permissions: ["users.read", "users.manage", "invites.manage"],
    });
    expect(role.statusCode).toBe(201);
    const manager = await signup(t.app);
    await call(t.app, "PUT", `/admin/users/${manager.id}/roles`, admin.token, { roles: [role.json().key] });
    const victim = await signup(t.app);
    const escalate = await call(t.app, "PUT", `/admin/users/${victim.id}/roles`, manager.token, { roles: ["admin"] });
    expect(escalate.statusCode).toBe(403);
    const self = await call(t.app, "PUT", `/admin/users/${manager.id}/roles`, manager.token, { roles: [role.json().key, "admin"] });
    expect(self.statusCode).toBe(403);
    const invite = await call(t.app, "POST", "/admin/invites", manager.token, { role: "admin" });
    expect(invite.statusCode).toBe(403);
    const allowed = await call(t.app, "POST", "/admin/invites", manager.token, { role: role.json().key });
    expect(allowed.statusCode).toBe(201);
  });

  it("quem gerencia pessoas não toma a conta de quem tem mais permissões", async () => {
    const role = await call(t.app, "POST", "/admin/roles", admin.token, { name: "Atendimento", permissions: ["users.read", "users.manage"] });
    const manager = await signup(t.app);
    await call(t.app, "PUT", `/admin/users/${manager.id}/roles`, admin.token, { roles: [role.json().key] });
    const support = await supportToken();
    const reset = await call(t.app, "POST", `/admin/users/${support.id}/reset-code`, manager.token);
    expect(reset.statusCode).toBe(403);
    const email = await call(t.app, "PATCH", `/admin/users/${support.id}`, manager.token, { email: uniqueEmail("tomada") });
    expect(email.statusCode).toBe(403);
    expect((await call(t.app, "PATCH", `/admin/users/${support.id}`, manager.token, { status: "suspended" })).statusCode).toBe(403);
    expect((await call(t.app, "POST", `/admin/users/${support.id}/revoke-sessions`, manager.token)).statusCode).toBe(403);
    expect((await call(t.app, "PATCH", `/admin/users/${admin.id}`, manager.token, { name: "Outro" })).statusCode).toBe(403);
    const student = await signup(t.app);
    expect((await call(t.app, "POST", `/admin/users/${student.id}/reset-code`, manager.token)).statusCode).toBe(200);
    expect((await call(t.app, "PATCH", `/admin/users/${manager.id}`, manager.token, { name: "Eu mesmo" })).statusCode).toBe(200);
  });

  it("aprovação de professor só vale para pedido pendente e nunca para si", async () => {
    const support = await supportToken();
    const self = await call(t.app, "POST", `/admin/teachers/${support.id}/approve`, support.token);
    expect(self.statusCode).toBe(400);
    const student = await signup(t.app);
    const notPending = await call(t.app, "POST", `/admin/teachers/${student.id}/approve`, support.token);
    expect(notPending.statusCode).toBe(409);
    expect((await call(t.app, "GET", "/teacher/classes", student.token)).statusCode).toBe(403);
  });

  it("papel novo com permissão inexistente é recusado", async () => {
    const response = await call(t.app, "POST", "/admin/roles", admin.token, { name: "Estranho", permissions: ["tudo.liberado"] });
    expect(response.statusCode).toBe(400);
  });

  it("permissões do admin não mudam e papéis do sistema não se apagam", async () => {
    const roles = (await call(t.app, "GET", "/admin/roles", admin.token)).json() as { id: string; key: string }[];
    const adminRole = roles.find((role) => role.key === "admin")!;
    const studentRole = roles.find((role) => role.key === "aluno")!;
    expect((await call(t.app, "PATCH", `/admin/roles/${adminRole.id}`, admin.token, { permissions: [] })).statusCode).toBe(400);
    expect((await call(t.app, "DELETE", `/admin/roles/${studentRole.id}`, admin.token)).statusCode).toBe(400);
  });

  it("o último admin ativo não pode ser rebaixado, suspenso nem apagado", async () => {
    const solo = await makeApp();
    try {
      const only = await adminToken(solo);
      const demote = await call(solo.app, "PUT", `/admin/users/${only.id}/roles`, only.token, { roles: [] });
      expect(demote.json().error.code).toBe("ultimo-admin");
      const deleteSelf = await call(solo.app, "DELETE", "/auth/account", only.token, { password: PASSWORD });
      expect(deleteSelf.statusCode).toBe(409);
      const second = await adminToken(solo);
      expect((await call(solo.app, "PATCH", `/admin/users/${only.id}`, second.token, { status: "suspended" })).statusCode).toBe(200);
      expect((await call(solo.app, "GET", "/auth/me", only.token)).statusCode).toBe(401);
      const lastOne = await call(solo.app, "DELETE", "/auth/account", second.token, { password: PASSWORD });
      expect(lastOne.json().error.code).toBe("ultimo-admin");
      const demoteLast = await call(solo.app, "PUT", `/admin/users/${second.id}/roles`, second.token, { roles: [] });
      expect(demoteLast.json().error.code).toBe("ultimo-admin");
    } finally {
      await solo.close();
    }
  });

  it("suspender derruba as sessões e impede o login", async () => {
    const { id, email, token } = await signup(t.app);
    expect((await call(t.app, "PATCH", `/admin/users/${id}`, admin.token, { status: "suspended" })).statusCode).toBe(200);
    expect((await call(t.app, "GET", "/auth/me", token)).statusCode).toBe(401);
    const blocked = await call(t.app, "POST", "/auth/login", null, { email, password: PASSWORD });
    expect(blocked.json().error.code).toBe("conta-suspensa");
    await call(t.app, "PATCH", `/admin/users/${id}`, admin.token, { status: "active" });
    await login(t.app, email);
  });

  it("registra auditoria das ações", async () => {
    const { id } = await signup(t.app);
    await call(t.app, "POST", `/admin/users/${id}/revoke-sessions`, admin.token);
    const audit = (await call(t.app, "GET", `/admin/audit?targetId=${id}`, admin.token)).json();
    expect(audit.items.map((row: { action: string }) => row.action)).toEqual(expect.arrayContaining(["conta.criada", "usuario.sessoes-encerradas"]));
  });

  it("estatísticas e configurações", async () => {
    const stats = (await call(t.app, "GET", "/admin/stats", admin.token)).json();
    expect(stats.users).toBeGreaterThan(0);
    const settings = await call(t.app, "PUT", "/admin/settings", admin.token, { platformName: "Spalla Escola", supportEmail: "" });
    expect(settings.json().platformName).toBe("Spalla Escola");
  });
});
