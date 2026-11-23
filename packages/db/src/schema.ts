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

import type {
  Alert,
  Assessment,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Organization,
  OrgMembership,
  Project,
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
    /** GitHub numeric account id a pending invite is bound to. */
    githubUserId: text("github_user_id"),
    role: text("role").notNull(),
    payload: jsonb("payload").$type<OrgMembership>().notNull(),
  },
  (table) => [
    index("memberships_org_id_idx").on(table.orgId),
    index("memberships_user_id_idx").on(table.userId),
    index("memberships_github_user_id_unclaimed_idx")
      .on(table.githubUserId)
      .where(sql`${table.userId} IS NULL`),
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
    // Webhook path resolves by the stable repo id first (survives renames).
    index("projects_github_repo_id_idx")
      .on(sql`(${table.payload}->'github'->>'repoId')`)
      .where(sql`${table.payload}->'github'->>'repoId' IS NOT NULL`),
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

/** Assessment payload: the whole entity. Source state rides in the JSONB. */
export type AssessmentPayload = Assessment;

export const assessments = pgTable(
  "assessments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Denormalized `payload.startedAt` — assessments always sort on it. */
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    /** Denormalized `payload.completedAt` — assessments always sort on it. */
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    payload: jsonb("payload").$type<AssessmentPayload>().notNull(),
  },
  (table) => [
    index("assessments_project_id_idx").on(table.projectId),
    // Latest-per-project ordering on real columns (see 0006).
    index("assessments_project_completed_at_idx").on(
      table.projectId,
      table.completedAt.desc(),
      table.startedAt.desc(),
    ),
  ],
);

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
    /**
     * Denormalized `payload.kind` (`violation` = hard fail that blocks a
     * requirement, `warning` = review signal). The org portfolio groups open
     * violations per project, so it must not be a JSON path.
     */
    kind: text("kind").notNull(),
    /**
     * Denormalized engine bucket (`ast`/`runtime`, derived from `analyzerId`
     * via `engineFor` at write time) so list filters run in SQL. Synced from
     * the payload by the repo mappers — the only writers.
     */
    engine: text("engine").notNull(),
    /**
     * Denormalized `SEVERITY_RANK` (contract/statuses): lower sorts first.
     * Lets list loads order + cap in SQL (`ORDER BY severity_rank, id`) with
     * the same order as the JS fallback sort. Synced from the payload by the
     * repo mappers — the only writers.
     */
    severityRank: integer("severity_rank").notNull(),
    /**
     * Denormalized `payload.detectedAt` as a real timestamp: a sticky human
     * decision is re-armed by violations detected after it, which compared ISO
     * strings as text before. Nullable — a legacy row with no parseable value
     * reads as "unknown", never "long ago".
     */
    detectedAt: timestamp("detected_at", {
      withTimezone: true,
      mode: "string",
    }),
    payload: jsonb("payload").$type<Finding>().notNull(),
  },
  (table) => [
    index("findings_project_status_idx").on(table.projectId, table.status),
    index("findings_project_assessment_idx").on(
      table.projectId,
      table.assessmentId,
    ),
    // Severity-first list loads: status-scoped, ordered, capped.
    index("findings_project_status_severity_idx").on(
      table.projectId,
      table.status,
      table.severityRank,
      table.id,
    ),
    // Control-scoped list filter + open-count group-by.
    index("findings_project_control_idx").on(table.projectId, table.controlId),
    // Sticky-decision re-arm: open findings per control detected after a date.
    index("findings_open_detected_idx")
      .on(table.projectId, table.controlId, table.detectedAt)
      .where(sql`${table.status} = 'open'`),
    // Open-violation counts per project (portfolio table).
    index("findings_project_status_kind_idx").on(
      table.projectId,
      table.status,
      table.kind,
    ),
    check(
      "findings_status_check",
      sqlIn(sql`${table.status}`, FINDING_STATUSES),
    ),
    check(
      "findings_kind_check",
      sqlIn(sql`${table.kind}`, ["violation", "warning"]),
    ),
    check(
      "findings_engine_check",
      sqlIn(sql`${table.engine}`, ["ast", "runtime"]),
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
    index("evidence_finding_at_idx").on(table.findingId, table.at.desc()),
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

/**
 * Organization-level AI Gateway key (BYOK). AES-256-GCM envelope sealed with
 * `AI_KEYS_ENCRYPTION_KEY` and the org id as AAD (`src/server/ai/secret-box.ts`);
 * never plaintext. One row per org.
 */
export const orgAiSettings = pgTable("org_ai_settings", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  iv: text("iv").notNull(),
  tag: text("tag").notNull(),
  ciphertext: text("ciphertext").notNull(),
  /** Last four characters of the key, for the "••••abcd" display only. */
  keyLast4: text("key_last4").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "string",
  })
    .notNull()
    .defaultNow(),
});

/**
 * Append-friendly audit trail for AI configuration changes. Org-level events
 * cannot use the project-scoped compliance evidence stream (frozen vocabulary,
 * project-bound reads), and the key is never recorded here.
 */
export const orgAiSettingsEvents = pgTable(
  "org_ai_settings_events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true, mode: "string" }).notNull(),
    /** GitHub login or user id of the admin who made the change. */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    model: text("model"),
  },
  (table) => [
    index("org_ai_settings_events_org_at_idx").on(table.orgId, table.at.desc()),
    check(
      "org_ai_settings_events_action_check",
      sqlIn(sql`${table.action}`, ["configured", "removed"]),
    ),
  ],
);
