import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminToken, call, makeApp, signup, teacher, type TestApp } from "./helpers.js";

let t: TestApp;
let ana: { token: string; id: string };
let bruno: { token: string; id: string };
let classId: string;
let joinCode: string;
let student: { token: string; id: string };

const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(200, 32), Buffer.from("\n%%EOF")]);

function multipart(fields: Record<string, string>, file: { name: string; data: Buffer; type: string }) {
  const boundary = "----fretless" + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
  parts.push(file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function uploadPdf(token: string, fields: Record<string, string>, data = PDF) {
  const body = multipart(fields, { name: "Estudo nº 1.pdf", data, type: "application/pdf" });
  return t.app.inject({ method: "POST", url: "/teacher/materials/pdf", payload: body.payload, headers: { ...body.headers, authorization: `Bearer ${token}` } });
}

beforeAll(async () => {
  t = await makeApp();
  const admin = await adminToken(t);
  ana = await teacher(t, admin.token);
  bruno = await teacher(t, admin.token);
  const created = (await call(t.app, "POST", "/teacher/classes", ana.token, { name: "Turma de terça" })).json();
  classId = created.id;
  joinCode = created.joinCode;
  const account = await signup(t.app, { classCode: joinCode.toLowerCase() });
  student = { token: account.token, id: account.id };
});

afterAll(async () => {
  await t.close();
});

describe("turmas", () => {
  it("aluno entra pelo código e aparece para a professora", async () => {
    const detail = (await call(t.app, "GET", `/teacher/classes/${classId}`, ana.token)).json();
    expect(detail.students.map((row: { id: string }) => row.id)).toEqual([student.id]);
    expect((await call(t.app, "GET", "/me/classes", student.token)).json()[0].name).toBe("Turma de terça");
  });

  it("outro professor não vê a turma nem o aluno", async () => {
    expect((await call(t.app, "GET", `/teacher/classes/${classId}`, bruno.token)).statusCode).toBe(404);
    expect((await call(t.app, "GET", `/teacher/students/${student.id}/progress`, bruno.token)).statusCode).toBe(404);
    expect((await call(t.app, "GET", "/teacher/students", bruno.token)).json()).toEqual([]);
    const sneaky = await call(t.app, "POST", "/teacher/assignments", bruno.token, { title: "Invasão", studentId: student.id });
    expect(sneaky.statusCode).toBe(404);
    const viaClass = await call(t.app, "POST", "/teacher/assignments", bruno.token, { title: "Invasão", classId });
    expect(viaClass.statusCode).toBe(404);
  });

  it("aluno não acessa rotas de professor", async () => {
    expect((await call(t.app, "POST", "/teacher/classes", student.token, { name: "Minha" })).statusCode).toBe(403);
  });

  it("novo código invalida o antigo", async () => {
    const other = (await call(t.app, "POST", "/teacher/classes", ana.token, { name: "Sábado" })).json();
    const { joinCode: fresh } = (await call(t.app, "POST", `/teacher/classes/${other.id}/code`, ana.token)).json();
    expect(fresh).not.toBe(other.joinCode);
    const late = await signup(t.app);
    expect((await call(t.app, "POST", "/me/classes/join", late.token, { code: other.joinCode })).statusCode).toBe(400);
    expect((await call(t.app, "POST", "/me/classes/join", late.token, { code: fresh })).statusCode).toBe(201);
  });
});

describe("tarefas, materiais e planos", () => {
  it("tarefa da turma chega ao aluno, que marca feita, e a professora responde", async () => {
    const created = await call(t.app, "POST", "/teacher/assignments", ana.token, {
      title: "Escala de Lá maior",
      instructions: "Devagar, com afinador.",
      dueOn: "2026-11-05",
      classId,
      items: [{ kind: "exercicio", title: "Lá maior", playPath: "/tocar/scales.1oct.69", bpm: 60 }],
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const lessons = (await call(t.app, "GET", "/me/lessons", student.token)).json();
    expect(lessons.assignments.map((row: { id: string }) => row.id)).toContain(id);
    expect((await call(t.app, "PUT", `/me/assignments/${id}/status`, student.token, { done: true, note: "Fiz 3 vezes" })).statusCode).toBe(200);
    await call(t.app, "PUT", `/teacher/assignments/${id}/students/${student.id}/feedback`, ana.token, { feedback: "Ótimo!" });
    const detail = (await call(t.app, "GET", `/teacher/assignments/${id}`, ana.token)).json();
    expect(detail.students[0]).toMatchObject({ studentNote: "Fiz 3 vezes", feedback: "Ótimo!" });
    expect(detail.students[0].doneAt).toBeTruthy();
    const after = (await call(t.app, "GET", "/me/lessons", student.token)).json();
    expect(after.assignments.find((row: { id: string }) => row.id === id).feedback).toBe("Ótimo!");
  });

  it("link de tocar fora do app é recusado", async () => {
    const response = await call(t.app, "POST", "/teacher/assignments", ana.token, {
      title: "Link estranho",
      classId,
      items: [{ kind: "exercicio", title: "X", playPath: "https://malicioso.example/tocar" }],
    });
    expect(response.statusCode).toBe(400);
  });

  it("tarefa precisa de turma ou aluno, nunca os dois", async () => {
    expect((await call(t.app, "POST", "/teacher/assignments", ana.token, { title: "Nada" })).statusCode).toBe(400);
    expect((await call(t.app, "POST", "/teacher/assignments", ana.token, { title: "Os dois", classId, studentId: student.id })).statusCode).toBe(400);
  });

  it("aluno de outra turma não vê a tarefa", async () => {
    const outsider = await signup(t.app);
    const lessons = (await call(t.app, "GET", "/me/lessons", outsider.token)).json();
    expect(lessons.assignments).toEqual([]);
  });

  it("PDF compartilhado com a turma abre para o aluno e não para estranhos", async () => {
    const upload = await uploadPdf(ana.token, { title: "Estudo de arco", classIds: classId });
    expect(upload.statusCode).toBe(201);
    const lessons = (await call(t.app, "GET", "/me/lessons", student.token)).json();
    const material = lessons.materials.find((row: { id: string }) => row.id === upload.json().id);
    expect(material.kind).toBe("pdf");
    const file = await call(t.app, "GET", `/files/${material.fileId}`, student.token);
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(file.headers["content-disposition"]).toContain("inline");
    expect(file.rawPayload.equals(PDF)).toBe(true);
    const outsider = await signup(t.app);
    expect((await call(t.app, "GET", `/files/${material.fileId}`, outsider.token)).statusCode).toBe(404);
    expect((await call(t.app, "GET", `/files/${material.fileId}`, bruno.token)).statusCode).toBe(404);
  });

  it("arquivo que não é PDF é recusado", async () => {
    const response = await uploadPdf(ana.token, { title: "Falso" }, Buffer.from("<html>nada</html>"));
    expect(response.json().error.code).toBe("nao-e-pdf");
  });

  it("não compartilha material com turma de outro professor", async () => {
    const response = await uploadPdf(bruno.token, { title: "Intruso", classIds: classId });
    expect(response.json().error.code).toBe("turma-invalida");
  });

  it("material anexado só à tarefa individual também abre para aquele aluno", async () => {
    const upload = (await uploadPdf(ana.token, { title: "Só para um" })).json();
    await call(t.app, "POST", "/teacher/assignments", ana.token, { title: "Leitura", studentId: student.id, materialIds: [upload.id] });
    const lessons = (await call(t.app, "GET", "/me/lessons", student.token)).json();
    const material = lessons.materials.find((row: { id: string }) => row.id === upload.id);
    expect((await call(t.app, "GET", `/files/${material.fileId}`, student.token)).statusCode).toBe(200);
  });

  it("apagar o material tira o arquivo e a referência da tarefa", async () => {
    const upload = (await uploadPdf(ana.token, { title: "Temporário", classIds: classId })).json();
    const assignment = (await call(t.app, "POST", "/teacher/assignments", ana.token, { title: "Com anexo", classId, materialIds: [upload.id] })).json();
    expect((await call(t.app, "DELETE", `/teacher/materials/${upload.id}`, ana.token)).statusCode).toBe(204);
    const detail = (await call(t.app, "GET", `/teacher/assignments/${assignment.id}`, ana.token)).json();
    expect(detail.materialIds).toEqual([]);
  });

  it("plano de estudo da turma aparece para o aluno", async () => {
    const created = await call(t.app, "POST", "/teacher/plans", ana.token, {
      name: "Rotina da semana",
      classId,
      blocks: [{ type: "aquecimento", goal: "tempo", goalValue: 5, durationMinutes: 5 }],
    });
    expect(created.statusCode).toBe(201);
    const lessons = (await call(t.app, "GET", "/me/lessons", student.token)).json();
    expect(lessons.plans[0].name).toBe("Rotina da semana");
    expect(lessons.plans[0].blocks[0].type).toBe("aquecimento");
  });

  it("aviso da turma chega ao aluno", async () => {
    await call(t.app, "POST", `/teacher/classes/${classId}/announcements`, ana.token, { body: "Sem aula na sexta." });
    const lessons = (await call(t.app, "GET", "/me/lessons", student.token)).json();
    expect(lessons.announcements[0].body).toBe("Sem aula na sexta.");
  });
});

describe("prática", () => {
  const result = (clientId: string, playedAt = new Date().toISOString()) => ({
    clientId,
    exerciseId: "scales.1oct.69",
    playedAt,
    accuracyPct: 88,
    meanSignedCents: -6,
    bpm: 60,
    stars: 2,
    durationSeconds: 120,
  });

  it("envio repetido não duplica e a professora vê o resumo", async () => {
    const first = await call(t.app, "POST", "/me/practice", student.token, { results: [result("a1"), result("a2")] });
    expect(first.json()).toMatchObject({ received: 2, inserted: 2 });
    const again = await call(t.app, "POST", "/me/practice", student.token, { results: [result("a1"), result("a2"), result("a3")] });
    expect(again.json()).toMatchObject({ received: 3, inserted: 1 });
    const progress = (await call(t.app, "GET", `/teacher/students/${student.id}/progress?days=7`, ana.token)).json();
    expect(progress.practice.totalMinutes).toBe(6);
    expect(progress.practice.exercises[0]).toMatchObject({ exerciseId: "scales.1oct.69", plays: 3, stars: 2 });
  });

  it("descarta resultado com data no futuro", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const response = await call(t.app, "POST", "/me/practice", student.token, { results: [result("f1", future)] });
    expect(response.json()).toMatchObject({ inserted: 0, rejected: 1 });
  });

  it("professor sem aluno não envia prática", async () => {
    expect((await call(t.app, "POST", "/me/practice", bruno.token, { results: [] })).statusCode).toBe(403);
  });
});
