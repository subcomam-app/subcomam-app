import "server-only";
import { adminDb, HttpError } from "./server";

export async function recordAccess(
  userId: string,
  role: "admin" | "officer",
  method: "password" | "recovery",
) {
  const { error } = await adminDb().from("user_access_events").insert({
    user_id: userId,
    role,
    method,
  });
  if (error) {
    console.error("Access history failed", { code: error.code });
    throw new HttpError(
      503,
      "No se pudo registrar el acceso. Intenta ingresar nuevamente.",
    );
  }
}
