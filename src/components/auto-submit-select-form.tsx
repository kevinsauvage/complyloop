"use client";

import type { ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export type AutoSubmitSelectOption = {
  value: string;
  label: string;
};

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
  if (options.length <= 1) return null;

  return (
    <form key={defaultValue} action={action} className="min-w-0">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className={cn(nativeSelectClass, "truncate", className)}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </form>
  );
}
