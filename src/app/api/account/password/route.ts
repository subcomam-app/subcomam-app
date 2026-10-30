import { createClient } from "@supabase/supabase-js";
import { passwordChangeSchema } from "@/lib/admin-domain";
import {
  apiError,
  HttpError,
  json,
  readBody,
  requireAccount,
  adminDb,
} from "@/lib/server";

export async function POST(request: Request) {
  try {
    const { client, user } = await requireAccount({
      allowInitialPassword: true,
    });
    const input = passwordChangeSchema.parse(await readBody(request));
    // A fresh password sign-in verifies ownership and satisfies secure password
    // change even when the original session is over 24 hours old. No email OTP.
    const verified = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    const signed = await verified.auth.signInWithPassword({
      email: user.email!,
      password: input.current_password,
    });
    if (signed.error?.status === 429)
      throw new HttpError(
        429,
        "Demasiados intentos. Espera unos minutos antes de reintentar.",
      );
    if (signed.error || !signed.data.session)
      throw new HttpError(
        400,
        "La contraseña actual no es correcta o la cuenta ya no está activa.",
      );
    let changed = false;
    try {
      if (
        signed.data.user.id !== user.id ||
        !["admin", "officer"].includes(signed.data.user.app_metadata.role) ||
        signed.data.user.app_metadata.must_setup_password
      )
        throw new HttpError(
          403,
          "Esta cuenta no tiene acceso activo a la plataforma.",
        );
      const result = await verified.auth.updateUser({
        password: input.password,
        current_password: input.current_password,
      });
      if (result.error) {
        if (result.error.code === "same_password")
          throw new HttpError(
            400,
            "La nueva contraseña debe ser distinta de la actual.",
          );
        if (result.error.code === "weak_password")
          throw new HttpError(
            400,
            "Elige una contraseña más segura de al menos 6 caracteres.",
          );
        throw new HttpError(
          400,
          "No se pudo cambiar la contraseña. Vuelve a intentarlo.",
        );
      }
      changed = true;
      if (user.app_metadata.must_change_password) {
        const activated = await adminDb().auth.admin.updateUserById(user.id, {
          app_metadata: { must_change_password: false },
        });
        if (activated.error)
          throw new HttpError(
            503,
            "La contraseña cambió. Vuelve a ingresar con la nueva para completar la activación.",
          );
      }
      // Supabase invalidates the previous sessions after a password change.
      // Move the freshly verified session into the HttpOnly browser cookies.
      const fresh = await verified.auth.refreshSession({
        refresh_token: signed.data.session.refresh_token,
      });
      const refreshed = fresh.data.session
        ? await client.auth.setSession({
            access_token: fresh.data.session.access_token,
            refresh_token: fresh.data.session.refresh_token,
          })
        : { error: fresh.error || new Error("Session missing") };
      return json({ ok: true, sign_in_required: !!refreshed.error });
    } finally {
      if (!changed) await verified.auth.signOut({ scope: "local" });
    }
  } catch (error) {
    return apiError(error);
  }
}
