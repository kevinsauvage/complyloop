import Link from "next/link";
import type { Metadata } from "next";
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
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  description:
    "ComplyLoop turns RGAA/WCAG accessibility obligations into engineering work — deterministic checks, human-approved remediations, and audit evidence.",
};
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      "Every failure explains what broke, why it matters, where it lives, and how to fix it — in language your team already uses.",
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
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--signal)_22%,transparent),transparent)]"
      />

      <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex items-center rounded-full border border-signal/25 bg-signal/10 px-3 py-1 text-xs font-medium text-signal">
            Compliance engineering for agencies
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            From RGAA requirement to{" "}
            <span className="text-signal">verified code</span> and audit evidence
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            ComplyLoop turns accessibility obligations into engineering work your
            team can ship — with deterministic checks, human-approved remediations,
            and an evidence trail that survives the next client audit.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-w-44">
              <Link href="/login">
                Get started free
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
          className="mt-20 scroll-mt-24 rounded-2xl border border-border/80 bg-card/60 p-6 card-sheen backdrop-blur-sm sm:p-8"
        >
          <h2 className="text-center text-sm font-medium uppercase tracking-wider text-muted-foreground">
            The compliance loop
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {LOOP_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.label}
                  className="relative flex flex-col items-center rounded-xl border border-border/60 bg-background/70 px-4 py-5 text-center"
                >
                  <span className="mb-3 flex size-10 items-center justify-center rounded-lg bg-signal/15 text-signal">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-1 text-sm font-semibold">{step.label}</span>
                </li>
              );
            })}
          </ol>
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

          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <li key={feature.title}>
                  <Card className="h-full border-border/70 bg-card/80 card-sheen transition-[border-color,box-shadow] duration-200 hover:border-signal/30 hover:shadow-[0_8px_30px_color-mix(in_oklch,var(--signal)_8%,transparent)]">
                    <CardHeader>
                      <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-signal/12 text-signal">
                        <Icon className="size-4.5" aria-hidden />
                      </div>
                      <CardTitle className="text-base">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-sm leading-relaxed">
                        {feature.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
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
                accessible products: with clear semantics, visible decisions, and
                proof you can show an auditor.
              </p>
              <ul className="mt-8 space-y-3">
                {PRINCIPLES.map((principle) => (
                  <li
                    key={principle}
                    className="flex items-start gap-3 text-sm leading-relaxed"
                  >
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-status-passed"
                      aria-hidden
                    />
                    <span>{principle}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card/70 p-8 card-sheen">
              <p className="text-sm font-medium text-signal">For French agencies</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">
                RGAA and WCAG compliance across every client repo — not just the
                one being audited this quarter.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Connect GitHub, run your first assessment in minutes, and walk
                the full loop from Requirement to Evidence without leaving your
                engineering workflow.
              </p>
              <Button asChild className="mt-8 w-full sm:w-auto" size="lg">
                <Link href="/login">
                  Start with GitHub
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
          <Button asChild size="lg" className="mt-8 min-w-48">
            <Link href="/login">Get started</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
