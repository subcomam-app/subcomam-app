"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type {
  ControlPeriodCounts,
  ControlPeriodSummary,
} from "@/lib/admin-domain";
import { api } from "./registration-form";
import { NationalityChart } from "./nationality-chart";

const columns = [
  ["day", "Hoy"],
  ["week", "Esta semana"],
  ["month", "Este mes"],
  ["year", "Este año"],
  ["historical", "Histórico"],
] as const;
const number = (value: number) => value.toLocaleString("es-CL");
type SortColumn = "name" | keyof ControlPeriodCounts;
const userColumns = [["name", "Usuario"], ...columns] as const;
const nameOrder = new Intl.Collator("es-CL", {
  sensitivity: "base",
  numeric: true,
});
const date = (value: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(new Date(`${value}T12:00:00Z`));

export function ControlTotals({ own }: { own: boolean }) {
  const [summary, setSummary] = useState<ControlPeriodSummary | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<{
    column: SortColumn;
    direction: "ascending" | "descending";
  }>({ column: "historical", direction: "descending" });
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ summary: ControlPeriodSummary }>(
      own ? "/api/account/statistics/summary" : "/api/admin/statistics/summary",
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setSummary(data.summary);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [own, revision]);

  const sortedUsers = [...(summary?.users || [])].sort((a, b) => {
    const primary =
      sort.column === "name"
        ? nameOrder.compare(a.name, b.name)
        : a[sort.column] - b[sort.column];
    return (
      (sort.direction === "ascending" ? primary : -primary) ||
      nameOrder.compare(a.name, b.name) ||
      nameOrder.compare(a.officer_code || "", b.officer_code || "") ||
      a.key.localeCompare(b.key)
    );
  });

  return (
    <section
      className="control-totals"
      aria-label={
        own ? "Mis controles por período" : "Controles de todos los usuarios"
      }
    >
      <div className="admin-section-heading">
        <div>
          <h2>{own ? "Mis controles por período" : "Controles por usuario"}</h2>
          <p className="field-hint">
            Día, semana, mes y año actuales · semana desde el lunes · horario de
            Chile.
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Actualizar totales"
          title="Actualizar totales"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={18} className={loading ? "spin" : ""} />
        </button>
      </div>
      {error ? (
        <div className="alert error" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="table-empty" role="status">
          <LoaderCircle className="spin" /> Cargando totales…
        </div>
      ) : (
        summary && (
          <>
            <p className="field-hint">
              Al {date(summary.date)}. Semana desde {date(summary.week_start)}.
              Histórico sin límite de fechas.
            </p>
            {own ? (
              <div className="control-totals-grid">
                {columns.map(([key, label]) => (
                  <article className="card control-total-card" key={key}>
                    <span>{label}</span>
                    <strong>{number(summary.totals[key])}</strong>
                    <small>controles</small>
                  </article>
                ))}
              </div>
            ) : (
              <>
                <p className="field-hint totals-scroll-hint">
                  Desliza la tabla para ver todos los períodos.
                </p>
                <div
                  className="card user-totals-scroll"
                  role="region"
                  aria-label="Tabla de controles de todos los usuarios"
                  tabIndex={0}
                >
                  <table className="user-totals-table">
                    <caption className="sr-only">
                      Controles por usuario: día, semana, mes, año e histórico
                    </caption>
                    <thead>
                      <tr>
                        {userColumns.map(([key, label]) => {
                          const active = sort.column === key;
                          const nextDirection = active
                            ? sort.direction === "ascending"
                              ? "descending"
                              : "ascending"
                            : key === "name"
                              ? "ascending"
                              : "descending";
                          const action =
                            key === "name"
                              ? nextDirection === "ascending"
                                ? "de A a Z"
                                : "de Z a A"
                              : nextDirection === "ascending"
                                ? "de menor a mayor"
                                : "de mayor a menor";
                          const Icon = !active
                            ? ArrowUpDown
                            : sort.direction === "ascending"
                              ? ArrowUp
                              : ArrowDown;
                          return (
                            <th
                              scope="col"
                              key={key}
                              aria-sort={active ? sort.direction : undefined}
                            >
                              <button
                                type="button"
                                className="totals-sort-button"
                                aria-label={`Ordenar por ${label} ${action}`}
                                title={`Ordenar ${action}`}
                                onClick={() =>
                                  setSort({
                                    column: key,
                                    direction: nextDirection,
                                  })
                                }
                              >
                                {label}
                                <Icon size={14} aria-hidden="true" />
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUsers.map((user) => (
                        <tr key={user.key}>
                          <th scope="row">
                            <span>{user.name}</span>
                            <small>
                              {user.officer_code ||
                                (user.role === "admin"
                                  ? "Administrador"
                                  : "Sin código")}
                              {user.historical_account
                                ? " · Sin cuenta vigente"
                                : ""}
                            </small>
                          </th>
                          {columns.map(([key]) => (
                            <td key={key}>{number(user[key])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Total de la unidad</th>
                        {columns.map(([key]) => (
                          <td key={key}>{number(summary.totals[key])}</td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
            <NationalityChart summary={summary} own={own} />
          </>
        )
      )}
    </section>
  );
}
