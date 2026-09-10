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

import {
  ASSESSMENT_JOB_STATUSES,
  ASSESSMENT_JOB_TRIGGERS,
} from "@complyloop/analysis-core/contract/assessment-jobs";
import type {
  Alert,
  Assessment,
  AssessmentSnapshot,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Organization,
  OrgMembership,
  Project,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import { ORG_ROLES } from "@complyloop/analysis-core/contract/project-types";
import {
  FINDING_STATUSES,
  REMEDIATION_STATUSES,
  REQUIREMENT_STATUSES,
} from "@complyloop/analysis-core/contract/statuses";

/**
 * Source of truth is the typed `payload` (JSONB); the sibling indexed columns
 * are projections of that payload. Indexes need columns, so we keep a few
 * (projectId, status, …) in sync via the repo mappers — the only writers. No
 * full normalization: a column never holds anything the payload does not.
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
    // Login lookup without an org (`lower(github_login) = $1`) cannot use the
    // composite (org_id, lower(...)) unique index.
    index("memberships_github_login_lower_idx").on(
      sql`lower(${table.githubLogin})`,
    ),
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
    // Webhook path looks up a repo by lower(fullName) with no org_id.
    index("projects_github_fullname_lower_idx").on(
      sql`lower((${table.payload}->'github'->>'fullName'))`,
    ),
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
    controlId: text("control_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Requirement>().notNull(),
  },
  (table) => [
    index("requirements_project_status_idx").on(table.projectId, table.status),
    uniqueIndex("requirements_project_control_uidx").on(
      table.projectId,
      table.controlId,
    ),
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
  (table) => [
    index("assessments_project_id_idx").on(table.projectId),
    // Latest-per-project ordering; the app always sorts by completedAt/startedAt.
    index("assessments_project_completed_idx").on(
      table.projectId,
      sql`(${table.payload}->>'completedAt') DESC`,
      sql`(${table.payload}->>'startedAt') DESC`,
    ),
  ],
);

/** File-hash snapshot for change detection; loaded only during assessment runs. */
export const assessmentSnapshots = pgTable("assessment_snapshots", {
  assessmentId: text("assessment_id")
    .primaryKey()
    .references(() => assessments.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").$type<AssessmentSnapshot>().notNull(),
});

export const findings = pgTable(
  "findings",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    controlId: text("control_id").notNull(),
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
  (table) => [
    index("alerts_project_id_idx").on(table.projectId),
    // Nav attention counts unread alerts per project on every page.
    index("alerts_project_unread_idx")
      .on(table.projectId)
      .where(sql`${table.read} = false`),
  ],
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
    /** Who caused the entry (GitHub login or user id); null = automated. */
    actor: text("actor"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("evidence_at_idx").on(table.at),
    index("evidence_project_at_idx").on(table.projectId, table.at),
    index("evidence_finding_at_idx").on(table.findingId, table.at),
    index("evidence_project_kind_at_idx").on(
      table.projectId,
      table.kind,
      table.at,
    ),
  ],
);

/** Encrypted GitHub OAuth tokens (AES-256-GCM fields; plaintext never stored). */
export const githubTokens = pgTable("github_tokens", {
  userId: text("user_id").primaryKey(),
  v: integer("v").notNull(),
  iv: text("iv").notNull(),
  tag: text("tag").notNull(),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  refreshToken: text("refresh_token"),
  refreshIv: text("refresh_iv"),
  refreshTag: text("refresh_tag"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
});

/** Idempotency keys for GitHub webhook deliveries (`x-github-delivery`). */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    deliveryId: text("delivery_id").primaryKey(),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    index("webhook_deliveries_processed_at_idx").on(table.processedAt),
  ],
);

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
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "string",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    error: text("error"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    index("assessment_jobs_ready_idx").on(table.status, table.availableAt),
    index("assessment_jobs_project_idx").on(table.projectId, table.createdAt),
    // recoverExpiredLeases scans running jobs by lease expiry on every claim tick.
    index("assessment_jobs_running_lease_idx")
      .on(table.leaseExpiresAt)
      .where(sql`${table.status} = 'running'`),
    uniqueIndex("assessment_jobs_idempotency_uidx")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    check(
      "assessment_jobs_status_check",
      sqlIn(sql`${table.status}`, ASSESSMENT_JOB_STATUSES),
    ),
    check(
      "assessment_jobs_trigger_check",
      sqlIn(sql`${table.trigger}`, ASSESSMENT_JOB_TRIGGERS),
    ),
  ],
);

/** Persistent, cross-instance action limits. Rows expire logically by window. */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    count: integer("count").notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    index("rate_limit_buckets_updated_at_idx").on(table.updatedAt),
    check("rate_limit_buckets_count_check", sql`${table.count} >= 0`),
  ],
);
