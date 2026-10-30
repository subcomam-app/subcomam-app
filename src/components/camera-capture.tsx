"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, LoaderCircle } from "lucide-react";
import { Modal } from "./modal";
import {
  cameraErrorMessage,
  captureCameraPhoto,
  openRearCamera,
  stopCamera,
} from "@/lib/rear-camera";
import type { PhotoKind } from "@/lib/photo-policy";

export function CameraCapture({
  kind,
  onCapture,
  onClose,
}: {
  kind: PhotoKind;
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const active = useRef(false);
  const capturing = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closeWhenHidden = useEffectEvent(onClose);

  useEffect(() => {
    let cancelled = false;
    active.current = true;
    const element = video.current!;
    async function start() {
      try {
        const opened = await openRearCamera(navigator.mediaDevices);
        if (cancelled) {
          stopCamera(opened);
          return;
        }
        stream.current = opened;
        opened.getVideoTracks()[0].addEventListener("ended", () => {
          if (!cancelled) {
            setReady(false);
            setError(
              "La cámara se desconectó. Cierra esta ventana y vuelve a abrirla.",
            );
          }
        });
        element.srcObject = opened;
        await element.play();
      } catch (err) {
        if (!cancelled) {
          stopCamera(stream.current);
          stream.current = null;
          setReady(false);
          setError(cameraErrorMessage(err));
        }
      }
    }
    void start();
    const hide = () => {
      if (document.hidden) closeWhenHidden();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelled = true;
      active.current = false;
      document.removeEventListener("visibilitychange", hide);
      stopCamera(stream.current);
      stream.current = null;
      element.srcObject = null;
    };
  }, []);

  async function capture() {
    if (!video.current || !ready || capturing.current) return;
    capturing.current = true;
    setBusy(true);
    try {
      const file = await captureCameraPhoto(video.current);
      if (active.current) onCapture(file);
    } catch (err) {
      if (active.current) setError(cameraErrorMessage(err));
    } finally {
      capturing.current = false;
      if (active.current) setBusy(false);
    }
  }

  // Keep the camera controls outside the form's temporarily disabled fieldset.
  return createPortal(
    <Modal
      title={
        kind === "document" ? "Fotografiar documento" : "Fotografiar persona"
      }
      onClose={onClose}
    >
      <div className="camera-view">
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label="Vista de la cámara trasera"
          onPlaying={() => setReady(true)}
        />
        {!ready && !error && (
          <p className="camera-loading" role="status">
            <LoaderCircle className="spin" size={22} /> Abriendo cámara trasera…
          </p>
        )}
      </div>
      {error ? (
        <div className="alert error" role="alert">
          {error}
        </div>
      ) : (
        <p className="field-hint camera-hint">
          {kind === "document"
            ? "Encuadra el documento completo y evita los reflejos."
            : "Encuadra el rostro de la persona con buena iluminación."}
        </p>
      )}
      <div className="camera-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="button primary"
          onClick={capture}
          disabled={!ready || busy}
        >
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Camera size={18} />
          )}
          Tomar foto
        </button>
      </div>
    </Modal>,
    document.body,
  );
}
