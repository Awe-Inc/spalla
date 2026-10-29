export const PERMISSIONS = {
  "users.read": "Ver usuários",
  "users.manage": "Gerenciar usuários (papéis, suspensão, sessões)",
  "roles.manage": "Gerenciar papéis e permissões",
  "invites.manage": "Criar e revogar convites",
  "teachers.approve": "Aprovar professores",
  "audit.read": "Ver auditoria",
  "reports.read": "Ver números da plataforma",
  "settings.manage": "Mudar configurações",
  "classes.manage": "Criar e gerenciar turmas",
  "assignments.manage": "Passar tarefas",
  "materials.manage": "Publicar materiais e PDFs",
  "plans.manage": "Montar planos de estudo",
  "students.progress.read": "Ver a prática dos próprios alunos",
  "lessons.read": "Ver aulas, tarefas e materiais",
  "practice.sync": "Enviar a prática para o professor",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PLATFORM_PERMISSIONS: readonly Permission[] = [
  "users.read",
  "users.manage",
  "roles.manage",
  "invites.manage",
  "teachers.approve",
  "audit.read",
  "reports.read",
  "settings.manage",
];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

export interface SystemRole {
  key: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

export const ADMIN_ROLE = "admin";
export const TEACHER_ROLE = "professor";
export const STUDENT_ROLE = "aluno";

export const SYSTEM_ROLES: readonly SystemRole[] = [
  { key: ADMIN_ROLE, name: "Administrador", description: "Acesso total à plataforma.", permissions: ALL_PERMISSIONS },
  {
    key: "suporte",
    name: "Suporte",
    description: "Atende usuários e aprova professores.",
    permissions: ["users.read", "teachers.approve", "audit.read", "reports.read"],
  },
  {
    key: TEACHER_ROLE,
    name: "Professor",
    description: "Professor parceiro: turmas, tarefas, materiais e planos.",
    permissions: ["classes.manage", "assignments.manage", "materials.manage", "plans.manage", "students.progress.read"],
  },
  {
    key: STUDENT_ROLE,
    name: "Aluno",
    description: "Estuda com um professor.",
    permissions: ["lessons.read", "practice.sync"],
  },
];
