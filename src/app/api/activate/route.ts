import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { passwordSchema } from "@/lib/admin-domain";
import { recordAccess } from "@/lib/access-history";
import {
  adminDb,
  apiError,
  HttpError,
  json,
  readBody,
  sessionClient,
} from "@/lib/server";

export async function POST(request: Request) {
  try {
    const input = z
      .object({ token: z.string().min(20).max(256), password: passwordSchema })
      .parse(await readBody(request));
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await client.auth.verifyOtp({
      token_hash: input.token,
      type: "recovery",
    });
    if (error || !data.user || !data.session)
      throw new HttpError(
        400,
        "El enlace venció o ya fue utilizado. Solicita uno nuevo al administrador.",
      );
    if (
      !["admin", "officer"].includes(data.user.app_metadata.role) ||
      (data.user.banned_until &&
        new Date(data.user.banned_until).getTime() > Date.now())
    ) {
      await client.auth.signOut();
      throw new HttpError(
        403,
        "Esta cuenta no tiene acceso activo a la plataforma.",
      );
    }
    const changed = await client.auth.updateUser({ password: input.password });
    if (changed.error)
      throw new HttpError(
        400,
        "No fue posible guardar la contraseña. Genera un nuevo enlace y usa una contraseña distinta de al menos 6 caracteres.",
      );
    const updated = await adminDb().auth.admin.updateUserById(data.user.id, {
      app_metadata: { must_setup_password: false, must_change_password: false },
    });
    if (updated.error) throw updated.error;
    // Sign in again so the cookie carries the current permissions and setup state.
    const session = await sessionClient();
    const result = await session.auth.signInWithPassword({
      email: data.user.email!,
      password: input.password,
    });
    if (result.error)
      throw new HttpError(
        503,
        "Contraseña guardada. Inicia sesión desde la página principal.",
      );
    try {
      await recordAccess(data.user.id, data.user.app_metadata.role, "recovery");
    } catch {
      await session.auth.signOut({ scope: "local" });
      throw new HttpError(
        503,
        "Contraseña guardada. Inicia sesión desde la página principal.",
      );
    }
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
