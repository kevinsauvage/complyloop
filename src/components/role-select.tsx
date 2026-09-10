"use client";

import { nativeSelectClass } from "@/components/ui/native-select";

/** Assignable org roles (owner transfer unsupported). Single source for role <select>s. */
export const ORG_ROLE_OPTIONS = [
  { value: "admin", label: "Admin", ownerOnly: true },
  { value: "member", label: "Member", ownerOnly: false },
  { value: "viewer", label: "Viewer", ownerOnly: false },
] as const;

export function RoleSelect({
  name = "role",
  defaultValue = "member",
  canAssignAdmin = false,
  ariaLabel,
  id,
  className,
}: {
  name?: string;
  defaultValue?: string;
  canAssignAdmin?: boolean;
  ariaLabel?: string;
  id?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className={className ?? nativeSelectClass}
    >
      {ORG_ROLE_OPTIONS.filter((option) =>
        option.ownerOnly ? canAssignAdmin : true,
      ).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
