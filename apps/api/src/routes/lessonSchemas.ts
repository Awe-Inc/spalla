import { z } from "zod";

import { playPath, shortText, title } from "../http/schemas.js";

export const BLOCK_KINDS = ["aquecimento", "afinacao", "escalas", "tecnica", "estudo", "peca-nova", "revisao", "leitura", "livre"] as const;
export const BLOCK_GOALS = ["tempo", "repeticoes-limpas", "estrelas", "uma-vez"] as const;
export const MAX_ITEMS = 20;

export const assignmentItem = z.object({
  kind: z.enum(["exercicio", "peca", "texto"]),
  title,
  ref: shortText(120).optional(),
  playPath: playPath.optional(),
  bpm: z.number().int().min(20).max(240).optional(),
  minutes: z.number().int().min(1).max(120).optional(),
  stars: z.number().int().min(1).max(3).optional(),
  note: shortText(500).optional(),
});

export const planBlock = z.object({
  type: z.enum(BLOCK_KINDS),
  itemId: shortText(120).default(""),
  itemTitle: shortText(120).optional(),
  itemPath: playPath.optional(),
  goal: z.enum(BLOCK_GOALS),
  goalValue: z.number().int().min(1).max(10),
  variation: shortText(200).optional(),
  durationMinutes: z.number().int().min(1).max(30),
});

const uuidList = z.array(z.uuid()).max(MAX_ITEMS);

const assignmentFields = {
  title,
  instructions: shortText(4000).default(""),
  dueOn: z.iso.date("Use uma data no formato AAAA-MM-DD.").nullable().optional(),
  items: z.array(assignmentItem).max(MAX_ITEMS).default([]),
  materialIds: uuidList.default([]),
};

export const assignmentCreate = z
  .object({ ...assignmentFields, classId: z.uuid().optional(), studentId: z.uuid().optional() })
  .refine((body) => Boolean(body.classId) !== Boolean(body.studentId), "Escolha uma turma ou um aluno.");

export const assignmentPatch = z.object({
  title: assignmentFields.title.optional(),
  instructions: shortText(4000).optional(),
  dueOn: assignmentFields.dueOn,
  items: z.array(assignmentItem).max(MAX_ITEMS).optional(),
  materialIds: uuidList.optional(),
});

const planFields = {
  name: title,
  description: shortText(2000).default(""),
  blocks: z.array(planBlock).min(1, "Coloque pelo menos um bloco.").max(MAX_ITEMS),
};

export const planCreate = z
  .object({ ...planFields, classId: z.uuid().optional(), studentId: z.uuid().optional() })
  .refine((body) => Boolean(body.classId) !== Boolean(body.studentId), "Escolha uma turma ou um aluno.");

export const planPatch = z.object({
  name: title.optional(),
  description: shortText(2000).optional(),
  blocks: planFields.blocks.optional(),
});
