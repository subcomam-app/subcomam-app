import type { ControlPeriodCounts, NationalityCounts } from "./admin-domain";

export const statisticPeriods = [
  ["day", "Día"],
  ["week", "Semana"],
  ["month", "Mes"],
  ["year", "Año"],
  ["historical", "Histórico"],
] as const;

export function nationalityBreakdown(
  nationalities: NationalityCounts[],
  period: keyof ControlPeriodCounts,
) {
  const rows = nationalities
    .map((row) => ({ label: row.nationality, count: row[period] }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  // Keep a readable pie on phones without dropping any nationality or count.
  const grouped = rows.length > 8 ? rows.slice(7) : [];
  const slices = grouped.length
    ? [
        ...rows.slice(0, 7),
        {
          label: "Otras nacionalidades",
          count: grouped.reduce((sum, row) => sum + row.count, 0),
        },
      ]
    : rows;
  let cursor = 0;
  return {
    rows,
    total,
    grouped: grouped.length,
    slices: slices.map((slice) => {
      const start = cursor;
      cursor += slice.count / total;
      return { ...slice, start, end: cursor };
    }),
  };
}
