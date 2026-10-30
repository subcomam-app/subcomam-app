"use client";

import { useId, useRef, useState } from "react";

export function CanonicalNameInput({
  label,
  value,
  onChange,
  readOnly = false,
  options,
  normalize,
  placeholder,
  optionsLabel,
  invalidMessage,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  options: string[];
  normalize: (value: string) => string | undefined;
  placeholder: string;
  optionsLabel: string;
  invalidMessage: string;
}) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [touched, setTouched] = useState(false);
  const expanded = open && !readOnly;
  const invalid = !readOnly && touched && !normalize(value);

  function select(name: string) {
    onChange(name);
    setOpen(false);
    setActive(-1);
    setTouched(true);
  }

  return (
    <div className="country-input">
      <input
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-options` : undefined}
        aria-activedescendant={
          expanded && active >= 0 ? `${id}-option-${active}` : undefined
        }
        aria-invalid={invalid}
        aria-describedby={readOnly ? undefined : `${id}-hint`}
        autoComplete="off"
        spellCheck={false}
        required
        readOnly={readOnly}
        maxLength={80}
        placeholder={placeholder}
        value={value}
        onFocus={() => {
          setOpen(true);
          setActive(-1);
        }}
        onClick={() => {
          if (!open) {
            setOpen(true);
            setActive(-1);
          }
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
          setTouched(false);
        }}
        onBlur={(event) => {
          // A touch/click may focus an option before its click handler runs.
          if (
            event.relatedTarget &&
            list.current?.contains(event.relatedTarget)
          )
            return;
          setOpen(false);
          setActive(-1);
          setTouched(true);
          const canonical = normalize(value);
          if (!readOnly && canonical && canonical !== value)
            onChange(canonical);
        }}
        onKeyDown={(event) => {
          if (readOnly || event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setActive(-1);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const next =
              event.key === "ArrowDown"
                ? Math.min(active + 1, options.length - 1)
                : active < 0
                  ? options.length - 1
                  : Math.max(active - 1, 0);
            setActive(next);
            list.current?.children[next]?.scrollIntoView({ block: "nearest" });
          } else if (event.key === "Enter" && expanded) {
            event.preventDefault();
            if (active >= 0 && options[active]) select(options[active]);
            else {
              const canonical = normalize(value);
              if (canonical) select(canonical);
              else {
                setTouched(true);
                setActive(options.length ? 0 : -1);
              }
            }
          }
        }}
      />
      {expanded && (
        <div className="country-menu">
          <div
            id={`${id}-options`}
            role="listbox"
            aria-label={optionsLabel}
            ref={list}
            className="country-options"
          >
            {options.map((name, index) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                id={`${id}-option-${index}`}
                aria-selected={active === index}
                key={name}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {!options.length && (
            <p role="status" className="country-empty">
              Sin coincidencias. Revisa el nombre escrito.
            </p>
          )}
        </div>
      )}
      {!readOnly && (
        <p
          id={`${id}-hint`}
          className={`field-hint ${invalid ? "country-error" : ""}`}
        >
          {invalid
            ? invalidMessage
            : "Selecciona una sugerencia para usar el nombre correcto."}
        </p>
      )}
    </div>
  );
}
