import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  GitBranch,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  description:
    "ComplyLoop turns RGAA/WCAG accessibility obligations into engineering work — deterministic checks, human-approved remediations, and audit evidence.",
};

const LOOP_STEPS = [
  { label: "Requirement", icon: ShieldCheck },
  { label: "Assessment", icon: RefreshCw },
  { label: "Finding", icon: FileSearch },
  { label: "Remediation", icon: Wrench },
  { label: "Verification", icon: CheckCircle2 },
  { label: "Evidence", icon: ScrollText },
] as const;

const FEATURES = [
  {
    title: "Deterministic checks first",
    description:
      "AST analysis, jsx-a11y, and optional Playwright runtime audits. Statuses come from evidence — not AI confidence.",
    icon: ShieldCheck,
  },
  {
    title: "Engineer-native Findings",
    description:
      "Every finding explains what broke, why it matters, where it lives, and how to fix it — in language your team already uses.",
    icon: FileSearch,
  },
  {
    title: "Remediation with human approval",
    description:
      "Suggested fixes stay suggestions until a human approves. Decisions and exceptions keep history — nothing is silently overwritten.",
    icon: Sparkles,
  },
  {
    title: "GitHub-native workflow",
    description:
      "Connect repositories, run assessments on real code, and open pull requests when you are ready to ship the fix.",
    icon: GitBranch,
  },
  {
    title: "Continuous re-assessment",
    description:
      "Designed for regression detection across client projects — not a one-time audit report that goes stale.",
    icon: RefreshCw,
  },
  {
    title: "Append-only Evidence",
    description:
      "What was checked, what changed, when, and how it was verified — an audit trail your agency can stand behind.",
    icon: ScrollText,
  },
] as const;

const PRINCIPLES = [
  "Evidence over claims — no status without recorded proof",
  "Verification over AI confidence — humans close the loop",
  "Explainability by default — every Finding is actionable",
  "Framework-ready — RGAA/WCAG today, extensible tomorrow",
] as const;

export default function HomePage() {
  return (
    <div className="relative">
      <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            From RGAA requirement to verified code and audit evidence
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Compliance engineering for agencies: ComplyLoop turns accessibility
            obligations into engineering work your team can ship — with
            deterministic checks, human-approved remediations, and an evidence
            trail that survives the next client audit.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-w-44">
              <Link href="/login">
                Sign in with GitHub
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-w-44">
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>
        </div>

        <div
          id="how-it-works"
          className="mt-20 scroll-mt-24 overflow-hidden rounded-xl border border-border/80 bg-card"
        >
          <h2 className="px-6 pt-6 text-center text-base font-semibold tracking-tight sm:px-8">
            The compliance loop
          </h2>
          <p className="mt-1 px-6 pb-6 text-center text-sm text-muted-foreground sm:px-8">
            Repeats on every assessment — each run closes the loop again.
          </p>
          <div className="overflow-hidden border-t border-border/60">
            <ol className="-mr-px -mb-px grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {LOOP_STEPS.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li
                    key={step.label}
                    className="relative flex flex-col items-center border-r border-b border-border/60 px-4 py-6 text-center"
                  >
                    <Icon
                      className="mb-3 size-5 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-1 text-sm font-semibold">
                      {step.label}
                    </span>
                    {index < LOOP_STEPS.length - 1 ? (
                      <ArrowRight
                        aria-hidden
                        className="absolute top-1/2 -right-2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-card text-muted-foreground xl:block"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="scroll-mt-24 border-y border-border/60 bg-muted/30 py-20"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Built for engineering teams, not checkbox audits
            </h2>
            <p className="mt-4 text-muted-foreground">
              Everything in ComplyLoop serves one loop: detect, explain, fix,
              verify, and prove — continuously across your client portfolio.
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-xl border border-border/70 bg-card">
            <ul className="-mr-px -mb-px grid sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <li
                    key={feature.title}
                    className="border-r border-b border-border/60 p-6"
                  >
                    <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
                      <Icon
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      {feature.title}
                    </h3>
                    <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      <section
        id="sample"
        className="scroll-mt-24 border-t border-border/60 bg-muted/20 py-20"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Every run leaves a trail
              </h2>
              <p className="mt-4 text-muted-foreground">
                Assessments, findings, fixes, and verifications accumulate as
                append-only evidence — nothing can be edited, only superseded.
                This is what your auditor receives.
              </p>
            </div>

            <div
              role="group"
              className="rounded-xl border border-border/80 bg-card p-5 sm:p-6"
              aria-label="Sample evidence trail"
            >
              <p className="text-xs font-medium text-muted-foreground">
                Sample evidence trail
              </p>
              <ol className="mt-3 flex flex-col divide-y divide-border/60">
                <li className="flex items-start gap-3 py-3">
                  <span
                    aria-hidden
                    className="mt-1.5 size-2.5 shrink-0 rounded-full bg-status-passed"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Assessment completed</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      48 requirements checked · 3 findings detected
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3 py-3">
                  <span
                    aria-hidden
                    className="mt-1.5 size-2.5 shrink-0 rounded-full bg-status-failed"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Finding detected</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Form control has no label ·{" "}
                      <span className="font-mono">ContactForm.tsx:42</span>
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3 py-3">
                  <span
                    aria-hidden
                    className="mt-1.5 size-2.5 shrink-0 rounded-full bg-status-passed"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Remediation verified</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Fix confirmed by automated re-check · human approved
                    </p>
                  </div>
                </li>
              </ol>
              <p className="mt-4 text-xs text-muted-foreground">
                Illustrative sample — your trail is generated from real
                assessments.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                <Link
                  href="/login"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Sign in to generate your trail from a real assessment
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="principles" className="scroll-mt-24 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Trust is designed in, not bolted on
              </h2>
              <p className="mt-4 text-muted-foreground">
                We built ComplyLoop the way we expect our customers to build
                accessible products: with clear semantics, visible decisions,
                and proof you can show an auditor.
              </p>
              <ul className="mt-8 space-y-3">
                {PRINCIPLES.map((principle) => (
                  <li
                    key={principle}
                    className="flex items-start gap-3 text-sm leading-relaxed"
                  >
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-foreground/70"
                      aria-hidden
                    />
                    <span>{principle}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border/80 bg-card p-8">
              <p className="text-2xl font-semibold tracking-tight">
                For French agencies: RGAA and WCAG compliance across every
                client repo — not just the one being audited this quarter.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Connect GitHub, run your first assessment in minutes, and walk
                the full loop from Requirement to Evidence without leaving your
                engineering workflow.
              </p>
              <Button asChild className="mt-8 w-full sm:w-auto" size="lg">
                <Link href="/login">
                  Sign in with GitHub
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 bg-muted/20 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Ready to close the compliance loop?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Sign in with GitHub, connect a repository, and run your first
            assessment — evidence included.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-w-48">
              <Link href="/login">Sign in with GitHub</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-w-48">
              <Link href="#sample">See sample trail</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
