import { expect, test } from "@playwright/test";

import { ADMIN, ALUNO, PROFESSORA } from "./contas";
import { criarConta, entrar, novaPagina } from "./passos";

const AVISO = "Quinta que vem a aula começa 18h15. Tragam a breu.";
const MATERIAL = "Partituras Suzuki no IMSLP";
const TAREFA = "Semana 1 — Lá maior, uma oitava";
const RECADO = "Toquei todos os dias; o Dó# ainda sai baixo.";
const RETORNO = "Ótimo, Tomás. Abra o terceiro dedo e confira com a nota pedal.";
const EXERCICIO = "scales.1oct.69";
const EXERCICIO_TITULO = "Lá maior - uma oitava";

test("professora e aluno: aprovação, turma, tarefa, material, prática e retorno", async ({ browser }) => {
  const professora = await novaPagina(browser);
  const admin = await novaPagina(browser);
  const aluno = await novaPagina(browser);

  await test.step("a professora pede a conta e fica aguardando aprovação", async () => {
    await criarConta(professora, PROFESSORA, "Sou professor", { bio: "Ensino violino há 12 anos no conservatório municipal." });
    await professora.goto("/voce/conta");
    await expect(professora.getByText(/aguardando|análise|aprova/i).first()).toBeVisible();
  });

  await test.step("a coordenação aprova a professora", async () => {
    await entrar(admin, ADMIN);
    await admin.goto("/admin/professores");
    const pedido = admin.getByRole("listitem").filter({ hasText: PROFESSORA.name });
    await pedido.getByRole("button", { name: "Aprovar" }).click();
    await expect(admin.getByRole("status")).toContainText(`${PROFESSORA.name} agora é professor`);
    await expect(pedido).toHaveCount(0);
  });

  let codigo = "";
  await test.step("a professora cria a turma e pega o código", async () => {
    await professora.reload();
    await professora.goto("/professor");
    await professora.getByRole("button", { name: "Nova turma" }).click();
    await professora.getByLabel("Nome da turma").fill("Violino iniciante — quinta 18h");
    await professora.getByRole("button", { name: "Criar turma" }).click();
    const codigoNaTela = professora.getByLabel(/^Código [A-Z0-9 ]+$/);
    await expect(codigoNaTela).toBeVisible();
    codigo = (await codigoNaTela.innerText()).trim();
    expect(codigo).toMatch(/^[A-Z0-9]{6}$/);
  });

  await test.step("o aluno cria a conta já com o código da turma", async () => {
    await criarConta(aluno, ALUNO, "Sou aluno", { classCode: codigo });
    await aluno.goto("/aulas/turmas");
    await expect(aluno.getByText("Violino iniciante — quinta 18h").first()).toBeVisible();
  });

  await test.step("a professora publica um aviso e o aluno lê", async () => {
    await professora.getByLabel("Novo aviso para a turma").fill(AVISO);
    await professora.getByRole("button", { name: "Publicar aviso" }).click();
    await expect(professora.getByText(AVISO)).toBeVisible();
    await aluno.reload();
    await expect(aluno.getByText(AVISO)).toBeVisible();
  });

  await test.step("a professora compartilha um link com a turma", async () => {
    await professora.goto("/professor/materiais");
    await professora.getByRole("button", { name: "Novo material" }).first().click();
    await professora.getByRole("radio", { name: "Link" }).click();
    await professora.getByLabel("Título", { exact: true }).fill(MATERIAL);
    await professora.getByLabel("Endereço").fill("https://imslp.org/wiki/Category:Suzuki,_Shinichi");
    await professora.getByRole("checkbox", { name: /Violino iniciante/ }).check();
    await professora.getByRole("button", { name: "Salvar material" }).click();
    await expect(professora.getByText(MATERIAL).first()).toBeVisible();
    await aluno.goto("/aulas/materiais");
    await expect(aluno.getByText(MATERIAL)).toBeVisible();
  });

  await test.step("a professora passa uma tarefa para a turma", async () => {
    await professora.goto("/professor/tarefas/nova");
    await professora.getByLabel("Para quem").selectOption({ label: "Violino iniciante — quinta 18h" });
    await professora.getByLabel("Título", { exact: true }).fill(TAREFA);
    await professora.getByLabel("Instruções").fill("Três vezes por dia, devagar, com a nota pedal em Lá.");
    await professora.getByRole("button", { name: "Passar tarefa" }).click();
    await expect(professora).toHaveURL(/\/professor\/tarefas\/[^/]+$/);
  });

  await test.step("o aluno faz a tarefa e deixa um recado", async () => {
    await aluno.goto("/aulas");
    await expect(aluno.getByText(TAREFA)).toBeVisible();
    await aluno.getByLabel("Recado para o professor (opcional)").fill(RECADO);
    await aluno.getByRole("button", { name: "Marcar como feita" }).click();
    await expect(aluno.getByRole("status")).toContainText("marcada como feita");
    await expect(aluno.getByText("Tudo em dia.")).toBeVisible();
  });

  await test.step("o aluno toca uma escala (jogador sintético, sem som); a prática segue sozinha", async () => {
    await aluno.goto(`/tocar/${EXERCICIO}?jogador=sintetico`);
    await aluno.getByRole("button", { name: "Estou de fone" }).click();
    await aluno.getByRole("button", { name: "Começar" }).click();
    const resultado = aluno.getByRole("region", { name: "Resultado" });
    await expect(resultado).toBeVisible({ timeout: 90_000 });
    await expect(resultado.getByText("XP ganho")).toBeVisible();
    await expect(resultado.getByRole("region", { name: "Falta pouco" })).toBeVisible();
  });

  await test.step("o aluno vê a patente e as medalhas agrupadas no progresso", async () => {
    await aluno.goto("/voce");
    await aluno.getByRole("link", { name: /^Patente Primeiro arco/ }).click();
    const patente = aluno.getByRole("group", { name: "Sua patente" });
    await expect(patente).toContainText("Primeiro arco");
    await expect(patente).toContainText(/Faltam? \d+ medalhas? para Aprendiz de estante\./);
    await expect(aluno.getByRole("heading", { name: "Técnica e afinação" })).toBeVisible();
  });

  await test.step("a professora vê a tarefa feita, o recado e a prática, e responde", async () => {
    await professora.reload();
    await expect(professora.getByText(/Feita em/)).toBeVisible();
    await expect(professora.getByText(RECADO)).toBeVisible();
    await professora.getByLabel("Seu retorno").fill(RETORNO);
    await professora.getByRole("button", { name: "Enviar retorno" }).click();
    await expect(professora.getByText(/Último retorno em/)).toBeVisible();
    await professora.getByRole("link", { name: ALUNO.name }).click();
    await expect(professora.getByText("Exercícios tocados", { exact: true })).toBeVisible();
    await expect(professora.getByText(EXERCICIO_TITULO).first()).toBeVisible();
  });

  await test.step("o envio manual já não tem nada novo: o automático chegou antes", async () => {
    await aluno.goto("/voce/conta");
    await aluno.getByRole("button", { name: "Enviar prática agora" }).click();
    await expect(aluno.getByText("Nada novo para enviar.")).toBeVisible();
  });

  await test.step("o aluno lê o retorno da professora", async () => {
    await aluno.goto("/aulas");
    await aluno.getByRole("button", { name: "Ver as feitas (1, 1 com retorno)" }).click();
    await expect(aluno.getByText(/Retorno do professor/)).toBeVisible();
    await expect(aluno.getByText(RETORNO)).toBeVisible();
  });
});
