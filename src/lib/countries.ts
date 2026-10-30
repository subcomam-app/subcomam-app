import spanish from "i18n-iso-countries/langs/es.json";
import { z } from "zod";

// Import only the pinned Spanish catalog, not the library's other locales.
const commonNames: Record<string, string[]> = {
  KR: ["Corea del Sur"],
  KP: ["Corea del Norte"],
  LA: ["Laos"],
  SY: ["Siria"],
  US: ["Estados Unidos", "EEUU", "EE. UU.", "USA"],
  NL: ["Países Bajos", "Holanda"],
  VA: ["Ciudad del Vaticano", "Vaticano"],
};

export function countryKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("es");
}

const catalog = Object.entries(spanish.countries)
  .map(([code, names]) => {
    const aliases = [...(commonNames[code] || []), ...[names].flat()];
    return { name: aliases[0], keys: aliases.map(countryKey) };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

export const countries = catalog.map(({ name }) => name);
const canonicalNames = new Map(
  catalog.flatMap(({ name, keys }) => keys.map((key) => [key, name] as const)),
);

export function normalizeCountry(value: string) {
  return canonicalNames.get(countryKey(value));
}

export function suggestCountries(value: string) {
  const key = countryKey(value);
  const matches = catalog.filter((country) =>
    country.keys.some((name) => name.includes(key)),
  );
  // Prefix matches first; never choose an ambiguous partial name automatically.
  return matches
    .sort(
      (a, b) =>
        Number(b.keys.some((name) => name.startsWith(key))) -
        Number(a.keys.some((name) => name.startsWith(key))),
    )
    .map(({ name }) => name);
}

export const countrySchema = z
  .string()
  .trim()
  .max(80)
  .transform((value, ctx) => {
    const country = normalizeCountry(value);
    if (!country) {
      ctx.addIssue({
        code: "custom",
        message: "Selecciona un país de la lista.",
      });
      return z.NEVER;
    }
    return country;
  });
