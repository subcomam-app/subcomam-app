"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { formatRut, normalizeDocument, type DocumentType } from "@/lib/domain";

type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  documentType: DocumentType;
  value: string;
  onValueChange: (value: string) => void;
};

function caretPosition(formatted: string, characters: number) {
  let position = 0;
  while (position < formatted.length && characters > 0) {
    if (!/[.\s-]/.test(formatted[position])) characters--;
    position++;
  }
  return position;
}

export function DocumentNumberInput({
  documentType,
  value,
  onValueChange,
  onKeyDown,
  ...props
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selection = useRef<[number, number] | null>(null);
  const isRut = documentType === "RUT";

  useLayoutEffect(() => {
    if (selection.current) {
      inputRef.current?.setSelectionRange(...selection.current);
      selection.current = null;
    }
  });

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      value={isRut ? formatRut(value) : value}
      onChange={(event) => {
        const input = event.currentTarget;
        const formatted = isRut ? formatRut(input.value) : input.value;
        if (isRut) {
          selection.current = [input.selectionStart, input.selectionEnd].map(
            (position) =>
              caretPosition(
                formatted,
                normalizeDocument(
                  input.value.slice(0, position ?? input.value.length),
                ).length,
              ),
          ) as [number, number];
        }
        onValueChange(formatted);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          !isRut ||
          event.defaultPrevented ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        const input = event.currentTarget;
        const start = input.selectionStart;
        if (start === null || start !== input.selectionEnd) return;
        // Delete a digit together with adjacent punctuation, avoiding a stuck cursor.
        if (
          event.key === "Backspace" &&
          start > 0 &&
          /[.-]/.test(input.value[start - 1])
        ) {
          input.setSelectionRange(Math.max(0, start - 2), start);
        } else if (
          event.key === "Delete" &&
          /[.-]/.test(input.value[start] ?? "")
        ) {
          input.setSelectionRange(
            start,
            Math.min(input.value.length, start + 2),
          );
        }
      }}
    />
  );
}
