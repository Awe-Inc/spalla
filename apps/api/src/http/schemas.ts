import { z } from "zod";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../auth/password.js";

export const nameField = z.string().trim().min(2, "Escreva o nome com pelo menos 2 letras.").max(80, "O nome passa de 80 caracteres.");
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .pipe(z.email("Esse e-mail não parece válido."));
export const passwordField = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .max(MAX_PASSWORD_LENGTH, "A senha é longa demais.");
export const shortText = (max: number) => z.string().trim().max(max, `Passa de ${max} caracteres.`);
export const title = z.string().trim().min(1, "Dê um título.").max(120, "O título passa de 120 caracteres.");

export const idParams = z.object({ id: z.uuid("Identificador inválido.") });
export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const playPath = z
  .string()
  .max(300)
  .regex(/^\/tocar\/[A-Za-z0-9._~%:/-]+$/, "O caminho precisa apontar para uma tela de tocar do app.");

export const httpUrl = z
  .string()
  .trim()
  .max(500)
  .pipe(z.url({ protocol: /^https?$/, error: "Use um link http ou https." }));
