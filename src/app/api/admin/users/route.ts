import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import {
  adminDb,
  apiError,
  HttpError,
  json,
  readBody,
  requireAdmin,
} from "@/lib/server";
import { userActionSchema, type ManagedUser } from "@/lib/admin-domain";
import { officerAuthEmail } from "@/lib/staff-code";

function summarize(user: User): ManagedUser {
  return {
    id: user.id,
    email: user.email || "",
    officer_code: user.app_metadata.officer_code || null,
    officer_grade: user.app_metadata.officer_grade || "",
    name: user.user_metadata.full_name || user.email || "Sin nombre",
    role: ["admin", "officer"].includes(user.app_metadata.role)
      ? user.app_metadata.role
      : "none",
    active:
      !user.banned_until || new Date(user.banned_until).getTime() <= Date.now(),
    pending: !!user.app_metadata.must_setup_password,
    must_change_password: !!user.app_metadata.must_change_password,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at || null,
  };
}
function authFailure(error: { code?: string }) {
  if (error.code === "weak_password")
    throw new HttpError(
      400,
      "Elige una contraseña más segura de al menos 6 caracteres.",
    );
  if (["email_exists", "user_already_exists"].includes(error.code || ""))
    throw new HttpError(
      409,
      "Ya existe una cuenta con ese correo. Busca al usuario en el listado.",
    );
  throw new HttpError(
    503,
    "No fue posible actualizar la cuenta. Intenta nuevamente.",
  );
}
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const rawPage = Number(new URL(request.url).searchParams.get("page") || 1);
    const page =
      Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10000) : 1;
    const { data, error } = await adminDb().auth.admin.listUsers({
      page,
      perPage: 20,
    });
    if (error) throw error;
    return json({ users: data.users.map(summarize), page, total: data.total });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const input = userActionSchema.parse(await readBody(request));
    const db = adminDb();
    if (input.action === "delete") {
      if (actor.id === input.id)
        throw new HttpError(
          400,
          "No puedes eliminar la cuenta administradora que estás usando.",
        );
      const existing = await db.auth.admin.getUserById(input.id);
      if (existing.error || !existing.data.user)
        throw new HttpError(404, "La cuenta no existe.");
      // The database protects the last administrator. Controls retain their
      // officer snapshot, original author ID and attachments after account deletion.
      const removed = await db.auth.admin.deleteUser(input.id);
      if (removed.error)
        throw new HttpError(
          409,
          "No fue posible eliminar la cuenta. Debe permanecer un administrador activo.",
        );
      return json({
        ok: true,
        message: "Usuario eliminado. Sus controles y actas se conservaron.",
      });
    }
    if (input.action !== "access_link" && input.officer_code) {
      const existing = await db
        .from("staff_accounts")
        .select("user_id")
        .eq("officer_code", input.officer_code)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (
        existing.data &&
        (input.action === "create" || existing.data.user_id !== input.id)
      )
        throw new HttpError(
          409,
          "Ya existe una cuenta con ese código de funcionario.",
        );
    }
    if (input.action === "update") {
      if (actor.id === input.id && (input.role !== "admin" || !input.active))
        throw new HttpError(
          400,
          "No puedes quitarte el perfil de administrador ni suspender tu propia cuenta.",
        );
      const { data: current, error: missing } = await db.auth.admin.getUserById(
        input.id,
      );
      if (missing || !current.user)
        throw new HttpError(404, "La cuenta no existe.");
      if (
        input.role === "officer" &&
        !input.officer_code &&
        !current.user.app_metadata.officer_code
      )
        throw new HttpError(
          400,
          "Asigna un código de funcionario con el formato 111111-M.",
        );
      const { data, error } = await db.auth.admin.updateUserById(input.id, {
        ...(input.officer_code &&
        current.user.email?.endsWith("@funcionarios.subcomam.invalid")
          ? { email: officerAuthEmail(input.officer_code), email_confirm: true }
          : {}),
        user_metadata: { ...current.user.user_metadata, full_name: input.name },
        app_metadata: {
          ...current.user.app_metadata,
          role: input.role,
          ...(input.officer_code ? { officer_code: input.officer_code } : {}),
          ...(input.officer_grade !== undefined
            ? { officer_grade: input.officer_grade }
            : {}),
        },
        ban_duration: input.active ? "none" : "876000h",
      });
      if (error) authFailure(error);
      return json({ user: summarize(data.user!) });
    }
    let user: User;
    if (input.action === "create") {
      const { data, error } = await db.auth.admin.createUser({
        email:
          input.role === "officer"
            ? officerAuthEmail(input.officer_code!)
            : input.email!,
        password: input.password ?? randomBytes(32).toString("base64url"),
        email_confirm: true,
        user_metadata: { full_name: input.name },
        app_metadata: {
          role: input.role,
          must_setup_password: !input.password,
          must_change_password: !!input.password,
          ...(input.role === "officer"
            ? {
                officer_code: input.officer_code,
                officer_grade: input.officer_grade || "",
              }
            : {}),
        },
      });
      if (error) {
        if (input.officer_code) {
          const duplicate = await db
            .from("staff_accounts")
            .select("user_id")
            .eq("officer_code", input.officer_code)
            .maybeSingle();
          if (duplicate.data)
            throw new HttpError(
              409,
              "Ya existe una cuenta con ese código de funcionario.",
            );
        }
        authFailure(error);
      }
      user = data.user!;
      if (input.password)
        return json(
          {
            user: summarize(user),
            message:
              "Cuenta creada. El titular debe cambiar la contraseña inicial en su primer ingreso.",
          },
          201,
        );
    } else {
      const { data, error } = await db.auth.admin.getUserById(input.id);
      if (error || !data.user) throw new HttpError(404, "La cuenta no existe.");
      user = data.user;
      if (!summarize(user).active)
        throw new HttpError(
          400,
          "Reactiva la cuenta antes de generar un enlace.",
        );
    }
    const { data: link, error } = await db.auth.admin.generateLink({
      type: "recovery",
      email: user.email!,
    });
    if (error)
      return json({
        user: summarize(user),
        access_link: null,
        warning:
          "La cuenta existe, pero no se pudo generar el enlace. Usa «Generar enlace» para reintentar.",
      });
    const url = new URL("/activar", request.url);
    url.hash = new URLSearchParams({
      token: link.properties.hashed_token,
    }).toString();
    return json(
      { user: summarize(user), access_link: url.toString() },
      input.action === "create" ? 201 : 200,
    );
  } catch (error) {
    return apiError(error);
  }
}
