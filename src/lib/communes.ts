import names from "@/data/chile-communes.json";
import { z } from "zod";

export function communeKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[-\s]+/g, " ")
    .toLocaleUpperCase("es");
}

// Alternative spellings used by Chilean public catalogs; each maps to one
// commune, never to a partial match, locality or a region. See src/data/README.md.
const aliases: Record<string, string[]> = {
  Aisén: ["Aysén"],
  Calera: ["La Calera"],
  Llaillay: ["Llay-Llay", "Llayllay"],
  Marchihue: ["Marchigüe"],
  Mostazal: ["San Francisco de Mostazal"],
  "O'Higgins": ["OHiggins", "O Higgins"],
  Paiguano: ["Paihuano"],
  Tiltil: ["Til Til"],
};

export const communes: readonly string[] = names;
const catalog = names.map((name) => ({
  name,
  keys: [name, ...(aliases[name] || [])].map(communeKey),
}));
const canonicalNames = new Map(
  catalog.flatMap(({ name, keys }) => keys.map((key) => [key, name] as const)),
);

export function normalizeCommune(value: string) {
  return canonicalNames.get(communeKey(value));
}

export function suggestCommunes(value: string) {
  const key = communeKey(value);
  return catalog
    .filter((item) => item.keys.some((name) => name.includes(key)))
    .sort(
      (a, b) =>
        Number(b.keys[0].startsWith(key)) - Number(a.keys[0].startsWith(key)) ||
        Number(b.keys.some((name) => name.startsWith(key))) -
          Number(a.keys.some((name) => name.startsWith(key))),
    )
    .map((item) => item.name);
}

export const communeSchema = z
  .string()
  .trim()
  .max(80)
  .transform((value, ctx) => {
    const commune = normalizeCommune(value);
    if (!commune) {
      ctx.addIssue({
        code: "custom",
        message: "Selecciona una comuna de Chile de la lista.",
      });
      return z.NEVER;
    }
    return commune;
  });
