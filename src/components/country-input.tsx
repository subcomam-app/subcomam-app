"use client";

import { normalizeCountry, suggestCountries } from "@/lib/countries";
import { CanonicalNameInput } from "./canonical-name-input";

export function CountryInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <CanonicalNameInput
      {...props}
      options={suggestCountries(props.value)}
      normalize={normalizeCountry}
      placeholder="Escribe para buscar un país"
      optionsLabel={`Países para ${props.label.toLowerCase()}`}
      invalidMessage="Selecciona un país de la lista."
    />
  );
}
