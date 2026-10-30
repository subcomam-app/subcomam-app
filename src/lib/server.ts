import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { chileDate } from "./domain";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new HttpError(503, "Falta configurar la conexión a Supabase.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function sessionClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            }),
          );
        },
      },
    },
  );
}

export async function requireStaff(
  options: { allowInitialPassword?: boolean } = {},
) {
  // Every operation needs an identified owner. Legacy public-access flags no
  // longer grant permissions, including in development.
  const { user } = await requireAccount(options);
  return {
    id: user.id,
    name: user.user_metadata.full_name || user.email || "Funcionario",
    officer_code: (user.app_metadata.officer_code as string) || null,
    officer_grade: (user.app_metadata.officer_grade as string) || "",
    must_change_password: !!user.app_metadata.must_change_password,
    local: false,
    temporary: false,
    role: user.app_metadata.role as "admin" | "officer",
  };
}

// Account credentials always require the real owner, including during open development access.
async function findAccount(options: { allowInitialPassword?: boolean } = {}) {
  const db = await sessionClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error?.name === "AuthSessionMissingError") return null;
  if (error || !user)
    throw new HttpError(401, "Inicia sesión para acceder a los registros.");
  if (!["officer", "admin"].includes(user.app_metadata.role))
    throw new HttpError(403, "Tu cuenta no tiene acceso a esta plataforma.");
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now())
    throw new HttpError(403, "Tu cuenta está suspendida.");
  if (user.app_metadata.must_setup_password)
    throw new HttpError(
      403,
      "Activa tu cuenta mediante el enlace proporcionado por el administrador.",
    );
  if (user.app_metadata.must_change_password && !options.allowInitialPassword)
    throw new HttpError(
      403,
      "Debes cambiar tu contraseña inicial en Mi cuenta antes de continuar.",
    );
  return { client: db, user };
}

export async function requireAccount(
  options: { allowInitialPassword?: boolean } = {},
) {
  const account = await findAccount(options);
  if (!account)
    throw new HttpError(401, "Inicia sesión para acceder a tu cuenta.");
  return account;
}

export async function requireAdmin() {
  const staff = await requireStaff();
  if (staff.role !== "admin")
    throw new HttpError(403, "Esta función está reservada al administrador.");
  return staff;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return json(
      {
        error: error.issues[0]?.message || "Revisa los datos ingresados.",
        fields: error.flatten().fieldErrors,
      },
      400,
    );
  if (error instanceof HttpError)
    return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError)
    return json({ error: "El formato de la solicitud no es válido." }, 400);
  const code = (error as { code?: string })?.code;
  if (code === "PT409") {
    let details: {
      last_control_at?: string;
      available_at?: string;
      server_now?: string;
    } = {};
    try {
      details = JSON.parse((error as { details: string }).details);
    } catch {
      /* generic message below */
    }
    const available =
      details.available_at && Number.isFinite(Date.parse(details.available_at))
        ? details.available_at
        : null;
    return json(
      {
        error: available
          ? `Esta persona ya fue controlada. Puedes registrar otro control desde el ${chileDate(available, true)} (8 horas después).`
          : "Deben transcurrir 8 horas desde el último control de esta persona.",
        code: "CONTROL_INTERVAL",
        available_at: available,
      },
      409,
    );
  }
  if (code === "PT410")
    return json(
      {
        error:
          "El administrador eliminó este control. Inicia un nuevo registro para ingresar los datos corregidos.",
      },
      410,
    );
  if (code === "PT404") return json({ error: "El control no existe." }, 404);
  if (code === "PT403")
    return json(
      { error: "Solo el administrador puede eliminar controles." },
      403,
    );
  if (code === "PT423")
    return json(
      {
        error: "Completa las lesiones y el documento de identidad presentado.",
      },
      400,
    );
  if (code === "PT424")
    return json({ error: "Completa el apellido paterno y el sexo de la persona antes de registrar el control." }, 400);
  if (code === "PT422")
    return json(
      {
        error:
          "La imagen del documento adjunta no es válida. Vuelve a seleccionarla o quítala para continuar.",
      },
      400,
    );
  if (code === "PT400")
    return json(
      {
        error:
          "Completa el domicilio, la comuna y el teléfono antes de registrar el control.",
      },
      400,
    );
  if (code === "23505")
    return json(
      {
        error:
          "Esta persona ya está registrada. Busca y selecciona su documento para continuar.",
      },
      409,
    );
  if (code === "P0002" || code === "23503")
    return json(
      {
        error:
          "La persona seleccionada no existe. Vuelve a buscar su documento.",
      },
      404,
    );
  console.error("Supabase request failed", { code: code || "unknown" });
  return json(
    {
      error:
        "No fue posible acceder a la base de datos. Intenta nuevamente; tus datos permanecen en el formulario.",
    },
    503,
  );
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next.js may reconstruct request.url with "localhost" during development.
  // The incoming Host header identifies the actual browser-facing origin.
  if (origin) {
    let incomingOrigin: URL;
    try {
      incomingOrigin = new URL(origin);
    } catch {
      throw new HttpError(403, "Origen de solicitud no autorizado.");
    }
    if (
      !["http:", "https:"].includes(incomingOrigin.protocol) ||
      incomingOrigin.host !==
        (request.headers.get("host") || new URL(request.url).host)
    )
      throw new HttpError(403, "Origen de solicitud no autorizado.");
  }
}

export async function readBody(request: Request) {
  checkOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Se requiere contenido JSON.");
  const body = await request.text();
  if (body.length > 16000)
    throw new HttpError(413, "La solicitud es demasiado grande.");
  return JSON.parse(body);
}
