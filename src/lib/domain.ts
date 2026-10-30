import { z } from "zod";
import { countrySchema } from "./countries";

export const documentTypes = ["RUT", "DNI", "Pasaporte", "Otro"] as const;
export type DocumentType = (typeof documentTypes)[number];

export function normalizeDocument(value: string) {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[.\s-]/g, "");
}

export function formatRut(value: string) {
  const rut = normalizeDocument(value);
  // Preserve invalid/oversized input so it is rejected, never silently corrected.
  if (rut.length < 2 || rut.length > 9 || !/^\d+[\dK]$/.test(rut)) return rut;
  return `${rut.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${rut.at(-1)}`;
}

export function validRut(value: string) {
  const rut = normalizeDocument(value);
  if (!/^\d{7,8}[\dK]$/.test(rut) || /^0+$/.test(rut.slice(0, -1)))
    return false;
  let sum = 0;
  let factor = 2;
  for (let i = rut.length - 2; i >= 0; i--) {
    sum += Number(rut[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const remainder = 11 - (sum % 11);
  return (
    rut.at(-1) ===
    (remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder))
  );
}

export function displayDocument(type: string, value: string) {
  return type === "RUT" ? formatRut(value) : value;
}

export function identityDocumentDescription(identity: {
  document_type: string;
  document_number: string;
  document_label?: string;
}) {
  const name =
    identity.document_type === "Otro"
      ? identity.document_label?.trim() || "Otro documento"
      : identity.document_type;
  return `${name} N.º ${displayDocument(identity.document_type, normalizeDocument(identity.document_number))}`;
}

export function chileDate(value: string | Date, withTime = false) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Santiago",
    ...(withTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  }).format(new Date(value));
}

export const identitySchema = z
  .object({
    document_type: z.enum(documentTypes),
    document_number: z
      .string()
      .trim()
      .min(3, "Ingresa al menos 3 caracteres.")
      .max(30)
      .regex(
        /^[a-zA-Z0-9.\s-]+$/,
        "Usa solo letras, números, puntos o guiones.",
      )
      .transform(normalizeDocument),
    issuing_country: countrySchema,
    document_label: z.string().trim().max(60).default(""),
  })
  .superRefine((data, ctx) => {
    if (data.document_type === "RUT" && !validRut(data.document_number))
      ctx.addIssue({
        code: "custom",
        path: ["document_number"],
        message: "El RUT no es válido. Revisa el dígito verificador.",
      });
    if (data.document_type === "RUT" && data.issuing_country !== "Chile")
      ctx.addIssue({
        code: "custom",
        path: ["issuing_country"],
        message: "El país emisor del RUT debe ser Chile.",
      });
    if (data.document_type === "Otro" && data.document_label.length < 2)
      ctx.addIssue({
        code: "custom",
        path: ["document_label"],
        message: "Indica el nombre del documento.",
      });
  });

export const contactSchema = z.object({
  address: z.string().trim().min(1, "Ingresa el domicilio.").max(250),
  commune: z.string().trim().min(1, "Ingresa la comuna.").max(80),
  phone: z.string().trim().min(1, "Ingresa el teléfono de contacto.").max(30),
});

export const sexOptions = ["Masculino", "Femenino", "No especificado"] as const;

export function joinedSurnames(paternal: string, maternal = "") {
  return [paternal.trim(), maternal.trim()].filter(Boolean).join(" ");
}

export const personDetailsSchema = z
  .object({
    paternal_surname: z
      .string()
      .trim()
      .min(1, "Ingresa el apellido paterno.")
      .max(100),
    maternal_surname: z.string().trim().max(100).default(""),
    sex: z.enum(sexOptions, {
      error: "Selecciona el sexo registrado o «No especificado».",
    }),
  })
  .refine(
    (data) => {
      const length = joinedSurnames(
        data.paternal_surname,
        data.maternal_surname,
      ).length;
      return length >= 2 && length <= 100;
    },
    {
      message: "Los apellidos deben tener entre 2 y 100 caracteres en total.",
      path: ["paternal_surname"],
    },
  );

export const personalSchema = z
  .object({
    first_names: z.string().trim().min(2, "Ingresa los nombres.").max(100),
    ...personDetailsSchema.shape,
    nationality: countrySchema,
    birth_date: z.string().refine((v) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const d = new Date(`${v}T12:00:00Z`);
      return (
        !Number.isNaN(d.getTime()) &&
        d.toISOString().slice(0, 10) === v &&
        v >= "1900-01-01" &&
        v <=
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Santiago",
          }).format(new Date())
      );
    }, "Ingresa una fecha de nacimiento válida, no futura."),
    ...contactSchema.shape,
  })
  .refine((data) => personDetailsSchema.safeParse(data).success, {
    message: "Los apellidos deben tener entre 2 y 100 caracteres en total.",
    path: ["paternal_surname"],
  })
  .transform((data) => ({
    ...data,
    last_names: joinedSurnames(data.paternal_surname, data.maternal_surname),
  }));
export const art12bisSchema = z.object({
  number: z.string().trim().max(12).default(""),
  lesions: z.string().trim().max(120).default(""),
  presented_document: z.string().trim().max(160).default(""),
  officer_grade: z.string().trim().max(60).default(""),
  pdi_officer: z.string().trim().max(120).default(""),
  pdi_grade: z.string().trim().max(60).default(""),
});

export const controlSchema = z.object({
  // Every new control is 12 bis and must explicitly record both acta fields.
  art12bis: z.preprocess(
    (value) => value ?? {},
    art12bisSchema
      .omit({
        officer_grade: true,
        number: true,
        pdi_officer: true,
        pdi_grade: true,
      })
      .extend({
        lesions: z
          .string()
          .trim()
          .min(
            1,
            "Indica las lesiones o escribe «Sin lesiones» si corresponde.",
          )
          .max(120),
        presented_document: z
          .string()
          .trim()
          .min(1, "Indica el documento de identidad presentado.")
          .max(160),
      }),
  ),
  reason: z.enum([
    "Control de identidad",
    "Fiscalización migratoria",
    "Atención en unidad",
    "Otro",
  ]),
  location: z.string().trim().min(3, "Indica el lugar del control.").max(200),
  notes: z
    .string()
    .trim()
    .max(2000, "Las observaciones no pueden exceder 2.000 caracteres.")
    .default(""),
});
export const registrationSchema = z
  .object({
    request_id: z.uuid(),
    person_id: z.uuid().optional(),
    identity: identitySchema.optional(),
    personal: personalSchema.optional(),
    contact: contactSchema.optional(),
    person_details: personDetailsSchema.optional(),
    control: controlSchema,
  })
  .superRefine((data, ctx) => {
    if (!data.person_id && (!data.identity || !data.personal))
      ctx.addIssue({
        code: "custom",
        message: "Completa los datos de la persona.",
      });
    if (data.person_id && (data.identity || data.personal))
      ctx.addIssue({
        code: "custom",
        message: "Selecciona la persona existente sin volver a crearla.",
      });
    if (!data.person_id && data.contact)
      ctx.addIssue({
        code: "custom",
        message:
          "Los datos de contacto de una persona nueva deben estar en su ficha.",
      });
    if (!data.person_id && data.person_details)
      ctx.addIssue({
        code: "custom",
        message:
          "Los apellidos y sexo de una persona nueva deben estar en su ficha.",
      });
  });

export type Identity = z.infer<typeof identitySchema>;
export type Personal = z.infer<typeof personalSchema>;
export type PersonalForm = Omit<Personal, "sex"> & {
  sex: Personal["sex"] | "";
};
export type ControlInput = z.infer<typeof controlSchema>;
export type Person = Identity &
  Omit<Personal, "paternal_surname" | "maternal_surname" | "sex"> & {
    // Historical profiles are completed explicitly at their next control.
    paternal_surname?: string | null;
    maternal_surname?: string | null;
    sex?: Personal["sex"] | null;
    id: string;
    created_at: string;
    last_control_at: string | null;
    control_count: number;
  };
export type Control = Omit<ControlInput, "art12bis"> & {
  officer: string;
  // Older stored records may predate automatic actas.
  art12bis: z.infer<typeof art12bisSchema> | null;
  officer_code?: string | null;
  id: string;
  person_id: string;
  controlled_at: string;
  photo_path: string | null;
  photo_bytes: number | null;
  photo_width: number | null;
  photo_height: number | null;
  document_photo_path?: string | null;
  document_photo_bytes?: number | null;
  document_photo_width?: number | null;
  document_photo_height?: number | null;
  persons?: Person;
  // The database captures this identity when the control is registered.
  acta_person?:
    | (Identity &
        Pick<
          Personal,
          "first_names" | "last_names" | "nationality" | "birth_date"
        > & {
          paternal_surname?: string;
          maternal_surname?: string;
          sex?: string;
        })
    | null;
  acta_version?: number | null;
};
