import type { SignupInput } from "@/api/types";

export const MIN_PASSWORD_LENGTH = 10;
export const GUARDIAN_AGE = 12;
export const ADULT_AGE = 18;

export function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getUTCFullYear() - birthYear;
}

export function needsGuardian(birthYear: number | undefined, now: Date = new Date()): boolean {
  return birthYear !== undefined && ageFromBirthYear(birthYear, now) <= GUARDIAN_AGE;
}

export interface SignupDraft {
  name: string;
  email: string;
  password: string;
  accountType: "aluno" | "professor";
  classCode: string;
  inviteCode: string;
  teacherBio: string;
  birthYear: string;
  guardianName: string;
  guardianEmail: string;
  guardianConsent: boolean;
  acceptTerms: boolean;
}

export const EMPTY_SIGNUP: SignupDraft = {
  name: "",
  email: "",
  password: "",
  accountType: "aluno",
  classCode: "",
  inviteCode: "",
  teacherBio: "",
  birthYear: "",
  guardianName: "",
  guardianEmail: "",
  guardianConsent: false,
  acceptTerms: false,
};

export type SignupErrors = Partial<Record<keyof SignupDraft, string>>;

function parsedBirthYear(draft: SignupDraft): number | undefined {
  const value = Number(draft.birthYear);
  return draft.birthYear.trim() !== "" && Number.isInteger(value) ? value : undefined;
}

export function validateSignup(draft: SignupDraft, now: Date = new Date()): SignupErrors {
  const errors: SignupErrors = {};
  if (draft.name.trim().length < 2) errors.name = "Escreva o nome com pelo menos 2 letras.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) errors.email = "Confira o e-mail.";
  if (draft.password.length < MIN_PASSWORD_LENGTH) errors.password = `A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  const birthYear = parsedBirthYear(draft);
  if (draft.birthYear.trim() !== "" && (birthYear === undefined || ageFromBirthYear(birthYear, now) < 3 || birthYear < 1900)) {
    errors.birthYear = "Confira o ano de nascimento.";
  }
  if (draft.accountType === "professor") {
    if (birthYear === undefined) errors.birthYear = "Informe o ano de nascimento: conta de professor é para maiores de 18 anos.";
    else if (ageFromBirthYear(birthYear, now) < ADULT_AGE) errors.birthYear = "Conta de professor é só para maiores de 18 anos.";
  }
  if (needsGuardian(birthYear, now)) {
    if (draft.guardianName.trim().length < 2) errors.guardianName = "Escreva o nome do responsável.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.guardianEmail.trim())) errors.guardianEmail = "Confira o e-mail do responsável.";
    if (!draft.guardianConsent) errors.guardianConsent = "O responsável precisa autorizar.";
  }
  if (!draft.acceptTerms) errors.acceptTerms = "Aceite os termos para criar a conta.";
  return errors;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function toSignupInput(draft: SignupDraft, now: Date = new Date()): SignupInput {
  const birthYear = parsedBirthYear(draft);
  const guardian = needsGuardian(birthYear, now);
  const input: SignupInput = {
    name: draft.name.trim(),
    email: draft.email.trim().toLowerCase(),
    password: draft.password,
    accountType: draft.accountType,
    acceptTerms: true,
  };
  const classCode = draft.accountType === "aluno" ? optionalText(draft.classCode) : undefined;
  const inviteCode = optionalText(draft.inviteCode);
  const teacherBio = draft.accountType === "professor" ? optionalText(draft.teacherBio) : undefined;
  return {
    ...input,
    ...(classCode ? { classCode } : {}),
    ...(inviteCode ? { inviteCode } : {}),
    ...(teacherBio ? { teacherBio } : {}),
    ...(birthYear !== undefined ? { birthYear } : {}),
    ...(guardian ? { guardianName: draft.guardianName.trim(), guardianEmail: draft.guardianEmail.trim().toLowerCase(), guardianConsent: draft.guardianConsent } : {}),
  };
}
