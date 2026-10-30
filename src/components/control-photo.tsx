"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { Control } from "@/lib/domain";
import { prepareControlPhoto } from "@/lib/client-photo";
import type { PhotoKind } from "@/lib/photo-policy";

function photoSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function PhotoInput({
  photo,
  onChange,
  confirmed,
  onConfirm,
  onPreparing,
  disabled,
  kind = "person",
}: {
  photo: Blob | null;
  onChange: (photo: Blob | null) => void;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onPreparing: (value: boolean) => void;
  disabled: boolean;
  kind?: PhotoKind;
}) {
  const isDocument = kind === "document";
  const headingId = useId();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [originalBytes, setOriginalBytes] = useState(0);
  const version = useRef(0);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const url = photo ? URL.createObjectURL(photo) : "";
    setPreview(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const current = ++version.current;
    setBusy(true);
    onPreparing(true);
    setError("");
    setOriginalBytes(0);
    onChange(null);
    onConfirm(false);
    try {
      const result = await prepareControlPhoto(file, kind);
      if (current === version.current) {
        setOriginalBytes(file.size);
        onChange(result);
      }
    } catch (err) {
      if (current === version.current) setError((err as Error).message);
    } finally {
      if (current === version.current) {
        setBusy(false);
        onPreparing(false);
      }
    }
  }
  return (
    <section className="photo-input" aria-labelledby={headingId}>
      <div className="photo-input-heading">
        <Camera size={20} />
        <div>
          <h3 id={headingId}>
            {isDocument
              ? "Foto del documento (opcional)"
              : "Foto actualizada de la persona"}{" "}
            {!isDocument && <span aria-label="obligatoria">*</span>}
          </h3>
          <p>
            {isDocument
              ? "Si la persona porta un documento, puedes fotografiarlo. Debe verse completo, sin reflejos y con los datos legibles. Puedes finalizar el control sin esta imagen."
              : "Toma o adjunta una foto tomada durante este control, de frente y con buena iluminación."}
          </p>
        </div>
      </div>
      <div className="photo-input-content">
        <div className={`photo-preview ${preview ? "has-photo" : ""}`}>
          {busy ? (
            <>
              <LoaderCircle className="spin" size={30} />
              <span>Comprimiendo foto…</span>
            </>
          ) : preview ? (
            <img
              src={preview}
              alt={
                isDocument
                  ? "Vista previa del documento presentado"
                  : "Vista previa de la persona para este control"
              }
            />
          ) : (
            <>
              <Camera size={36} />
              <span>
                {isDocument
                  ? "Imagen del documento opcional"
                  : "Se requiere una foto en cada control"}
              </span>
            </>
          )}
        </div>
        <div className="photo-input-actions">
          <input
            className="sr-only"
            ref={camera}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            aria-label={
              isDocument
                ? "Tomar fotografía del documento"
                : "Tomar fotografía de la persona"
            }
            disabled={disabled || busy}
            onChange={choose}
          />
          <input
            className="sr-only"
            ref={picker}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={
              isDocument
                ? "Adjuntar fotografía del documento"
                : "Adjuntar fotografía de la persona"
            }
            disabled={disabled || busy}
            onChange={choose}
          />
          <button
            type="button"
            className="button primary"
            disabled={disabled || busy}
            onClick={() => camera.current?.click()}
          >
            <Camera size={17} />{" "}
            {isDocument ? "Fotografiar documento" : "Tomar foto"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={disabled || busy}
            onClick={() => picker.current?.click()}
          >
            <ImagePlus size={17} />{" "}
            {isDocument
              ? photo
                ? "Cambiar documento"
                : "Adjuntar documento"
              : photo
                ? "Cambiar foto"
                : "Adjuntar foto"}
          </button>
          {photo && (
            <button
              type="button"
              className="button text-button"
              disabled={disabled || busy}
              onClick={() => {
                onChange(null);
                onConfirm(false);
                setError("");
                setOriginalBytes(0);
              }}
            >
              <Trash2 size={15} /> Quitar foto
            </button>
          )}
          <p className="field-hint" role="status" aria-live="polite">
            {busy
              ? "Comprimiendo automáticamente…"
              : photo
                ? `Foto comprimida · ${originalBytes > photo.size ? `${photoSize(originalBytes)} → ` : ""}${photoSize(photo.size)}`
                : "Al tomar o adjuntar una foto, se comprime automáticamente."}
          </p>
          {photo && (
            <p className="field-hint">Se guardará al finalizar el control.</p>
          )}
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {photo && (
        <label className="photo-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            required
            disabled={disabled || busy}
            onChange={(e) => onConfirm(e.target.checked)}
          />
          <span>
            {isDocument
              ? "Confirmo que el documento corresponde al presentado en este control y que sus datos se leen claramente."
              : "Confirmo que la foto corresponde a esta persona y fue tomada durante este control."}
          </span>
        </label>
      )}
    </section>
  );
}

export function ControlPhoto({ control }: { control: Control }) {
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  if (!control.photo_path)
    return (
      <p className="legacy-photo-note">
        Este control anterior no tiene fotografía registrada.
      </p>
    );
  return (
    <figure className="control-photo">
      {failed ? (
        <div className="alert error">
          <span>No se pudo cargar la fotografía.</span>
          <button
            className="button secondary"
            onClick={() => {
              setFailed(false);
              setVersion((v) => v + 1);
            }}
          >
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      ) : (
        <img
          key={version}
          src={`/api/controls/${control.id}/photo`}
          alt="Fotografía de la persona registrada en este control"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption>
        Foto registrada con este control
        {control.photo_bytes
          ? ` · ${Math.max(1, Math.round(control.photo_bytes / 1024))} KB`
          : ""}
      </figcaption>
    </figure>
  );
}
