type LocatedAddress = { address: string; accuracy: number };

function currentPosition(signal: AbortSignal): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException("Aborted", "AbortError"));
    if (!globalThis.navigator?.geolocation) {
      reject(
        new Error(
          "Este dispositivo no ofrece ubicación. Escribe la dirección.",
        ),
      );
      return;
    }
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        signal.removeEventListener("abort", abort);
        if (!signal.aborted) resolve(position);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) return;
        reject(
          new Error(
            error.code === 1
              ? "Permite la ubicación en tu navegador o escribe la dirección."
              : error.code === 3
                ? "La ubicación tardó demasiado. Reintenta o escribe la dirección."
                : "No se pudo obtener la ubicación. Activa el GPS o escribe la dirección.",
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export async function locateControlAddress(
  signal: AbortSignal,
): Promise<LocatedAddress> {
  const position = await currentPosition(signal);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const { latitude, longitude, accuracy } = position.coords;
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 200) {
    throw new Error(
      "La ubicación es poco precisa. Activa el GPS y reintenta, o escribe la dirección.",
    );
  }
  let response: Response;
  try {
    response = await fetch("/api/location/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude }),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "No hay conexión para consultar la dirección. Reintenta o escríbela manualmente.",
    );
  }
  const result = await response.json();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (
    !response.ok ||
    typeof result.address !== "string" ||
    !result.address.trim()
  ) {
    throw new Error(
      result.error ||
        "No se encontró la dirección. Puedes escribirla manualmente.",
    );
  }
  return {
    address: result.address,
    accuracy: Math.max(1, Math.ceil(accuracy)),
  };
}
