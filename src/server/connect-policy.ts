import type { OrgMembership } from "@/core/types";
import { roleHasPermission } from "@/core/rbac";
import { ConnectError, isLikelyGitUrl } from "./connect-url";

/**
 * Local filesystem connects are for the laptop demo only. Off by default in
 * production; set ALLOW_LOCAL_PROJECT_CONNECT=true to opt in. In non-production,
 * defaults to on unless explicitly set to "false".
 */
export function isLocalProjectConnectAllowed(): boolean {
  const flag = process.env.ALLOW_LOCAL_PROJECT_CONNECT;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/** True when the deployment should require sign-in for advanced connect. */
export function isHostedConnectMode(): boolean {
  return !isLocalProjectConnectAllowed();
}

export function userCanConnectProjects(
  memberships: ReadonlyArray<OrgMembership>,
  userId: string,
  orgId: string | null | undefined,
): boolean {
  if (!orgId) return false;
  const membership = memberships.find(
    (candidate) =>
      candidate.orgId === orgId && candidate.userId === userId,
  );
  if (!membership) return false;
  return roleHasPermission(membership.role, "project.connect");
}

/**
 * Blocks clones to loopback / link-local / private addresses and metadata
 * hostnames. Hostname allow is otherwise open (public git hosts).
 */
export function assertSafeGitRemoteUrl(rawUrl: string): void {
  const trimmed = rawUrl.trim();
  if (!isLikelyGitUrl(trimmed)) {
    throw new ConnectError(
      "That does not look like a git URL. Use https://github.com/org/repo or git@host:org/repo.git.",
    );
  }

  const host = extractGitHost(trimmed);
  if (!host) {
    throw new ConnectError("Could not parse a host from that git URL.");
  }

  const normalized = host.toLowerCase().replace(/\.$/, "");
  if (isBlockedGitHost(normalized)) {
    throw new ConnectError(
      `Cloning from ${normalized} is not allowed (private or local network).`,
    );
  }
}

export function extractGitHost(url: string): string | null {
  const trimmed = url.trim();
  if (/^git@([^:]+):/.test(trimmed)) {
    return trimmed.match(/^git@([^:]+):/)?.[1] ?? null;
  }
  if (/^ssh:\/\/git@([^/]+)\//i.test(trimmed)) {
    return trimmed.match(/^ssh:\/\/git@([^/]+)\//i)?.[1] ?? null;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

export function isBlockedGitHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "localhost.localdomain" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata" ||
    host === "metadata.google.internal" ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  if (host.includes(":")) {
    // IPv6 literal (possibly bracket-stripped by URL parser)
    return isBlockedIpv6(host);
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return isBlockedIpv4(host);
  }

  return false;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
  if (normalized.startsWith("fe80")) return true; // link-local
  if (normalized.startsWith("ff")) return true; // multicast
  // IPv4-mapped :ffff:127.0.0.1 etc.
  const v4mapped = normalized.match(/:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4mapped?.[1] && isBlockedIpv4(v4mapped[1])) return true;
  return false;
}

export interface ConnectAuthorizationInput {
  userId: string | null;
  activeOrgId: string | null;
  memberships: ReadonlyArray<OrgMembership>;
  target: string;
}

/**
 * Enforces auth, role, local-path gate, and git SSRF checks before connecting.
 */
export function assertConnectProjectAllowed(
  input: ConnectAuthorizationInput,
): void {
  const trimmed = input.target.trim();
  if (trimmed.length === 0) {
    throw new ConnectError("Enter a local path or a git repository URL.");
  }

  const isGit = isLikelyGitUrl(trimmed);
  const localAllowed = isLocalProjectConnectAllowed();

  if (!input.userId) {
    // Hosted mode (local connects off) always requires sign-in.
    if (!localAllowed) {
      throw new ConnectError("Sign in to connect a project.");
    }
  } else if (
    !userCanConnectProjects(
      input.memberships,
      input.userId,
      input.activeOrgId,
    )
  ) {
    throw new ConnectError(
      "You need admin or owner access in the active organization to connect a project.",
    );
  }

  if (!isGit) {
    if (!localAllowed) {
      throw new ConnectError(
        "Local path connects are disabled. Set ALLOW_LOCAL_PROJECT_CONNECT=true for the laptop demo, or use a git URL / GitHub picker.",
      );
    }
    return;
  }

  assertSafeGitRemoteUrl(trimmed);
}
