"use client";

import { useEffect, useState } from "react";
import { Clock3, LoaderCircle, RefreshCw } from "lucide-react";
import { chileDate } from "@/lib/domain";
import type { ControlAvailability } from "@/lib/control-interval";
import { api } from "./registration-form";

export function ControlIntervalNotice({
  personId,
  revision,
  onChange,
}: {
  personId: string;
  revision: number;
  onChange: (allowed: boolean) => void;
}) {
  const [availability, setAvailability] = useState<ControlAvailability | null>(
    null,
  );
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setChecking(true);
    setError("");
    onChange(false);
    api<{ availability: ControlAvailability }>(
      `/api/people/${personId}/availability`,
      undefined,
      controller.signal,
    )
      .then(({ availability: value }) => {
        if (controller.signal.aborted) return;
        setAvailability(value);
        onChange(value.can_control);
        if (!value.can_control && value.available_at) {
          // Use the server's clock, even when the phone's clock is inaccurate.
          timer = setTimeout(
            () => setRefresh((v) => v + 1),
            Math.max(
              500,
              Date.parse(value.available_at) -
                Date.parse(value.server_now) +
                100,
            ),
          );
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [personId, revision, refresh, onChange]);
  useEffect(() => {
    const update = () => setRefresh((v) => v + 1);
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, []);
  if (!checking && !error && availability?.can_control) return null;
  return (
    <div className={`alert ${error ? "error" : "neutral"}`} role="status">
      {checking ? (
        <LoaderCircle size={19} className="spin" />
      ) : (
        <Clock3 size={19} />
      )}
      <span>
        {checking
          ? "Comprobando último control…"
          : error || (
              <>
                <strong>Esta persona ya fue controlada.</strong>
                <small>
                  Último control:{" "}
                  {chileDate(availability!.last_control_at!, true)}.
                </small>
                <small>
                  Disponible desde el{" "}
                  {chileDate(availability!.available_at!, true)}. Deben
                  transcurrir 8 horas entre controles.
                </small>
              </>
            )}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label="Actualizar disponibilidad del control"
        title="Actualizar disponibilidad"
        disabled={checking}
        onClick={() => setRefresh((v) => v + 1)}
      >
        <RefreshCw size={18} />
      </button>
    </div>
  );
}
