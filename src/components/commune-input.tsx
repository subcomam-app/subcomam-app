"use client";

import { normalizeCommune, suggestCommunes } from "@/lib/communes";
import { CanonicalNameInput } from "./canonical-name-input";

export function CommuneInput(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <CanonicalNameInput
      {...props}
      label="Comuna"
      options={suggestCommunes(props.value)}
      normalize={normalizeCommune}
      placeholder="Escribe para buscar una comuna de Chile"
      optionsLabel="Comunas de Chile"
      invalidMessage="Selecciona una comuna de Chile de la lista."
    />
  );
}
