import { z } from "zod";

/**
 * Shared zod schema for AI confidence values, aligned with analysis-core's
 * `Confidence` type (`"high" | "medium" | "low"`). Kept here so every AI
 * module that asks the gateway for a confidence parses it identically.
 */
export const confidenceSchema = z.enum(["high", "medium", "low"]);