"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Copy,
  KeyRound,
  History,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { chileDate } from "@/lib/domain";
import type { ManagedUser, Statistics } from "@/lib/admin-domain";
import { api } from "./registration-form";
import { StaffCodeInput } from "./staff-code-input";
import { Modal } from "./modal";
import { UserAccessHistory } from "./user-access-history";
import { ControlTotals } from "./control-period-summary";

const number = (value: number) => value.toLocaleString("es-CL");
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}
function initialPeriod() {
  const to = today();
  const start = new Date(`${to}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  return { from: start.toISOString().slice(0, 10), to };
}

export function StatisticsPanel({
  own = false,
  officerLabel,
}: {
  own?: boolean;
  officerLabel?: string;
}) {
  const [details, setDetails] = useState(false);
  return (
    <div className="admin-panel">
      {own && (
        <p className="field-hint">
          {officerLabel} · Controles registrados con tu cuenta.
        </p>
      )}
      <ControlTotals own={own} />
      <details
        className="statistics-details"
        onToggle={(event) => setDetails(event.currentTarget.open)}
      >
        <summary>Consultar un período personalizado</summary>
        {details && <PeriodStatisticsPanel own={own} />}
      </details>
    </div>
  );
}

function PeriodStatisticsPanel({ own = false }: { own?: boolean }) {
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(
    null,
  );
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => setPeriod(initialPeriod()), []);
  useEffect(() => {
    if (!period) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ statistics: Statistics }>(
      `${own ? "/api/account/statistics" : "/api/admin/statistics"}?${new URLSearchParams(period)}`,
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setStatistics(data.statistics);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period, own]);
  return (
    <div className="admin-panel">
      {period && (
        <form
          className="card admin-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPeriod({
              from: String(data.get("from")),
              to: String(data.get("to")),
            });
          }}
        >
          <div>
            <strong>Resumen de actividad</strong>
            <p className="field-hint">
              Fechas y horas de Chile continental · máximo 366 días
            </p>
          </div>
          <label className="field">
            Desde
            <input
              name="from"
              type="date"
              defaultValue={period.from}
              required
            />
          </label>
          <label className="field">
            Hasta
            <input name="to" type="date" defaultValue={period.to} required />
          </label>
          <button className="button primary" disabled={loading}>
            <RefreshCw size={16} /> Aplicar
          </button>
        </form>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="card table-empty">
          <LoaderCircle className="spin" />
          Cargando estadísticas…
        </div>
      ) : (
        !error &&
        statistics && (
          <>
            <div className="statistics-grid">
              {[
                [
                  "Controles del período",
                  statistics.period_controls,
                  "Procedimientos registrados",
                ],
                [
                  "Personas controladas",
                  statistics.period_people,
                  "Personas distintas en el período",
                ],
                [
                  own ? "Primer control contigo" : "Personas nuevas",
                  statistics.new_people,
                  own
                    ? "Personas que controlaste por primera vez"
                    : "Fichas creadas en el período",
                ],
                [
                  "Personas con controles repetidos",
                  statistics.repeated_people,
                  "Más de un control en el período",
                ],
              ].map(([label, value, hint]) => (
                <article className="card statistic-card" key={label}>
                  <span>{label}</span>
                  <strong>{number(value as number)}</strong>
                  <small>{hint}</small>
                </article>
              ))}
            </div>
            <section className="card chart-card">
              <div className="admin-section-heading">
                <h2>
                  <BarChart3 size={20} /> Controles por día
                </h2>
                <span className="badge green">
                  {period?.from} — {period?.to}
                </span>
              </div>
              {statistics.period_controls ? (
                <DailyChart data={statistics.daily} />
              ) : (
                <div className="table-empty">
                  <BarChart3 size={30} />
                  <h3>Sin controles en este período</h3>
                  <p>
                    El resumen se actualizará cuando se registren
                    procedimientos.
                  </p>
                </div>
              )}
              <details className="chart-details">
                <summary>Ver cifras por día</summary>
                <div className="daily-data">
                  <table>
                    <thead>
                      <tr>
                        <th>FECHA</th>
                        <th>CONTROLES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statistics.daily.map((day) => (
                        <tr key={day.date}>
                          <td>{day.date}</td>
                          <td>{number(day.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
            {!own && (
              <Breakdown
                title="Controles por funcionario"
                rows={statistics.officers}
                note="Hasta 10 funcionarios, según el nombre registrado en cada control."
              />
            )}
            <p className="admin-total">
              {own ? "Tu acumulado histórico:" : "Acumulado histórico:"}{" "}
              <strong>{number(statistics.total_people)} personas</strong> y{" "}
              <strong>{number(statistics.total_controls)} controles</strong>.
            </p>
          </>
        )
      )}
    </div>
  );
}
function DailyChart({ data }: { data: Statistics["daily"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const points = data
    .map(
      (d, i) =>
        `${35 + (i * 930) / Math.max(data.length - 1, 1)},${180 - (d.count / max) * 145}`,
    )
    .join(" ");
  return (
    <div className="daily-chart">
      <svg
        viewBox="0 0 1000 220"
        role="img"
        aria-label={`Controles por día. Máximo diario: ${max}. Las cifras se encuentran en la tabla inferior.`}
      >
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <line
              x1="35"
              y1={180 - i * 72.5}
              x2="965"
              y2={180 - i * 72.5}
              stroke="#e5e9e4"
            />
            <text x="8" y={185 - i * 72.5} fontSize="12" fill="#5e6a64">
              {Math.round((max * i) / 2)}
            </text>
          </g>
        ))}
        <polygon
          points={`35,180 ${points} ${data.length > 1 ? 965 : 35},180`}
          fill="#edf5ee"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#246347"
          strokeWidth="3"
        />
        {data.length === 1 && (
          <circle
            cx="35"
            cy={180 - (data[0].count / max) * 145}
            r="5"
            fill="#246347"
          />
        )}
        <text x="35" y="211" fontSize="13" fill="#5e6a64">
          {data[0]?.date}
        </text>
        <text x="965" y="211" textAnchor="end" fontSize="13" fill="#5e6a64">
          {data.at(-1)?.date}
        </text>
      </svg>
    </div>
  );
}
function Breakdown({
  title,
  rows,
  note,
}: {
  title: string;
  rows: { label: string; count: number }[];
  note?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="card chart-card">
      <h2>{title}</h2>
      {note && <p className="field-hint">{note}</p>}
      {rows.length ? (
        <ul className="breakdown-list">
          {rows.map((row) => (
            <li key={row.label}>
              <div>
                <span>{row.label}</span>
                <strong>{number(row.count)}</strong>
              </div>
              <div className="breakdown-track">
                <span style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-empty">Sin datos en el período seleccionado.</p>
      )}
    </section>
  );
}

type UserResult = {
  user?: ManagedUser;
  access_link?: string | null;
  warning?: string;
  message?: string;
};
export function UsersPanel({ currentId }: { currentId: string | null }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<ManagedUser | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [accessTarget, setAccessTarget] = useState<ManagedUser | null>(null);
  const [editorRole, setEditorRole] = useState<"admin" | "officer">("officer");
  const [accessLink, setAccessLink] = useState<{
    email: string;
    url: string;
  } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const data = await api<{ users: ManagedUser[]; total: number }>(
          `/api/admin/users?page=${page}`,
          undefined,
          signal,
        );
        if (!signal?.aborted) {
          setUsers(data.users);
          setTotal(data.total);
        }
      } catch (err) {
        if (!signal?.aborted) setError((err as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (editor) {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [editor]);
  async function act(body: unknown, closeEditor = false) {
    setBusy(true);
    setError("");
    setMessage("");
    setAccessLink(null);
    try {
      const data = await api<UserResult>("/api/admin/users", body);
      setMessage(
        data.warning || data.message || "Cuenta actualizada correctamente.",
      );
      if (data.access_link && data.user)
        setAccessLink({
          email: data.user.officer_code || data.user.email,
          url: data.access_link,
        });
      if (closeEditor) setEditor(null);
      await load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const editing = editor && editor !== "new" ? editor : null;
  return (
    <div className="admin-panel">
      {accessTarget && (
        <UserAccessHistory
          key={accessTarget.id}
          user={accessTarget}
          onClose={() => setAccessTarget(null)}
        />
      )}
      {deleteTarget && (
        <Modal
          title="Eliminar usuario"
          onClose={() => {
            if (!busy) setDeleteTarget(null);
          }}
        >
          <p>
            ¿Eliminar la cuenta de <strong>{deleteTarget.name}</strong> (
            {deleteTarget.officer_code || deleteTarget.email})?
          </p>
          <p className="modal-description">
            Ya no podrá ingresar. Sus controles, fotografías y actas se
            conservarán. Esta acción no se puede deshacer.
          </p>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await act({ action: "delete", id: deleteTarget.id }, true)
                ) {
                  setDeleteTarget(null);
                  if (users.length === 1 && page > 1) setPage(page - 1);
                }
              }}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Trash2 size={17} />
              )}{" "}
              {busy ? "Eliminando…" : "Eliminar usuario"}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeleteTarget(null)}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
      <div className="admin-toolbar">
        <div>
          <strong>{number(total)} cuentas registradas</strong>
          <p className="field-hint">Administra los accesos de la unidad.</p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setEditor("new");
            setEditorRole("officer");
            setError("");
            setAccessLink(null);
          }}
          disabled={busy}
        >
          <Plus size={17} /> Nuevo usuario
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button
            className="button text-button"
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Actualizar lista
          </button>
        </div>
      )}
      {message && (
        <div className="alert neutral" role="status">
          {message}
        </div>
      )}
      {accessLink && (
        <section className="card access-link-card">
          <h3>
            <KeyRound size={19} /> Acceso para {accessLink.email}
          </h3>
          <p>
            Comparte este enlace de forma privada con el titular para que defina
            su contraseña. Es de un solo uso y tiene vencimiento. No se ha
            enviado por correo.
          </p>
          <div className="access-link-row field">
            <input
              aria-label="Enlace de acceso"
              value={accessLink.url}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(accessLink.url);
                  setMessage("Enlace copiado.");
                } catch {
                  setMessage("Selecciona y copia el enlace del campo.");
                }
              }}
            >
              <Copy size={16} /> Copiar
            </button>
            <button
              className="icon-button"
              aria-label="Ocultar enlace"
              onClick={() => setAccessLink(null)}
            >
              <X size={18} />
            </button>
          </div>
        </section>
      )}
      {editor && (
        <section className="card user-editor">
          <div className="admin-section-heading">
            <h2 ref={heading} tabIndex={-1}>
              {editing ? "Editar usuario" : "Crear usuario"}
            </h2>
            <button
              className="icon-button"
              aria-label="Cerrar formulario"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              <X size={19} />
            </button>
          </div>
          <form
            key={editing?.id || "new"}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              if (!editing && data.get("password") !== data.get("confirm")) {
                setError("Las contraseñas no coinciden.");
                return;
              }
              void act(
                editing
                  ? {
                      action: "update",
                      id: editing.id,
                      name: data.get("name"),
                      ...(data.get("officer_code")
                        ? { officer_code: data.get("officer_code") }
                        : {}),
                      ...(data.has("officer_grade")
                        ? { officer_grade: data.get("officer_grade") }
                        : {}),
                      role:
                        editing.id === currentId ? "admin" : data.get("role"),
                      active:
                        editing.id === currentId ||
                        data.get("active") === "true",
                    }
                  : {
                      action: "create",
                      name: data.get("name"),
                      ...(editorRole === "officer"
                        ? {
                            officer_code: data.get("officer_code"),
                            officer_grade: data.get("officer_grade"),
                          }
                        : { email: data.get("email") }),
                      role: data.get("role"),
                      password: data.get("password"),
                    },
                true,
              );
            }}
          >
            <div className="fields-grid">
              <label className="field">
                Nombre completo
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue={editing?.name || ""}
                  autoComplete="name"
                />
              </label>
              {(editorRole === "officer" || editing?.officer_code) && (
                <label className="field">
                  Código de funcionario
                  <StaffCodeInput
                    name="officer_code"
                    required={editorRole === "officer"}
                    pattern="[0-9]{6}-[A-Za-z]"
                    minLength={8}
                    maxLength={32}
                    placeholder="111111-M"
                    defaultValue={editing?.officer_code || ""}
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                </label>
              )}
              {editorRole === "officer" && (
                <label className="field">
                  Grado del funcionario
                  <input
                    name="officer_grade"
                    maxLength={60}
                    defaultValue={editing?.officer_grade || ""}
                    placeholder="Ej.: Sargento 2°"
                    autoComplete="off"
                  />
                  <small className="field-hint">
                    Se incorpora automáticamente en sus controles y actas.
                  </small>
                </label>
              )}
              {editorRole === "admin" && !editing?.officer_code && (
                <label className="field">
                  Correo electrónico
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={editing?.email || ""}
                    readOnly={!!editing}
                    autoComplete="email"
                  />
                </label>
              )}
              <label className="field">
                Perfil
                <select
                  name="role"
                  value={editorRole}
                  onChange={(event) =>
                    setEditorRole(event.target.value as "admin" | "officer")
                  }
                  disabled={editing?.id === currentId}
                >
                  <option value="officer">Funcionario</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              {!editing && (
                <>
                  <label className="field">
                    Contraseña inicial
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={6}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="field">
                    Repetir contraseña inicial
                    <input
                      name="confirm"
                      type="password"
                      required
                      minLength={6}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                </>
              )}
              {editing && (
                <label className="field">
                  Estado
                  <select
                    name="active"
                    defaultValue={String(editing.active)}
                    disabled={editing.id === currentId}
                  >
                    <option value="true">Activo</option>
                    <option value="false">Suspendido</option>
                  </select>
                </label>
              )}
            </div>
            <p className="field-hint">
              Funcionario: ingresa con su código y consulta sus propias
              estadísticas. Administrador: acceso separado para estadísticas
              generales y gestión de cuentas.
            </p>
            {!editing && (
              <p className="field-hint">
                Usa al menos 6 caracteres y entrega la clave al titular de forma
                privada. Deberá cambiarla en su primer ingreso, sin
                confirmaciones por correo.
              </p>
            )}
            <div className="button-row">
              <button className="button primary" disabled={busy}>
                {busy && <LoaderCircle size={16} className="spin" />}
                {editing ? "Guardar cambios" : "Crear cuenta"}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="card records-card">
        <div className="records-heading">
          <div className="records-title">
            <UsersRound size={21} />
            <h2>Usuarios de la plataforma</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Actualizar usuarios"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        {loading ? (
          <div className="table-empty">
            <LoaderCircle className="spin" />
            <p>Cargando usuarios…</p>
          </div>
        ) : (
          <div className="table-scroll record-table users-table">
            <table>
              <thead>
                <tr>
                  <th>USUARIO</th>
                  <th>PERFIL</th>
                  <th>ESTADO</th>
                  <th>ÚLTIMO INGRESO</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>
                        {user.name}
                        {user.id === currentId ? " (tú)" : ""}
                      </strong>
                      <small>{user.officer_code || user.email}</small>
                    </td>
                    <td data-label="Perfil">
                      {user.role === "admin" ? (
                        <span className="badge green">
                          <ShieldCheck size={13} /> Administrador
                        </span>
                      ) : user.role === "officer" ? (
                        "Funcionario"
                      ) : (
                        "Sin acceso"
                      )}
                    </td>
                    <td data-label="Estado">
                      {!user.active ? (
                        <span className="badge suspended">Suspendido</span>
                      ) : user.pending ? (
                        "Pendiente de activación"
                      ) : user.must_change_password ? (
                        "Debe cambiar clave inicial"
                      ) : (
                        <span className="badge green">Activo</span>
                      )}
                    </td>
                    <td data-label="Último ingreso">
                      {user.last_sign_in_at
                        ? chileDate(user.last_sign_in_at, true)
                        : "Sin ingresos"}
                    </td>
                    <td>
                      <div className="user-actions">
                        <button
                          className="icon-button"
                          aria-label={`Editar ${user.officer_code || user.email}`}
                          title="Editar usuario"
                          disabled={busy}
                          onClick={() => {
                            setEditor(user);
                            setEditorRole(
                              user.role === "admin" ? "admin" : "officer",
                            );
                            setAccessLink(null);
                          }}
                        >
                          <Pencil size={18} aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Ver accesos de ${user.officer_code || user.email}`}
                          title="Ver accesos"
                          disabled={busy}
                          onClick={() => setAccessTarget(user)}
                        >
                          <History size={18} aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Generar enlace para ${user.officer_code || user.email}`}
                          title="Generar enlace de acceso"
                          disabled={
                            busy || !user.active || user.role === "none"
                          }
                          onClick={() =>
                            void act({ action: "access_link", id: user.id })
                          }
                        >
                          <KeyRound size={18} aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button danger-icon"
                          aria-label={`Eliminar ${user.officer_code || user.email}`}
                          title={
                            user.id === currentId
                              ? "No puedes eliminar tu cuenta actual"
                              : "Eliminar usuario"
                          }
                          disabled={busy || user.id === currentId}
                          onClick={() => {
                            setError("");
                            setDeleteTarget(user);
                          }}
                        >
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users.length && (
              <div className="table-empty">No hay usuarios en esta página.</div>
            )}
          </div>
        )}
        {total > 20 && (
          <div className="pagination">
            <span>
              Página {page} de {Math.ceil(total / 20)}
            </span>
            <div>
              <button
                className="button secondary"
                disabled={page === 1 || loading || busy}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <button
                className="button secondary"
                disabled={page * 20 >= total || loading || busy}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
