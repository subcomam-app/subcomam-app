import { z } from "zod";
import { officerCodeSchema } from "./staff-code";

export type StaffRole = "admin" | "officer";
export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  officer_code: string | null;
  officer_grade: string;
  role: StaffRole | "none";
  active: boolean;
  pending: boolean;
  must_change_password: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};
export type Statistics = {
  total_people: number;
  total_controls: number;
  period_controls: number;
  period_people: number;
  repeated_people: number;
  new_people: number;
  daily: { date: string; count: number }[];
  reasons: { label: string; count: number }[];
  officers: { label: string; count: number }[];
};
export type ControlPeriodCounts = {
  day: number;
  week: number;
  month: number;
  year: number;
  historical: number;
};
export type NationalityCounts = ControlPeriodCounts & { nationality: string };
export type ControlPeriodSummary = {
  date: string;
  week_start: string;
  month_start: string;
  year_start: string;
  totals: ControlPeriodCounts;
  nationalities: NationalityCounts[];
  users: (ControlPeriodCounts & {
    key: string;
    user_id: string | null;
    name: string;
    officer_code: string | null;
    role: StaffRole | "none";
    historical_account: boolean;
  })[];
};
export const passwordSchema = z
  .string()
  .min(6, "Usa una contraseña de al menos 6 caracteres.")
  .max(128);
export const userActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      email: z
        .email()
        .transform((v) => v.toLowerCase())
        .optional(),
      officer_code: officerCodeSchema.optional(),
      officer_grade: z.string().trim().max(60).optional(),
      name: z.string().trim().min(2).max(100),
      role: z.enum(["admin", "officer"]),
      // Preserve recovery-link provisioning for legacy administrator clients.
      password: passwordSchema.optional(),
    })
    .superRefine((input, ctx) => {
      if (input.role === "officer") {
        if (!input.officer_code)
          ctx.addIssue({
            code: "custom",
            path: ["officer_code"],
            message:
              "Ingresa el código de funcionario con el formato 111111-M.",
          });
        if (!input.password)
          ctx.addIssue({
            code: "custom",
            path: ["password"],
            message: "Define una contraseña inicial de al menos 6 caracteres.",
          });
      } else if (!input.email)
        ctx.addIssue({
          code: "custom",
          path: ["email"],
          message: "Indica el correo de la cuenta administradora.",
        });
    }),
  z.object({
    action: z.literal("update"),
    id: z.uuid(),
    name: z.string().trim().min(2).max(100),
    role: z.enum(["admin", "officer"]),
    active: z.boolean(),
    officer_code: officerCodeSchema.optional(),
    officer_grade: z.string().trim().max(60).optional(),
  }),
  z.object({ action: z.literal("access_link"), id: z.uuid() }),
  z.object({ action: z.literal("delete"), id: z.uuid() }),
]);
export const passwordChangeSchema = z
  .object({
    current_password: z
      .string()
      .min(1, "Ingresa tu contraseña actual.")
      .max(256),
    password: passwordSchema,
  })
  .strict()
  .refine((data) => data.current_password !== data.password, {
    message: "La nueva contraseña debe ser distinta de la actual.",
    path: ["password"],
  });
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Indica una fecha válida.");
export const periodSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .strict()
  .refine(
    (v) =>
      v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 365 * 86400000,
    "Selecciona un período válido de hasta 366 días.",
  );
