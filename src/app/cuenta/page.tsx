"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  KeyRound,
  LoaderCircle,
  LogOut,
  UserRound,
} from "lucide-react";
import { api } from "@/components/registration-form";
import { StaffCodeInput } from "@/components/staff-code-input";

type Account = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "officer";
  officer_code: string | null;
  must_change_password: boolean;
};

export default function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (response.status === 401) return;
        if (!response.ok) throw new Error(data.error);
        setAccount(data.user);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    setMessage("");
    if (account && data.get("password") !== data.get("confirm")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      if (!account) {
        await api("/api/session", {
          identifier: data.get("identifier"),
          password: data.get("password"),
        });
        const result = await api<{ user: Account }>("/api/account");
        form.reset();
        setAccount(result.user);
      } else {
        const result = await api<{ sign_in_required: boolean }>(
          "/api/account/password",
          {
            current_password: data.get("current_password"),
            password: data.get("password"),
          },
        );
        form.reset();
        if (result.sign_in_required) setAccount(null);
        else if (account.must_change_password) {
          window.location.assign(account.role === "admin" ? "/admin" : "/");
          return;
        }
        setMessage(
          result.sign_in_required
            ? "Contraseña cambiada. Inicia sesión con tu nueva contraseña."
            : "Contraseña cambiada correctamente. Ya puedes usar la nueva contraseña.",
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok)
        throw new Error("No se pudo cerrar la sesión. Intenta nuevamente.");
      setAccount(null);
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="activation-shell">
      <section className="card activation-card account-card">
        <UserRound size={32} aria-hidden="true" />
        <h1>Mi cuenta</h1>
        <p>
          {account
            ? `${account.name} · ${account.officer_code || account.email}`
            : "Funcionarios: código 111111-M. Administrador: correo de acceso."}
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="alert neutral" role="status">
            {message}
          </div>
        )}
        {loading ? (
          <p role="status">Cargando cuenta…</p>
        ) : (
          <form
            className="login-form"
            key={account?.id || "login"}
            onSubmit={submit}
          >
            <fieldset disabled={busy} className="control-fieldset">
              {account ? (
                <>
                  <h2>
                    {account.must_change_password
                      ? "Cambia tu contraseña inicial"
                      : "Cambiar contraseña"}
                  </h2>
                  {account.must_change_password && (
                    <p className="field-hint">
                      Debes definir una contraseña personal antes de registrar
                      controles o consultar estadísticas.
                    </p>
                  )}
                  <input
                    type="hidden"
                    name="username"
                    value={account.officer_code || account.email}
                    readOnly
                    autoComplete="username"
                  />
                  <label>
                    {account.must_change_password
                      ? "Contraseña inicial"
                      : "Contraseña actual"}
                    <input
                      name="current_password"
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={256}
                    />
                  </label>
                  <label>
                    Nueva contraseña
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      maxLength={128}
                    />
                  </label>
                  <label>
                    Repetir nueva contraseña
                    <input
                      name="confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      maxLength={128}
                    />
                  </label>
                  <p className="field-hint">
                    Al menos 6 caracteres. El cambio es inmediato y no requiere
                    confirmación por correo.
                  </p>
                </>
              ) : (
                <>
                  <label>
                    Código de funcionario o correo administrador
                    <StaffCodeInput
                      name="identifier"
                      type="text"
                      placeholder="111111-M / correo administrador"
                      autoComplete="username"
                      required
                    />
                  </label>
                  <label>
                    Contraseña
                    <input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={256}
                    />
                  </label>
                  <p className="field-hint">
                    Si olvidaste tu contraseña, solicita al administrador un
                    enlace de recuperación. No necesitas recibirlo por correo.
                  </p>
                </>
              )}
              <button className="button primary" type="submit" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <KeyRound size={17} />
                )}
                {busy
                  ? "Procesando…"
                  : account
                    ? "Cambiar contraseña"
                    : "Ingresar a mi cuenta"}
              </button>
            </fieldset>
          </form>
        )}
        <div className="account-actions">
          {!account?.must_change_password && (
            <a
              className="text-link"
              href={account?.role === "admin" ? "/admin" : "/"}
            >
              <ArrowLeft size={16} /> Volver al inicio
            </a>
          )}
          {account && (
            <button
              className="button text-button"
              type="button"
              onClick={() => void signOut()}
              disabled={busy}
            >
              <LogOut size={17} /> Cerrar sesión
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
