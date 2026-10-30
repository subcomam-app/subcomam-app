"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { chileDate } from "@/lib/domain";
import type { ManagedUser } from "@/lib/admin-domain";
import { api } from "./registration-form";
import { Modal } from "./modal";

type AccessHistory = {
  accesses: {
    id: string;
    accessed_at: string;
    method: "password" | "recovery";
    role: "admin" | "officer";
  }[];
  count: number;
  last_sign_in_at: string | null;
};

export function UserAccessHistory({
  user,
  onClose,
}: {
  user: ManagedUser;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AccessHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api<AccessHistory>(
      `/api/admin/users/${user.id}/accesses?page=${page}`,
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user.id, page]);
  return (
    <Modal title="Historial de accesos" onClose={onClose}>
      <p>
        <strong>{user.name}</strong>
      </p>
      <p className="field-hint">{user.officer_code || user.email}</p>
      <p className="modal-description">
        Ingresos correctos a la plataforma, con fecha y hora de Chile. El
        historial comienza desde la activación de esta función.
      </p>
      {loading ? (
        <p role="status">
          <LoaderCircle size={17} className="spin" /> Cargando accesos…
        </p>
      ) : error ? (
        <p className="alert error" role="alert">
          {error}
        </p>
      ) : (
        data && (
          <>
            {data.accesses.length ? (
              <ol className="access-history-list">
                {data.accesses.map((access) => (
                  <li key={access.id}>
                    <LogIn size={18} aria-hidden="true" />
                    <div>
                      <strong>{chileDate(access.accessed_at, true)}</strong>
                      <p>
                        {access.role === "admin"
                          ? "Administrador"
                          : "Funcionario"}{" "}
                        ·{" "}
                        {access.method === "recovery"
                          ? "Enlace de recuperación"
                          : "Contraseña"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No hay accesos en el historial todavía.</p>
            )}
            {data.last_sign_in_at && (
              <p className="field-hint">
                Último ingreso conocido: {chileDate(data.last_sign_in_at, true)}
                .
              </p>
            )}
            {data.count > 20 && (
              <div className="pagination">
                <span>
                  Página {page} de {Math.ceil(data.count / 20)}
                </span>
                <div>
                  <button
                    className="button secondary"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    className="button secondary"
                    disabled={page * 20 >= data.count}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )
      )}
    </Modal>
  );
}
