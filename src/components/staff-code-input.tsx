"use client";

import type { ComponentProps } from "react";
import { formatOfficerCode } from "@/lib/staff-code";

function formatInput(input: HTMLInputElement) {
  if (input.type === "email") return;
  const formatted = formatOfficerCode(input.value);
  if (formatted !== input.value) input.value = formatted;
}

export function StaffCodeInput({
  onInput,
  onBlur,
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      {...props}
      onInput={(event) => {
        formatInput(event.currentTarget);
        onInput?.(event);
      }}
      onBlur={(event) => {
        formatInput(event.currentTarget);
        onBlur?.(event);
      }}
    />
  );
}
