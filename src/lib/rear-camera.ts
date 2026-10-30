type CameraDevices = Pick<
  MediaDevices,
  "getUserMedia" | "getSupportedConstraints"
>;

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function openRearCamera(
  devices?: CameraDevices,
): Promise<MediaStream> {
  if (!devices?.getUserMedia || !devices.getSupportedConstraints().facingMode)
    throw new Error(
      "Este navegador no permite seleccionar la cámara trasera. Abre el sitio en Chrome o Safari, o adjunta una foto.",
    );

  // A native file input only hints which camera to use. This requirement must
  // never be relaxed to `ideal`, `video: true` or a native selfie-camera fallback.
  const stream = await devices.getUserMedia({
    audio: false,
    video: {
      facingMode: { exact: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
  const track = stream.getVideoTracks()[0];
  const facing = track?.getSettings().facingMode;
  if (!track || (facing && facing !== "environment")) {
    stopCamera(stream);
    throw new Error(
      "No se pudo activar la cámara trasera. Puedes adjuntar una foto.",
    );
  }
  return stream;
}

export function cameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Permite el acceso a la cámara en tu navegador y vuelve a intentarlo.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No se encontró una cámara trasera disponible. Puedes adjuntar una foto.";
  if (name === "NotReadableError" || name === "AbortError")
    return "La cámara está ocupada. Cierra las otras aplicaciones que la usan e inténtalo nuevamente.";
  return error instanceof Error && name === "Error"
    ? error.message
    : "No se pudo abrir la cámara trasera. Inténtalo nuevamente o adjunta una foto.";
}

export async function captureCameraPhoto(
  video: HTMLVideoElement,
): Promise<File> {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight)
    throw new Error("Espera a que se vea la imagen antes de tomar la foto.");
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    1920 / Math.max(video.videoWidth, video.videoHeight),
  );
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  try {
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("No se pudo capturar la foto. Inténtalo nuevamente.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob?.size)
      throw new Error("No se pudo capturar la foto. Inténtalo nuevamente.");
    // The shared photo pipeline compresses this frame before any upload.
    return new File([blob], "captura.png", { type: "image/png" });
  } finally {
    canvas.width = canvas.height = 0;
  }
}
