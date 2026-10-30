export const PHOTO_BUCKET = "control-photos";
export const PHOTO_TARGET_BYTES = 60 * 1024;
export const PHOTO_MAX_BYTES = 100 * 1024;
export const PHOTO_UPLOAD_MAX_BYTES = 1024 * 1024;
export const PHOTO_MAX_EDGE = 640;
export const PHOTO_MIN_EDGE = 240;

export type PhotoKind = "person" | "document";
export const DOCUMENT_PHOTO_MAX_BYTES = 350 * 1024;
export const DOCUMENT_PHOTO_MAX_EDGE = 1600;

export function photoPolicy(kind: PhotoKind) {
  return kind === "document"
    ? {
        minEdge: 400,
        maxBytes: DOCUMENT_PHOTO_MAX_BYTES,
        targetBytes: 180 * 1024,
        steps: [
          [1600, 80],
          [1600, 70],
          [1400, 65],
          [1200, 60],
        ],
      }
    : {
        minEdge: PHOTO_MIN_EDGE,
        maxBytes: PHOTO_MAX_BYTES,
        targetBytes: PHOTO_TARGET_BYTES,
        steps: [
          [PHOTO_MAX_EDGE, 60],
          [PHOTO_MAX_EDGE, 50],
          [512, 50],
          [480, 40],
        ],
      };
}
