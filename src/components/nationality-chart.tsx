"use client";

import { useState } from "react";
import type {
  ControlPeriodCounts,
  ControlPeriodSummary,
} from "@/lib/admin-domain";
import {
  nationalityBreakdown,
  statisticPeriods,
} from "@/lib/nationality-statistics";

const colors = [
  "#246347",
  "#477da5",
  "#b47d2c",
  "#8566a3",
  "#a95664",
  "#3d8e8b",
  "#8b853c",
  "#68767b",
];
const number = (value: number) => value.toLocaleString("es-CL");
function percentage(count: number, total: number) {
  const value = (count / total) * 100;
  return value > 0 && value < 0.1
    ? "< 0,1 %"
    : `${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })} %`;
}
function sector(start: number, end: number) {
  const point = (turn: number) => {
    const angle = turn * 2 * Math.PI - Math.PI / 2;
    return `${(120 + 116 * Math.cos(angle)).toFixed(3)} ${(120 + 116 * Math.sin(angle)).toFixed(3)}`;
  };
  return `M 120 120 L ${point(start)} A 116 116 0 ${end - start > 0.5 ? 1 : 0} 1 ${point(end)} Z`;
}

export function NationalityChart({
  summary,
  own,
}: {
  summary: ControlPeriodSummary;
  own: boolean;
}) {
  const [period, setPeriod] = useState<keyof ControlPeriodCounts>("day");
  const { rows, slices, total, grouped } = nationalityBreakdown(
    summary.nationalities,
    period,
  );
  const label = statisticPeriods.find(([key]) => key === period)![1];
  return (
    <section
      className="card nationality-card"
      aria-label="Nacionalidades de los controles"
    >
      <div className="admin-section-heading">
        <div>
          <h2>Nacionalidades</h2>
          <p className="field-hint">
            {own ? "Tus controles" : "Controles de toda la unidad"} por
            nacionalidad.
          </p>
        </div>
      </div>
      <div
        className="nationality-periods"
        role="group"
        aria-label="Período de nacionalidades"
      >
        {statisticPeriods.map(([key, title]) => (
          <button
            key={key}
            type="button"
            aria-pressed={period === key}
            onClick={() => setPeriod(key)}
          >
            {title}
          </button>
        ))}
      </div>
      <p
        className="field-hint nationality-total"
        role="status"
        aria-live="polite"
      >
        {label}:{" "}
        <strong>
          {number(total)} {total === 1 ? "control" : "controles"}
        </strong>
        {period === "historical"
          ? " · Sin límite de fechas"
          : " · Período actual"}
      </p>
      {total === 0 ? (
        <div className="nationality-empty">Sin controles en este período.</div>
      ) : (
        <>
          <div className="nationality-chart-body">
            <svg
              className="nationality-pie"
              viewBox="0 0 240 240"
              role="img"
              aria-label={`Gráfico de torta de nacionalidades. ${label}: ${number(total)} controles. Cantidades y porcentajes en la tabla siguiente.`}
            >
              {slices.map((slice, index) =>
                slices.length === 1 ? (
                  <circle
                    key={slice.label}
                    cx="120"
                    cy="120"
                    r="116"
                    fill={colors[index]}
                  >
                    <title>
                      {slice.label}: {number(slice.count)} (
                      {percentage(slice.count, total)})
                    </title>
                  </circle>
                ) : (
                  <path
                    key={slice.label}
                    d={sector(slice.start, slice.end)}
                    fill={colors[index]}
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  >
                    <title>
                      {slice.label}: {number(slice.count)} (
                      {percentage(slice.count, total)})
                    </title>
                  </path>
                ),
              )}
            </svg>
            <table className="nationality-legend">
              <caption className="sr-only">Nacionalidades: {label}</caption>
              <thead>
                <tr>
                  <th scope="col">Nacionalidad</th>
                  <th scope="col">Controles</th>
                  <th scope="col">%</th>
                </tr>
              </thead>
              <tbody>
                {slices.map((slice, index) => (
                  <tr key={slice.label}>
                    <th scope="row">
                      <span
                        className="nationality-color"
                        style={{ backgroundColor: colors[index] }}
                        aria-hidden="true"
                      />
                      {slice.label}
                    </th>
                    <td>{number(slice.count)}</td>
                    <td>{percentage(slice.count, total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {grouped > 0 && (
            <details className="nationality-all">
              <summary>Ver las {number(rows.length)} nacionalidades</summary>
              <p className="field-hint">
                El gráfico reúne {number(grouped)} nacionalidades en «Otras
                nacionalidades».
              </p>
              <table className="nationality-legend">
                <caption className="sr-only">
                  Detalle completo por nacionalidad
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Nacionalidad</th>
                    <th scope="col">Controles</th>
                    <th scope="col">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td>{number(row.count)}</td>
                      <td>{percentage(row.count, total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <p className="field-hint">Cada control cuenta una vez.</p>
        </>
      )}
    </section>
  );
}
