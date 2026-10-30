import { z } from "zod";
import {
  apiError,
  HttpError,
  json,
  readBody,
  requireStaff,
  sessionClient,
  adminDb,
} from "@/lib/server";
import { officerCodeSchema } from "@/lib/staff-code";
import { recordAccess } from "@/lib/access-history";

export async function GET() {
  try {
    return json({ user: await requireStaff({ allowInitialPassword: true }) });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = z
      .object({
        identifier: z.string().trim().min(1).max(254).optional(),
        email: z.email().optional(),
        password: z.string().min(1).max(256),
        portal: z.enum(["officer", "admin"]).optional(),
      })
      .parse(await readBody(request));
    const identifier = input.identifier || input.email || "";
    let email = identifier.toLowerCase();
    if (!identifier.includes("@")) {
      const code = officerCodeSchema.safeParse(identifier);
      if (!code.success)
        throw new HttpError(401, "El código o la contraseña no son correctos.");
      const db = adminDb();
      const profile = await db
        .from("staff_accounts")
        .select("user_id")
        .eq("officer_code", code.data)
        .maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data)
        throw new HttpError(401, "El código o la contraseña no son correctos.");
      const found = await db.auth.admin.getUserById(profile.data.user_id);
      if (found.error || !found.data.user?.email)
        throw new HttpError(401, "El código o la contraseña no son correctos.");
      email = found.data.user.email;
    }
    const client = await sessionClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (error || !data.user)
      throw new HttpError(
        401,
        "El código, correo o contraseña no son correctos.",
      );
    if (!["officer", "admin"].includes(data.user.app_metadata.role)) {
      await client.auth.signOut({ scope: "local" });
      throw new HttpError(403, "Tu cuenta no tiene acceso a esta plataforma.");
    }
    if (input.portal && input.portal !== data.user.app_metadata.role) {
      await client.auth.signOut({ scope: "local" });
      throw new HttpError(
        403,
        input.portal === "admin"
          ? "Este acceso es exclusivo del administrador. Ingresa como funcionario en la página principal."
          : "Esta cuenta es administradora. Ingresa desde el panel administrador.",
      );
    }
    if (data.user.app_metadata.must_setup_password) {
      await client.auth.signOut({ scope: "local" });
      throw new HttpError(
        403,
        "Activa tu cuenta mediante el enlace proporcionado por el administrador.",
      );
    }
    try {
      await recordAccess(data.user.id, data.user.app_metadata.role, "password");
    } catch (error) {
      await client.auth.signOut({ scope: "local" });
      throw error;
    }
    return json({
      ok: true,
      must_change_password: !!data.user.app_metadata.must_change_password,
      role: data.user.app_metadata.role,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    await readBody(request);
    const client = await sessionClient();
    await client.auth.signOut();
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
