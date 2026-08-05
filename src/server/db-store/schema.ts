import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  Alert,
  Assessment,
  Control,
  Finding,
  Framework,
  Project,
  Remediation,
  Requirement,
} from "@/core/types";

/**
 * Domain rows store the typed payload as JSONB so nested Finding/Remediation
 * shapes stay framework-agnostic without a brittle column explosion.
 * Evidence is a dedicated table: insert-only from the app (never updated/deleted).
 */

export const frameworks = pgTable("frameworks", {
  id: text("id").primaryKey(),
  payload: jsonb("payload").$type<Framework>().notNull(),
});

export const controls = pgTable("controls", {
  id: text("id").primaryKey(),
  frameworkId: text("framework_id").notNull(),
  payload: jsonb("payload").$type<Control>().notNull(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id"),
  payload: jsonb("payload").$type<Project>().notNull(),
});

export const requirements = pgTable("requirements", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  controlId: text("control_id").notNull(),
  payload: jsonb("payload").$type<Requirement>().notNull(),
});

export const assessments = pgTable("assessments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  payload: jsonb("payload").$type<Assessment>().notNull(),
});

export const findings = pgTable("findings", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  controlId: text("control_id").notNull(),
  assessmentId: text("assessment_id").notNull(),
  status: text("status").notNull(),
  payload: jsonb("payload").$type<Finding>().notNull(),
});

export const remediations = pgTable("remediations", {
  id: text("id").primaryKey(),
  findingId: text("finding_id").notNull(),
  status: text("status").notNull(),
  payload: jsonb("payload").$type<Remediation>().notNull(),
});

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  read: boolean("read").notNull().default(false),
  payload: jsonb("payload").$type<Alert>().notNull(),
});

/** Append-only audit trail — application code must never UPDATE or DELETE. */
export const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  at: timestamp("at", { withTimezone: true, mode: "string" }).notNull(),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  projectId: text("project_id"),
  controlId: text("control_id"),
  findingId: text("finding_id"),
  assessmentId: text("assessment_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
});

export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export type EvidenceRow = typeof evidence.$inferSelect;
export type EvidenceInsert = typeof evidence.$inferInsert;
