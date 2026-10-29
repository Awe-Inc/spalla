import type { Invite, Permission, TeacherApplication, UserStatus } from "@/api/types";

export const STATUS_LABELS: Record<UserStatus, string> = { active: "Ativa", suspended: "Suspensa" };

export const APPLICATION_LABELS: Record<TeacherApplication, string> = {
  pending: "Professor em análise",
  approved: "Professor aprovado",
  rejected: "Pedido recusado",
};

const ACTION_LABELS: Record<string, string> = {
  "configuracoes.alteradas": "Configurações alteradas",
  "conta.apagada": "Conta apagada pelo dono",
  "conta.criada": "Conta criada",
  "convite.criado": "Convite criado",
  "convite.revogado": "Convite revogado",
  "login.falhou": "Tentativa de entrada falhou",
  "material.apagado": "Material apagado",
  "material.criado": "Material criado",
  "material.pdf-enviado": "PDF enviado",
  "papel.apagado": "Papel apagado",
  "papel.criado": "Papel criado",
  "papel.editado": "Papel editado",
  "plano.criado": "Plano de estudo criado",
  "professor.aprovado": "Professor aprovado",
  "professor.recusado": "Pedido de professor recusado",
  "senha.redefinida": "Senha redefinida com código",
  "senha.trocada": "Senha trocada",
  "tarefa.arquivada": "Tarefa apagada",
  "tarefa.criada": "Tarefa criada",
  "turma.aluno-removido": "Aluno removido da turma",
  "turma.criada": "Turma criada",
  "turma.entrou": "Aluno entrou na turma",
  "turma.saiu": "Aluno saiu da turma",
  "usuario.apagado": "Usuário apagado",
  "usuario.codigo-redefinicao": "Código de redefinição gerado",
  "usuario.editado": "Usuário editado",
  "usuario.papeis": "Papéis alterados",
  "usuario.reativado": "Conta reativada",
  "usuario.sessoes-encerradas": "Sessões encerradas",
  "usuario.suspenso": "Conta suspensa",
};

export const AUDIT_ACTION_GROUPS: readonly { prefix: string; label: string }[] = [
  { prefix: "usuario.", label: "Usuários" },
  { prefix: "professor.", label: "Professores" },
  { prefix: "papel.", label: "Papéis" },
  { prefix: "convite.", label: "Convites" },
  { prefix: "login.", label: "Entradas" },
  { prefix: "senha.", label: "Senhas" },
  { prefix: "conta.", label: "Contas" },
  { prefix: "turma.", label: "Turmas" },
  { prefix: "tarefa.", label: "Tarefas" },
  { prefix: "material.", label: "Materiais" },
  { prefix: "plano.", label: "Planos" },
  { prefix: "configuracoes.", label: "Configurações" },
];

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export type InviteState = "active" | "used" | "expired" | "revoked";

export const INVITE_STATE_LABELS: Record<InviteState, string> = { active: "Ativo", used: "Esgotado", expired: "Vencido", revoked: "Revogado" };

export function inviteState(invite: Pick<Invite, "revokedAt" | "expiresAt" | "uses" | "maxUses">, now: number = Date.now()): InviteState {
  if (invite.revokedAt) return "revoked";
  if (invite.uses >= invite.maxUses) return "used";
  if (Date.parse(invite.expiresAt) <= now) return "expired";
  return "active";
}

export const PERMISSION_GROUPS: readonly { label: string; permissions: readonly Permission[] }[] = [
  { label: "Administração", permissions: ["users.read", "users.manage", "roles.manage", "invites.manage", "teachers.approve", "audit.read", "reports.read", "settings.manage"] },
  { label: "Ensino", permissions: ["classes.manage", "assignments.manage", "materials.manage", "plans.manage", "students.progress.read"] },
  { label: "Estudo", permissions: ["lessons.read", "practice.sync"] },
];

export function togglePermission(list: readonly Permission[], permission: Permission, on: boolean): Permission[] {
  const without = list.filter((item) => item !== permission);
  return on ? [...without, permission] : without;
}

export const PAGE_SIZE = 25;

export function pageLabel(offset: number, count: number, total: number): string {
  if (total === 0) return "Nenhum resultado";
  return `${offset + 1}–${offset + count} de ${total}`;
}
