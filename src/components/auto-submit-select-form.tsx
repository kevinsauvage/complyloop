"use client";

import { useState, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown } from "lucide-react";
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
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      <Label
        htmlFor={id}
        className="shrink-0 text-xs font-medium text-muted-foreground"
      >
        {label}{" "}
        <span aria-hidden="true" className="text-muted-foreground/70">
          · {options.length}
        </span>
      </Label>
      <div className="relative min-w-0 flex-1">
        <select
          id={id}
          name={name}
          value={value}
          aria-label={label}
          title={`${label} — ${selectedLabel} (${options.length} available)`}
          onChange={(event) => setValue(event.target.value)}
          className={cn(
            nativeSelectClass,
            "truncate appearance-none bg-background pr-8 shadow-sm",
            className,
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      {changed ? <SwitchButton /> : null}
      <span aria-live="polite" className="sr-only">
        {changed
          ? `${selectedLabel} selected. Activate Switch to change the ${label.toLowerCase()}.`
          : ""}
      </span>
    </form>
  );
}
