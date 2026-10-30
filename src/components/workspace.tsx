"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  FileClock,
  Fingerprint,
  History,
  Info,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  ShieldCheck,
  UsersRound,
  UserRound,
} from "lucide-react";
import {
  chileDate,
  displayDocument,
  type Control,
  type Person,
} from "@/lib/domain";
import { api, RegistrationForm } from "./registration-form";
import { StatisticsPanel, UsersPanel } from "./admin-panel";
import { ControlPhoto } from "./control-photo";
import { ControlDocument } from "./control-document";
import { StaffCodeInput } from "./staff-code-input";
import { Modal } from "./modal";
import { DeleteControlButton } from "./delete-control-button";

type View = "new" | "people" | "history" | "statistics" | "users";
type Staff = {
  id: string | null;
  name: string;
  local: boolean;
  temporary: boolean;
  role: "admin" | "officer";
  officer_code: string | null;
  officer_grade: string;
  must_change_password: boolean;
};
const titles: Record<View, string> = {
  new: "Nuevo control",
  people: "Personas",
  history: "Historial",
  statistics: "Estadísticas",
  users: "Usuarios",
};

export function Workspace({
  portal = "officer",
}: {
  portal?: "officer" | "admin";
}) {
  const adminPortal = portal === "admin";
  const initialView = adminPortal ? "statistics" : "new";
  const [view, setView] = useState<View>(initialView);
  const [session, setSession] = useState<Staff | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [controlCount, setControlCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | undefined>();
  const [formVersion, setFormVersion] = useState(0);
  const [detail, setDetail] = useState<Control | null>(null);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      if (view !== "people" && view !== "history") return;
      setLoading(true);
      setError("");
      try {
        if (view === "people") {
          const data = await api<{ people: Person[]; count: number }>(
            `/api/people?page=${page}`,
            undefined,
            signal,
          );
          if (signal?.aborted) return;
          setPeople(data.people);
          setPeopleCount(data.count);
        } else {
          const data = await api<{ controls: Control[]; count: number }>(
            `/api/controls?page=${page}`,
            undefined,
            signal,
          );
          if (signal?.aborted) return;
          setControls(data.controls);
          setControlCount(data.count);
        }
      } catch (err) {
        if (!signal?.aborted) setError((err as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [view, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    api<{ user: Staff }>("/api/session", undefined, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.user.must_change_password) {
          window.location.replace("/cuenta");
          return;
        }
        if (data.user.role !== portal) {
          window.location.replace(data.user.role === "admin" ? "/admin" : "/");
          return;
        }
        setSession(data.user);
        setView(initialView);
        setSessionChecked(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSessionChecked(true);
        }
      });
    return () => controller.abort();
  }, [initialView, portal]);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [session, loadData]);

  function navigate(next: View) {
    setView(next);
    setPage(1);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function startNew(person?: Person) {
    setSelectedPerson(person);
    setFormVersion((v) => v + 1);
    navigate("new");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    const values = new FormData(event.currentTarget);
    try {
      const signed = await api<{ must_change_password: boolean }>(
        "/api/session",
        {
          identifier: values.get("identifier"),
          password: values.get("password"),
          portal,
        },
      );
      if (signed.must_change_password) {
        window.location.assign("/cuenta");
        return;
      }
      const data = await api<{ user: Staff }>("/api/session");
      setSession(data.user);
      setFormVersion((value) => value + 1);
      setView(initialView);
    } catch (err) {
      setLoginError((err as Error).message);
    } finally {
      setLoggingIn(false);
    }
  }
  async function signOut() {
    try {
      const response = await fetch("/api/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok)
        throw new Error("No fue posible cerrar la sesión. Intenta nuevamente.");
    } catch {
      setError("No fue posible cerrar la sesión. Intenta nuevamente.");
      return;
    }
    setSession(null);
    setView(initialView);
    setPeople([]);
    setControls([]);
    setPeopleCount(0);
    setControlCount(0);
    setSelectedPerson(undefined);
    setDetail(null);
    setFormVersion((v) => v + 1);
  }
  const navigation = [
    ...(!adminPortal
      ? [
          {
            view: "new" as const,
            label: "Control",
            title: "Nuevo control",
            icon: Fingerprint,
          },
        ]
      : [
          {
            view: "people" as const,
            label: "Personas",
            title: "Personas registradas",
            icon: UsersRound,
          },
        ]),
    {
      view: "history" as const,
      label: adminPortal ? "Controles" : "Mis controles",
      title: adminPortal ? "Todos los controles" : "Mis controles",
      icon: FileClock,
    },
    ...(session
      ? [
          {
            view: "statistics" as const,
            label: session.role === "admin" ? "Resumen" : "Mis cifras",
            title:
              session.role === "admin" ? "Estadísticas" : "Mis estadísticas",
            icon: LayoutDashboard,
          },
          {
            view: "password" as const,
            label: "Cambiar clave",
            title: "Cambiar clave",
            icon: KeyRound,
          },
          ...(session.role === "admin"
            ? [
                {
                  view: "users" as const,
                  label: "Usuarios",
                  title: "Gestión de usuarios",
                  icon: ShieldCheck,
                },
              ]
            : []),
        ]
      : []),
  ];

  if (!session)
    return (
      <main className="activation-shell">
        <section className="card activation-card account-card">
          {adminPortal ? <ShieldCheck size={32} /> : <Fingerprint size={32} />}
          <div className="eyebrow">SUBCOMAM</div>
          <h1>
            {adminPortal ? "Acceso administrador" : "Acceso funcionarios"}
          </h1>
          <p>
            {adminPortal
              ? "Todos los controles, estadísticas generales y gestión de usuarios."
              : "Registra controles, descarga tus actas y consulta tu actividad."}
          </p>
          {!sessionChecked ? (
            <p role="status">Comprobando sesión…</p>
          ) : (
            <form className="login-form" onSubmit={signIn}>
              {loginError && (
                <p className="alert error" role="alert">
                  {loginError}
                </p>
              )}
              <label>
                {adminPortal ? "Correo administrador" : "Código de funcionario"}
                <StaffCodeInput
                  name="identifier"
                  type={adminPortal ? "email" : "text"}
                  autoComplete="username"
                  required
                  autoCapitalize={adminPortal ? "none" : "characters"}
                  placeholder={adminPortal ? "Correo de tu cuenta" : "111111-M"}
                />
              </label>
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <button className="button primary" disabled={loggingIn}>
                {loggingIn ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <LogIn size={17} />
                )}
                {loggingIn ? "Ingresando…" : "Ingresar"}
              </button>
              <p className="field-hint">
                {adminPortal
                  ? "Acceso exclusivo para cuentas administradoras."
                  : "Usa la cuenta creada por tu administrador. En el primer ingreso deberás cambiar la clave inicial."}
              </p>
            </form>
          )}
          <a className="text-link" href={adminPortal ? "/" : "/admin"}>
            {adminPortal ? "Acceso de funcionarios" : "Acceso administrador"}
          </a>
        </section>
      </main>
    );

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href={adminPortal ? "/admin" : "/"}
          aria-label={
            adminPortal ? "SUBCOMAM, administración" : "SUBCOMAM, inicio"
          }
        >
          <ShieldCheck size={23} strokeWidth={1.6} />
          <span>
            SUBCOMAM
            {adminPortal && (
              <small className="portal-label">ADMINISTRACIÓN</small>
            )}
          </span>
        </a>
        <nav className="app-navigation" aria-label="Navegación principal">
          {navigation.map(({ view: destination, label, title, icon: Icon }) => (
            <button
              key={destination}
              className={view === destination ? "active" : ""}
              aria-label={title}
              title={title}
              aria-current={view === destination ? "page" : undefined}
              onClick={() =>
                destination === "password"
                  ? window.location.assign("/cuenta")
                  : navigate(destination)
              }
            >
              <Icon size={20} strokeWidth={1.7} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Panel principal"
            title="Panel principal"
            onClick={() => navigate(initialView)}
          >
            <UserRound size={21} />
          </button>
          <button
            className="icon-button"
            aria-label="Guía de uso"
            onClick={() => setHelpOpen(true)}
          >
            <CircleHelp size={21} />
          </button>
          {sessionChecked && (
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              title={session?.name || "Iniciar sesión"}
              onClick={() => void signOut()}
            >
              <LogOut size={20} />
            </button>
          )}
        </div>
      </header>
      <div className="main-shell">
        <main
          id="main-content"
          className={
            view === "new"
              ? "workspace-content form-content"
              : "workspace-content"
          }
        >
          <div className="page-heading">
            <h1>
              {view === "statistics"
                ? adminPortal
                  ? "Estadísticas generales"
                  : "Mis estadísticas"
                : view === "history"
                  ? adminPortal
                    ? "Todos los controles"
                    : "Mis controles"
                  : titles[view]}
            </h1>
            {!adminPortal && view === "history" && (
              <button className="button primary" onClick={() => startNew()}>
                <Plus size={17} /> Nuevo control
              </button>
            )}
          </div>
          {!adminPortal && (
            <div hidden={view !== "new"}>
              <RegistrationForm
                key={formVersion}
                initialPerson={selectedPerson}
                staff={session}
                onSaved={() => void loadData()}
                onHistory={() => navigate("history")}
              />
            </div>
          )}
          {session && view === "statistics" && (
            <StatisticsPanel
              key={session.id || "temporary"}
              own={session.role === "officer"}
              officerLabel={[session.officer_code, session.name]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
          {session?.role === "admin" && view === "users" && (
            <UsersPanel currentId={session.id} />
          )}
          {error && (
            <div className="alert error" role="alert">
              <Info size={18} />
              <span>{error}</span>
              <button
                className="button text-button"
                onClick={() => void loadData()}
              >
                Reintentar
              </button>
            </div>
          )}
          {notice && (
            <div className="alert positive" role="status">
              {notice}
            </div>
          )}
          {(view === "people" || view === "history") && (
            <section className="card records-card">
              <div className="records-heading">
                <div className="records-title">
                  <span className="records-icon">
                    {view === "people" ? (
                      <UsersRound size={19} />
                    ) : (
                      <History size={19} />
                    )}
                  </span>
                  <h2>
                    {view === "people"
                      ? "Directorio de personas"
                      : adminPortal
                        ? "Historial de la unidad"
                        : "Controles registrados por ti"}
                  </h2>
                  <span className="count-badge">
                    {loading
                      ? "…"
                      : view === "people"
                        ? peopleCount
                        : controlCount}
                  </span>
                </div>
              </div>
              {loading ? (
                <div className="table-empty">
                  <LoaderCircle size={25} className="spin" />
                  <p>Cargando registros…</p>
                </div>
              ) : view === "people" ? (
                <>
                  <div className="table-scroll record-table">
                    <table>
                      <thead>
                        <tr>
                          <th>PERSONA</th>
                          <th>DOCUMENTO</th>
                          <th>NACIONALIDAD</th>
                          <th>ÚLTIMO CONTROL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <div className="table-person">
                                <span className="table-avatar">
                                  {p.first_names[0]}
                                  {p.last_names[0]}
                                </span>
                                <strong>
                                  {p.first_names} {p.last_names}
                                </strong>
                              </div>
                            </td>
                            <td>
                              <strong className="document-cell">
                                {displayDocument(
                                  p.document_type,
                                  p.document_number,
                                )}
                              </strong>
                              <small>
                                {p.document_type} · {p.issuing_country}
                              </small>
                            </td>
                            <td data-label="Nacionalidad">{p.nationality}</td>
                            <td data-label="Último control">
                              {p.last_control_at
                                ? chileDate(p.last_control_at, true)
                                : "Sin controles"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {people.length === 0 && (
                    <EmptyTable
                      title="Aún no hay personas registradas"
                      description="Las fichas aparecerán aquí al guardar el primer control."
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="table-scroll record-table">
                    <table>
                      <thead>
                        <tr>
                          <th>PERSONA</th>
                          <th>DOCUMENTO</th>
                          <th>FECHA DEL CONTROL</th>
                          <th>PROCEDIMIENTO</th>
                          <th>
                            <span className="sr-only">Detalle</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {controls.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <div className="table-person">
                                <span className="table-avatar">
                                  {c.persons?.first_names[0]}
                                  {c.persons?.last_names[0]}
                                </span>
                                <strong>
                                  {c.persons?.first_names}{" "}
                                  {c.persons?.last_names}
                                </strong>
                              </div>
                            </td>
                            <td>
                              <strong className="document-cell">
                                {displayDocument(
                                  c.persons?.document_type || "",
                                  c.persons?.document_number || "",
                                )}
                              </strong>
                              <small>
                                {c.persons?.document_type} ·{" "}
                                {c.persons?.issuing_country}
                              </small>
                            </td>
                            <td data-label="Fecha">
                              {chileDate(c.controlled_at, true)}
                            </td>
                            <td>
                              <span className="table-procedure">
                                {c.art12bis ? "Art. 12 bis" : c.reason}
                              </span>
                            </td>
                            <td>
                              <div className="user-actions">
                                <button
                                  className="icon-button"
                                  aria-label={`Ver control de ${c.persons?.first_names}`}
                                  onClick={() => setDetail(c)}
                                >
                                  <ArrowRight size={17} />
                                </button>
                                {adminPortal && session.role === "admin" && (
                                  <DeleteControlButton
                                    control={c}
                                    onDeleted={() => {
                                      setDetail(null);
                                      setNotice(
                                        "Control eliminado. Vuelve a buscar la persona para ingresar el control corregido.",
                                      );
                                      if (controls.length === 1 && page > 1)
                                        setPage((value) => value - 1);
                                      else void loadData();
                                    }}
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {controls.length === 0 && (
                    <EmptyTable
                      title="Todo listo para el primer control"
                      description="Los procedimientos registrados aparecerán aquí, del más reciente al más antiguo."
                    />
                  )}
                </>
              )}
              {(view === "people" ? peopleCount : controlCount) > 20 && (
                <div className="pagination">
                  <span>
                    Página {page} de{" "}
                    {Math.ceil(
                      (view === "people" ? peopleCount : controlCount) / 20,
                    )}
                  </span>
                  <div>
                    <button
                      className="button secondary"
                      disabled={page === 1 || loading}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft size={16} /> Anterior
                    </button>
                    <button
                      className="button secondary"
                      disabled={
                        page * 20 >=
                          (view === "people" ? peopleCount : controlCount) ||
                        loading
                      }
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Siguiente <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
      {helpOpen && (
        <Modal title="Guía de uso" onClose={() => setHelpOpen(false)}>
          <div className="help-content">
            <p>Registra cada control en tres pasos:</p>
            <ol>
              <li>
                <strong>Identificación.</strong> Selecciona RUT, DNI, pasaporte
                u otro documento. Ingresa su número y, para documentos
                extranjeros, su país emisor. Las coincidencias aparecen al
                escribir.
              </li>
              <li>
                <strong>Datos personales.</strong> Selecciona una ficha
                existente para recuperar los datos y el último control. Si el
                documento no existe, pulsa «Registrar nueva persona».
              </li>
              <li>
                <strong>Datos del control.</strong> Completa motivo, funcionario
                y lugar, y adjunta una foto actualizada de la persona. Al
                guardar, la plataforma asigna la fecha y hora y conserva el
                registro en el historial.
              </li>
            </ol>
            <div className="info-note">
              <Info size={18} />
              <p>
                La nacionalidad y el país que emitió el documento pueden ser
                distintos. El RUT se valida con su dígito verificador.
              </p>
            </div>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title="Detalle del control" onClose={() => setDetail(null)}>
          <div className="detail-identity">
            <span className="badge green">
              <Check size={12} /> Registrado
            </span>
            <h3>
              {detail.persons?.first_names} {detail.persons?.last_names}
            </h3>
            <p>
              {detail.persons?.document_type} ·{" "}
              {displayDocument(
                detail.persons?.document_type || "",
                detail.persons?.document_number || "",
              )}
            </p>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Fecha y hora</dt>
              <dd>{chileDate(detail.controlled_at, true)}</dd>
            </div>
            <div>
              <dt>Motivo</dt>
              <dd>
                {detail.reason}
                {detail.art12bis ? " · Art. 12 bis" : ""}
              </dd>
            </div>
            <div>
              <dt>Funcionario</dt>
              <dd>
                {[detail.art12bis?.officer_grade, detail.officer]
                  .filter(Boolean)
                  .join(" · ")}
                {detail.officer_code ? ` · ${detail.officer_code}` : ""}
              </dd>
            </div>
            <div>
              <dt>Lugar</dt>
              <dd>{detail.location}</dd>
            </div>
            <div className="field-wide">
              <dt>Observaciones</dt>
              <dd className="notes-detail">
                {detail.notes || "Sin observaciones."}
              </dd>
            </div>
          </dl>
          <ControlDocument key={`document-${detail.id}`} control={detail} />
          <ControlPhoto key={detail.id} control={detail} />
        </Modal>
      )}
    </div>
  );
}

function EmptyTable({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="table-empty">
      <span className="empty-table-icon">
        <ClipboardCheck size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
