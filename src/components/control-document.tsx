"use client";

import { useCallback, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import type { Control } from "@/lib/domain";

export function ControlDocument({ control }: { control: Control }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = useCallback(
    async (format: "pdf" | "docx" = "pdf") => {
      setBusy(true);
      setError("");
      try {
        const response = await fetch(
          `/api/controls/${control.id}/document?format=${format}`,
          {
            cache: "no-store",
          },
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "No se pudo descargar el acta.");
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download =
          response.headers
            .get("Content-Disposition")
            ?.match(/filename="([^"]+)"/)?.[1] ||
          `acta-art12bis-${control.id}.${format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Give mobile browsers time to consume the blob before releasing it.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (err) {
        setError(
          `El control está guardado. ${(err as Error).message} Puedes reintentar la descarga.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [control.id],
  );
  if (!control.art12bis) return null;
  return (
    <div className="acta-download">
      <button
        type="button"
        className="button secondary"
        onClick={() => void download()}
        disabled={busy}
      >
        {busy ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <Download size={17} />
        )}
        {busy ? "Generando acta…" : "Descargar acta PDF"}
      </button>
      <button
        type="button"
        className="button text-button"
        disabled={busy}
        onClick={() => void download("docx")}
      >
        Descargar Word
      </button>
      <p className="field-hint">
        PDF: acta de la Subcomisaría y fotografías. Word: reporte de consulta,
        acta y fotografías. Revisa los datos y completa las firmas.
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
