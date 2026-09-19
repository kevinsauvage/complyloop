import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithUiProviders } from "@/test/render-ui";

import {
  ProvenanceBadge,
  RemediationStatusBadge,
  RequirementStatusBadge,
  SeverityBadge,
} from "./badges";

describe("badges", () => {
  it("renders every requirement status", () => {
    renderWithUiProviders(
      <>
        <RequirementStatusBadge status="passed" />
        <RequirementStatusBadge status="failed" />
        <RequirementStatusBadge status="needs_review" />
        <RequirementStatusBadge status="not_applicable" />
        <RequirementStatusBadge status="unable_to_verify" />
      </>,
    );
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Not applicable")).toBeInTheDocument();
    expect(screen.getByText("Unable to verify")).toBeInTheDocument();
  });

  it("labels AI-generated content distinctly from deterministic content", () => {
    renderWithUiProviders(
      <>
        <ProvenanceBadge provenance="ai" />
        <ProvenanceBadge provenance="deterministic" />
      </>,
    );
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
    expect(screen.getByText("Deterministic")).toBeInTheDocument();
  });

  it("renders remediation and severity badges", () => {
    renderWithUiProviders(
      <>
        <RemediationStatusBadge status="verified" />
        <SeverityBadge severity="critical" />
      </>,
    );
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });
});
