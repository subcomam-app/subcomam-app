"use client";

import { useEffect, useRef, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "@/components/registration-form";

export default function ActivatePage() {
  const token = useRef("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (value) {
      token.current = value;
      window.history.replaceState(null, "", "/activar");
    }
    setReady(!!token.current);
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirm")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/activate", {
        token: token.current,
        password: data.get("password"),
      });
      window.location.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="activation-shell">
      <section className="card activation-card">
        <ShieldCheck size={36} />
        <div className="eyebrow">SUBCOMAM · ACCESO INSTITUCIONAL</div>
        <h1>Define tu contraseña</h1>
        <p>Activa tu acceso o establece una nueva contraseña para tu cuenta.</p>
        {ready ? (
          <form className="login-form" onSubmit={submit}>
            <label>
              Nueva contraseña
              <input
                type="password"
                name="password"
                minLength={6}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Repetir contraseña
              <input
                type="password"
                name="confirm"
                minLength={6}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <p className="field-hint">
              Usa al menos 6 caracteres. El enlace se puede utilizar una sola
              vez.
            </p>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary" disabled={busy}>
              <LockKeyhole size={17} />
              {busy ? "Guardando…" : "Guardar contraseña e ingresar"}
            </button>
          </form>
        ) : (
          <div className="alert neutral">
            Abre el enlace completo de activación proporcionado por tu
            administrador.
          </div>
        )}
        <a className="text-link" href="/">
          Volver al inicio
        </a>
      </section>
    </main>
  );
}
