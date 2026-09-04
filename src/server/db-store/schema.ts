import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ORG_ROLES } from "@/core/project-types";
import type {
  Control,
  Framework,
  OrgMembership,
  Organization,
  Project,
  Requirement,
} from "@/core/project-types";
import type {
  Alert,
  Assessment,
  AssessmentSnapshot,
  Finding,
  Remediation,
} from "@/core/finding-types";
import {
  FINDING_STATUSES,
  REMEDIATION_STATUSES,
  REQUIREMENT_STATUSES,
} from "@/core/statuses";

/**
 * Domain rows store the typed payload as JSONB so nested Finding/Remediation
 * shapes stay framework-agnostic without a brittle column explosion.
 * Evidence is a dedicated table: insert-only from the app (never updated/deleted).
 *
 * Foreign keys use ON DELETE CASCADE on mutable tables. Evidence has no FKs —
 * rows outlive project disconnect and organization deletion.
 *
 * Assessment file-hash snapshots live in {@link assessmentSnapshots}, not in
 * the assessment payload, so workspace reads stay bounded.
 */

function sqlIn(column: ReturnType<typeof sql>, values: readonly string[]) {
  const list = values
    .map((value) => `'${value.replaceAll("'", "''")}'`)
    .join(", ");
  return sql`${column} IN (${sql.raw(list)})`;
}

export const frameworks = pgTable("frameworks", {
  id: text("id").primaryKey(),
  payload: jsonb("payload").$type<Framework>().notNull(),
});

export const controls = pgTable(
  "controls",
  {
    id: text("id").primaryKey(),
    frameworkId: text("framework_id")
      .notNull()
      .references(() => frameworks.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Control>().notNull(),
  },
  (table) => [
    index("controls_framework_id_idx").on(table.frameworkId),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    payload: jsonb("payload").$type<Organization>().notNull(),
  },
  (table) => [uniqueIndex("organizations_slug_uidx").on(table.slug)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    githubLogin: text("github_login").notNull(),
    role: text("role").notNull(),
    payload: jsonb("payload").$type<OrgMembership>().notNull(),
  },
  (table) => [
    index("memberships_org_id_idx").on(table.orgId),
    index("memberships_user_id_idx").on(table.userId),
    index("memberships_github_login_idx").on(table.githubLogin),
    uniqueIndex("memberships_org_user_uidx")
      .on(table.orgId, table.userId)
      .where(sql`${table.userId} IS NOT NULL`),
    uniqueIndex("memberships_org_login_uidx").on(
      table.orgId,
      sql`lower(${table.githubLogin})`,
    ),
    check("memberships_role_check", sqlIn(sql`${table.role}`, ORG_ROLES)),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "cascade",
      }),
    payload: jsonb("payload").$type<Project>().notNull(),
  },
  (table) => [
    index("projects_org_id_idx").on(table.orgId),
    uniqueIndex("projects_org_github_uidx")
      .on(table.orgId, sql`lower((payload->'github'->>'fullName'))`)
      .where(sql`payload->'github'->>'fullName' IS NOT NULL`),
  ],
);

export const requirements = pgTable(
  "requirements",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    controlId: text("control_id")
      .notNull()
      .references(() => controls.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Requirement>().notNull(),
  },
  (table) => [
    index("requirements_project_status_idx").on(table.projectId, table.status),
    check(
      "requirements_status_check",
      sqlIn(sql`${table.status}`, REQUIREMENT_STATUSES),
    ),
  ],
);

/** Assessment metadata without snapshot (snapshot is in assessment_snapshots). */
export type AssessmentPayload = Omit<Assessment, "snapshot">;

export const assessments = pgTable(
  "assessments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<AssessmentPayload>().notNull(),
  },
  (table) => [index("assessments_project_id_idx").on(table.projectId)],
);

/** File-hash snapshot for change detection; loaded only during assessment runs. */
export const assessmentSnapshots = pgTable(
  "assessment_snapshots",
  {
    assessmentId: text("assessment_id")
      .primaryKey()
      .references(() => assessments.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").$type<AssessmentSnapshot>().notNull(),
  },
  (table) => [index("assessment_snapshots_assessment_id_idx").on(table.assessmentId)],
);

export const findings = pgTable(
  "findings",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    controlId: text("control_id")
      .notNull()
      .references(() => controls.id, { onDelete: "cascade" }),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Finding>().notNull(),
  },
  (table) => [
    index("findings_project_status_idx").on(table.projectId, table.status),
    index("findings_project_assessment_idx").on(
      table.projectId,
      table.assessmentId,
    ),
    check(
      "findings_status_check",
      sqlIn(sql`${table.status}`, FINDING_STATUSES),
    ),
  ],
);

export const remediations = pgTable(
  "remediations",
  {
    id: text("id").primaryKey(),
    findingId: text("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Remediation>().notNull(),
  },
  (table) => [
    index("remediations_finding_id_idx").on(table.findingId),
    check(
      "remediations_status_check",
      sqlIn(sql`${table.status}`, REMEDIATION_STATUSES),
    ),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    read: boolean("read").notNull().default(false),
    payload: jsonb("payload").$type<Alert>().notNull(),
  },
  (table) => [index("alerts_project_id_idx").on(table.projectId)],
);

/** Append-only audit trail — application code must never UPDATE or DELETE. */
export const evidence = pgTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    at: timestamp("at", { withTimezone: true, mode: "string" }).notNull(),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    projectId: text("project_id"),
    controlId: text("control_id"),
    findingId: text("finding_id"),
    assessmentId: text("assessment_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("evidence_at_idx").on(table.at),
    index("evidence_project_at_idx").on(table.projectId, table.at),
  ],
);

/** Encrypted GitHub OAuth tokens (AES-256-GCM fields; plaintext never stored). */
export const githubTokens = pgTable("github_tokens", {
  userId: text("user_id").primaryKey(),
  v: integer("v").notNull(),
  iv: text("iv").notNull(),
  tag: text("tag").notNull(),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

/** Idempotency keys for GitHub webhook deliveries (`x-github-delivery`). */
export const webhookDeliveries = pgTable("webhook_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  processedAt: timestamp("processed_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
});

export const assessmentJobs = pgTable(
  "assessment_jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    trigger: text("trigger").notNull(),
    requestedByUserId: text("requested_by_user_id"),
    idempotencyKey: text("idempotency_key"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "string" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [
    index("assessment_jobs_ready_idx").on(table.status, table.availableAt),
    index("assessment_jobs_project_idx").on(table.projectId, table.createdAt),
    uniqueIndex("assessment_jobs_idempotency_uidx")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    check(
      "assessment_jobs_status_check",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "assessment_jobs_trigger_check",
      sql`${table.trigger} IN ('manual', 'webhook')`,
    ),
  ],
);

/** Persistent, cross-instance action limits. Rows expire logically by window. */
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  count: integer("count").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export type EvidenceRow = typeof evidence.$inferSelect;
export type EvidenceInsert = typeof evidence.$inferInsert;