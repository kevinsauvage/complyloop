"use client";

import { useState, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/form-classes";
import { cn } from "@/lib/utils";

export type AutoSubmitSelectOption = {
  value: string;
  label: string;
};

function SwitchButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Switching…" : "Switch"}
    </Button>
  );
}

export function AutoSubmitSelectForm({
  id,
  name,
  action,
  label,
  options,
  defaultValue,
  className,
}: {
  id: string;
  name: string;
  action: ComponentProps<"form">["action"];
  label: string;
  options: AutoSubmitSelectOption[];
  defaultValue: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);

  if (options.length <= 1) return null;

  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? value;
  const changed = value !== defaultValue;

  return (
    // Deliberately NOT auto-submitting on change: arrow-key exploration of the
    // options must never trigger a workspace switch. The user confirms with
    // the Switch button (or resets by re-selecting the current value).
    <form
      key={defaultValue}
      action={action}
      className="flex min-w-0 items-center gap-1.5"
    >
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <select
        id={id}
        name={name}
        value={value}
        title={selectedLabel}
        onChange={(event) => setValue(event.target.value)}
        className={cn(nativeSelectClass, "truncate", className)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {changed ? <SwitchButton /> : null}
      <span aria-live="polite" className="sr-only">
        {changed
          ? `${selectedLabel} selected. Activate Switch to change the ${label.toLowerCase()}.`
          : ""}
      </span>
    </form>
  );
}
