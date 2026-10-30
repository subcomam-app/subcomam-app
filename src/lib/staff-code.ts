import { z } from "zod";

export function formatOfficerCode(value: string) {
  const match = value.trim().match(/^(\d{6})\s*-?\s*([a-z])$/i);
  // Preserve incomplete/invalid input and email addresses; never discard digits.
  return match ? `${match[1]}-${match[2].toUpperCase()}` : value;
}

export const officerCodeSchema = z
  .string()
  .trim()
  .transform(formatOfficerCode)
  .pipe(
    z
      .string()
      .regex(
        /^\d{6}-[A-Z]$/,
        "Ingresa seis números y una letra; el guion se agrega automáticamente.",
      ),
  );

// Supabase Auth uses an internal address; officials sign in only with their code.
export function officerAuthEmail(code: string) {
  return `${officerCodeSchema.parse(code).toLowerCase()}@funcionarios.subcomam.invalid`;
}
