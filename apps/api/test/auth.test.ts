import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminToken, call, login, makeApp, PASSWORD, signup, uniqueEmail, type TestApp } from "./helpers.js";

let t: TestApp;

beforeAll(async () => {
  t = await makeApp();
});

afterAll(async () => {
  await t.close();
});

describe("conta", () => {
  it("cria aluno, devolve token e permissões de aluno", async () => {
    const { body } = await signup(t.app);
    const user = body.user as { roles: string[]; permissions: string[] };
    expect(user.roles).toEqual(["aluno"]);
    expect(user.permissions).toEqual(["lessons.read", "practice.sync"]);
  });

  it("recusa e-mail repetido sem diferenciar maiúsculas", async () => {
    const email = uniqueEmail("dup");
    await signup(t.app, { email });
    const again = await call(t.app, "POST", "/auth/signup", null, {
      name: "Outra",
      email: email.toUpperCase(),
      password: PASSWORD,
      accountType: "aluno",
      acceptTerms: true,
    });
    expect(again.statusCode).toBe(409);
  });

  it("exige aceitar os termos e senha de 10 caracteres", async () => {
    const response = await call(t.app, "POST", "/auth/signup", null, {
      name: "Sem termos",
      email: uniqueEmail("x"),
      password: "curta",
      accountType: "aluno",
    });
    expect(response.statusCode).toBe(400);
    expect(Object.keys(response.json().error.fields)).toEqual(expect.arrayContaining(["password", "acceptTerms"]));
  });

  it("criança de até 12 anos precisa do responsável", async () => {
    const birthYear = new Date().getUTCFullYear() - 10;
    const blocked = await call(t.app, "POST", "/auth/signup", null, {
      name: "Criança",
      email: uniqueEmail("kid"),
      password: PASSWORD,
      accountType: "aluno",
      acceptTerms: true,
      birthYear,
    });
    expect(blocked.json().error.code).toBe("responsavel-obrigatorio");
    await signup(t.app, { birthYear, guardianName: "Mãe Teste", guardianEmail: uniqueEmail("mae"), guardianConsent: true });
  });

  it("professor precisa ter 18 anos e fica pendente até aprovação", async () => {
    const young = await call(t.app, "POST", "/auth/signup", null, {
      name: "Jovem",
      email: uniqueEmail("jovem"),
      password: PASSWORD,
      accountType: "professor",
      acceptTerms: true,
      birthYear: new Date().getUTCFullYear() - 16,
    });
    expect(young.json().error.code).toBe("idade-professor");
    const { body, token } = await signup(t.app, { accountType: "professor", email: uniqueEmail("pend") });
    expect((body.user as { teacherApplication: string }).teacherApplication).toBe("pending");
    expect((await call(t.app, "GET", "/teacher/classes", token)).statusCode).toBe(403);
  });

  it("login errado não diz se o e-mail existe", async () => {
    const { email } = await signup(t.app);
    const wrongPassword = await call(t.app, "POST", "/auth/login", null, { email, password: "outra-senha-qualquer" });
    const noUser = await call(t.app, "POST", "/auth/login", null, { email: "ninguem@exemplo.com", password: "outra-senha-qualquer" });
    expect(wrongPassword.statusCode).toBe(401);
    expect(noUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(noUser.json());
  });

  it("logout revoga o token", async () => {
    const { token } = await signup(t.app);
    expect((await call(t.app, "POST", "/auth/logout", token)).statusCode).toBe(204);
    expect((await call(t.app, "GET", "/auth/me", token)).statusCode).toBe(401);
  });

  it("trocar a senha encerra as outras sessões e mantém a atual", async () => {
    const { token, email } = await signup(t.app);
    const other = await login(t.app, email);
    const changed = await call(t.app, "POST", "/auth/password", token, { currentPassword: PASSWORD, newPassword: "nova-senha-longa-2" });
    expect(changed.statusCode).toBe(204);
    expect((await call(t.app, "GET", "/auth/me", token)).statusCode).toBe(200);
    expect((await call(t.app, "GET", "/auth/me", other)).statusCode).toBe(401);
  });

  it("código de redefinição do admin troca a senha uma vez só", async () => {
    const admin = await adminToken(t);
    const { id, email } = await signup(t.app);
    const { code } = (await call(t.app, "POST", `/admin/users/${id}/reset-code`, admin.token)).json();
    const reset = { email, code: code.toLowerCase(), newPassword: "redefinida-123" };
    expect((await call(t.app, "POST", "/auth/reset", null, reset)).statusCode).toBe(204);
    expect((await call(t.app, "POST", "/auth/reset", null, reset)).statusCode).toBe(400);
    await login(t.app, email, "redefinida-123");
  });

  it("exporta os dados e apaga a conta com a senha", async () => {
    const { token } = await signup(t.app);
    const exported = await call(t.app, "GET", "/auth/export", token);
    expect(exported.headers["content-disposition"]).toContain("attachment");
    expect(exported.json().profile.email).toBeTruthy();
    expect((await call(t.app, "DELETE", "/auth/account", token, { password: "errada-errada" })).statusCode).toBe(400);
    expect((await call(t.app, "DELETE", "/auth/account", token, { password: PASSWORD })).statusCode).toBe(204);
    expect((await call(t.app, "GET", "/auth/me", token)).statusCode).toBe(401);
  });

  it("cadastro fechado só aceita convite", async () => {
    const admin = await adminToken(t);
    await call(t.app, "PUT", "/admin/settings", admin.token, { signupOpen: false });
    const closed = await call(t.app, "POST", "/auth/signup", null, {
      name: "Fechado",
      email: uniqueEmail("f"),
      password: PASSWORD,
      accountType: "aluno",
      acceptTerms: true,
    });
    expect(closed.statusCode).toBe(403);
    const { code } = (await call(t.app, "POST", "/admin/invites", admin.token, { role: "professor" })).json();
    const { body } = await signup(t.app, { accountType: "professor", inviteCode: code, email: uniqueEmail("conv") });
    expect((body.user as { roles: string[] }).roles).toContain("professor");
    expect((await call(t.app, "POST", "/auth/signup", null, { name: "X", email: uniqueEmail("y"), password: PASSWORD, accountType: "aluno", acceptTerms: true, inviteCode: code })).statusCode).toBe(400);
    await call(t.app, "PUT", "/admin/settings", admin.token, { signupOpen: true });
  });

  it("rotas protegidas pedem login", async () => {
    expect((await call(t.app, "GET", "/me/lessons")).statusCode).toBe(401);
    expect((await call(t.app, "GET", "/admin/users", "token-falso")).statusCode).toBe(401);
  });
});

describe("limite de tentativas", () => {
  it("bloqueia login depois do limite", async () => {
    const strict = await makeApp({ RATE_LIMIT_AUTH_MAX: "3" });
    try {
      const attempt = () => call(strict.app, "POST", "/auth/login", null, { email: "a@exemplo.com", password: "qualquer-coisa" });
      for (let i = 0; i < 3; i += 1) expect((await attempt()).statusCode).toBe(401);
      const blocked = await attempt();
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe("muitas-tentativas");
    } finally {
      await strict.close();
    }
  });
});
