"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed, LoaderCircle } from "lucide-react";
import { locateControlAddress } from "@/lib/client-location";

export function ControlLocationInput({
  value,
  onChange,
  onLocating,
}: {
  value: string;
  onChange: (value: string) => void;
  onLocating: (locating: boolean) => void;
}) {
  const [automatic] = useState(() => !value);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef<AbortController | null>(null);

  const detect = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLocating(true);
    onLocating(true);
    setMessage("Detectando dirección. Permite el acceso a tu ubicación.");
    try {
      const result = await locateControlAddress(controller.signal);
      if (controller.signal.aborted) return;
      onChange(result.address);
      setMessage(
        `Dirección aproximada · precisión del GPS ±${result.accuracy} m. Revisa antes de guardar.`,
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo detectar la dirección. Escríbela manualmente.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setLocating(false);
        onLocating(false);
      }
    }
  }, [onChange, onLocating]);

  useEffect(() => {
    if (automatic) void detect();
    return () => {
      active.current?.abort();
      onLocating(false);
    };
  }, [automatic, detect, onLocating]);

  return (
    <div className="field field-wide">
      <label className="field-label" htmlFor="control-location">
        Lugar del control <span aria-hidden="true">*</span>
      </label>
      <div className="location-input-row">
        <input
          id="control-location"
          required
          minLength={3}
          maxLength={200}
          value={value}
          autoComplete="off"
          placeholder="Dirección del procedimiento"
          aria-describedby="control-location-status"
          onChange={(event) => {
            // A late GPS/provider response must never overwrite a correction.
            active.current?.abort();
            setLocating(false);
            onLocating(false);
            setMessage("Dirección ingresada manualmente.");
            onChange(event.target.value);
          }}
        />
        <button
          type="button"
          className="icon-button"
          onClick={() => void detect()}
          disabled={locating}
          aria-label="Detectar dirección actual"
          title="Detectar dirección actual"
        >
          {locating ? (
            <LoaderCircle size={20} className="spin" />
          ) : (
            <LocateFixed size={20} />
          )}
        </button>
      </div>
      <p id="control-location-status" className="field-hint" role="status">
        {message || "Puedes corregir la dirección o volver a detectarla."}
      </p>
      <small className="location-source">
        La ubicación se consulta en{" "}
        <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">
          Photon
        </a>
        . Datos ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>
        .
      </small>
    </div>
  );
}
