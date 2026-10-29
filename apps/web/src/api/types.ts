import type { BlockKind, RoutineBlock } from "@/data/db";

export type Permission =
  | "users.read"
  | "users.manage"
  | "roles.manage"
  | "invites.manage"
  | "teachers.approve"
  | "audit.read"
  | "reports.read"
  | "settings.manage"
  | "classes.manage"
  | "assignments.manage"
  | "materials.manage"
  | "plans.manage"
  | "students.progress.read"
  | "lessons.read"
  | "practice.sync";

export type TeacherApplication = "pending" | "approved" | "rejected";

export interface Me {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: Permission[];
  teacherApplication: TeacherApplication | null;
  teacherBio: string | null;
  createdAt: string;
}

export interface SessionResponse {
  token: string;
  user: Me;
  joinedClass?: { id: string; name: string } | null;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  accountType: "aluno" | "professor";
  classCode?: string;
  inviteCode?: string;
  teacherBio?: string;
  birthYear?: number;
  guardianName?: string;
  guardianEmail?: string;
  guardianConsent?: boolean;
  acceptTerms: true;
}

export interface AccountSession {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export type AssignmentItemKind = "exercicio" | "peca" | "texto";

export interface AssignmentItem {
  kind: AssignmentItemKind;
  title: string;
  ref?: string;
  playPath?: string;
  bpm?: number;
  minutes?: number;
  stars?: number;
  note?: string;
}

export type PlanBlock = Omit<RoutineBlock, "type"> & { type: BlockKind };

export interface TeacherClass {
  id: string;
  name: string;
  description: string;
  joinCode: string;
  createdAt: string;
  archivedAt: string | null;
  students: number;
}

export interface ClassStudent {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  lastPracticeAt: string | null;
  minutesLast7Days: number;
  assignmentsDone: number;
}

export interface Announcement {
  id: string;
  body: string;
  createdAt: string;
}

export interface TeacherClassDetail extends Omit<TeacherClass, "students"> {
  students: ClassStudent[];
  announcements: Announcement[];
}

export interface TeacherStudent {
  id: string;
  name: string;
  email: string;
  classes: string[];
  lastPracticeAt: string | null;
  minutesLast7Days: number;
}

export type MaterialKind = "link" | "text" | "pdf";

export interface Material {
  id: string;
  title: string;
  kind: MaterialKind;
  url: string | null;
  body: string | null;
  createdAt: string;
  fileId: string | null;
  fileName: string | null;
  fileSize: number | null;
}

export interface TeacherMaterial extends Material {
  classIds: string[];
}

export interface StudentMaterial extends Material {
  teacherName: string;
}

export interface AssignmentFields {
  title: string;
  instructions: string;
  dueOn: string | null;
  items: AssignmentItem[];
  materialIds: string[];
}

export interface TeacherAssignment extends AssignmentFields {
  id: string;
  classId: string | null;
  studentId: string | null;
  createdAt: string;
  className: string | null;
  studentName: string | null;
  done: number;
  recipients: number;
}

export interface AssignmentRecipient {
  id: string;
  name: string;
  doneAt: string | null;
  studentNote: string;
  feedback: string;
  feedbackAt: string | null;
}

export interface TeacherAssignmentDetail extends AssignmentFields {
  id: string;
  classId: string | null;
  studentId: string | null;
  createdAt: string;
  students: AssignmentRecipient[];
}

export interface PlanFields {
  name: string;
  description: string;
  blocks: PlanBlock[];
}

export interface TeacherPlan extends PlanFields {
  id: string;
  classId: string | null;
  studentId: string | null;
  className: string | null;
  studentName: string | null;
  updatedAt: string;
}

export interface Audience {
  classId?: string;
  studentId?: string;
}

export interface PracticeDaySummary {
  day: string;
  minutes: number;
  plays: number;
}

export interface PracticeExerciseSummary {
  exerciseId: string;
  plays: number;
  bestAccuracy: number;
  meanDriftCents: number;
  stars: number;
  bestBpm: number;
  lastPlayedAt: string;
}

export interface PracticeSummary {
  days: number;
  totalMinutes: number;
  daysPracticed: number;
  lastPracticeAt: string | null;
  byDay: PracticeDaySummary[];
  exercises: PracticeExerciseSummary[];
}

export interface StudentProgress {
  student: { id: string; name: string; email: string };
  practice: PracticeSummary;
  assignments: { id: string; title: string; dueOn: string | null; doneAt: string | null; studentNote: string | null; feedback: string | null }[];
}

export interface StudentClass {
  id: string;
  name: string;
  description: string;
  teacherName: string;
  joinedAt: string;
}

export interface StudentAssignment extends AssignmentFields {
  id: string;
  createdAt: string;
  className: string | null;
  teacherName: string;
  doneAt: string | null;
  studentNote: string;
  feedback: string;
  feedbackAt: string | null;
}

export interface StudentAnnouncement extends Announcement {
  className: string;
  authorName: string;
}

export interface StudentPlan extends PlanFields {
  id: string;
  updatedAt: string;
  teacherName: string;
  className: string | null;
}

export interface Lessons {
  assignments: StudentAssignment[];
  materials: StudentMaterial[];
  announcements: StudentAnnouncement[];
  plans: StudentPlan[];
}

export interface PracticeUpload {
  clientId: string;
  exerciseId: string;
  playedAt: string;
  accuracyPct: number;
  meanSignedCents: number;
  bpm: number;
  stars: number;
  durationSeconds: number;
}

export interface PracticeUploadResult {
  received: number;
  inserted: number;
  rejected: number;
}

export interface AdminStats {
  users: number;
  suspended: number;
  pendingTeachers: number;
  activeLast7Days: number;
  newLast30Days: number;
  classes: number;
  assignments: number;
  materials: number;
  practiceMinutesLast7Days: number;
  byRole: { key: string; name: string; users: number }[];
}

export type UserStatus = "active" | "suspended";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  teacherApplication: TeacherApplication | null;
  createdAt: string;
  lastLoginAt: string | null;
  roles: string[];
}

export interface AdminUserDetail extends AdminUser {
  teacherBio: string | null;
  birthYear: number | null;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianConsentAt: string | null;
  activeSessions: number;
  classesTaught: number;
  classesJoined: number;
  practiceResults: number;
}

export interface Page<T> {
  total: number;
  items: T[];
}

export interface TeacherApplicationRow {
  id: string;
  name: string;
  email: string;
  teacherBio: string | null;
  createdAt: string;
}

export interface PermissionInfo {
  key: Permission;
  label: string;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string;
  builtIn: boolean;
  users: number;
  permissions: Permission[];
}

export interface Invite {
  id: string;
  code: string;
  role: string;
  roleName: string;
  note: string;
  maxUses: number;
  uses: number;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdBy: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  data: Record<string, unknown> | null;
  ip: string | null;
  at: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
}

export interface PlatformSettings {
  signupOpen: boolean;
  teacherApprovalRequired: boolean;
  platformName: string;
  supportEmail: string;
}
