"use client";

import { useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { chileDate, displayDocument, type Control } from "@/lib/domain";
import { Modal } from "./modal";

export function DeleteControlButton({
  control,
  onDeleted,
}: {
  control: Control;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const person = control.acta_person || control.persons;
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/controls/${control.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo eliminar el control.");
      setOpen(false);
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="icon-button danger-icon"
        title="Eliminar control"
        aria-label={`Eliminar control de ${person?.first_names || "persona"} del ${chileDate(control.controlled_at, true)}`}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Trash2 size={18} />
      </button>
      {open && (
        <Modal
          title="Eliminar control"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            <strong>
              {person?.first_names} {person?.last_names}
            </strong>
            <br />
            {person?.document_type}{" "}
            {displayDocument(
              person?.document_type || "",
              person?.document_number || "",
            )}
            <br />
            {chileDate(control.controlled_at, true)}
          </p>
          <p>
            Se eliminarán este control, su acta y sus fotografías para poder
            ingresarlo nuevamente corregido. Esta acción no se puede deshacer.
          </p>
          <p className="field-hint">
            La ficha de la persona y sus demás controles se conservan. El plazo
            de 8 horas se calcula con los controles que queden registrados.
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Trash2 size={17} />
              )}
              {busy ? "Eliminando…" : "Eliminar control"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
