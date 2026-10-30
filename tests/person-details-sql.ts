// Local PostgreSQL verification. No production database or real records are used.
// npm install --prefix .vercel/sql-qa --no-audit --no-fund @electric-sql/pglite
// node --import tsx tests/person-details-sql.ts
import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import PizZip from "pizzip";
import { generateControlDocument } from "../src/lib/control-document";
import { consultationReportFields } from "../src/lib/consultation-report";
import { actaImage } from "../src/lib/control-image-assets";
import { photoFixture } from "./photo-fixture";
import type { Control } from "../src/lib/domain";

const { PGlite } = await import(
  pathToFileURL(
    resolve(".vercel/sql-qa/node_modules/@electric-sql/pglite/dist/index.js"),
  ).href
);
const db = new PGlite();
const actor = randomUUID();
const migration = "202610300001_person_report_details.sql";
async function rpc(payload: object): Promise<Control> {
  const result = await db.query(
    "select public.register_control($1::jsonb, $2::uuid) as control",
    [JSON.stringify(payload), actor],
  );
  return result.rows[0].control;
}
async function photo() {
  const request_id = randomUUID();
  const path = `${request_id}/${randomUUID()}.webp`;
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values ('control-photos',$1,$2::jsonb)",
    [path, JSON.stringify({ mimetype: "image/webp", size: 1000 })],
  );
  return { request_id, photo: { path, bytes: 1000, width: 320, height: 320 } };
}
const personal = {
  first_names: "Persona de prueba",
  last_names: "De la Cruz Pérez",
  nationality: "Perú",
  birth_date: "1990-01-01",
  address: "Calle de prueba 123",
  commune: "Santiago",
  phone: "00000000",
};
const identity = {
  document_type: "DNI",
  document_number: "QASQL12345",
  issuing_country: "Perú",
};
const control = {
  reason: "Fiscalización migratoria",
  location: "Unidad de prueba",
  officer: "Prueba",
  notes: "Documento de prueba generado con datos sintéticos.",
  art12bis: { lesions: "Sin lesiones", presented_document: "No debe usarse" },
};
const details = {
  paternal_surname: "De la Cruz",
  maternal_surname: "Pérez",
  sex: "Femenino",
};
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}', banned_until timestamptz);
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    insert into storage.buckets(id,file_size_limit) values ('control-photos',102400);
  `);
  for (const file of (await readdir("supabase/migrations"))
    .filter((name) => name.endsWith(".sql") && name < migration)
    .sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  await db.query(
    "insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values($1,'qa@example.com',$2::jsonb,$3::jsonb)",
    [
      actor,
      JSON.stringify({
        role: "officer",
        officer_code: "999999-Q",
        officer_grade: "Grado de prueba",
      }),
      JSON.stringify({ full_name: "Funcionario de prueba" }),
    ],
  );
  const historical = await rpc({
    ...(await photo()),
    personal,
    identity,
    control,
  });
  await db.query(
    "update public.controls set controlled_at=now()-interval '9 hours' where id=$1",
    [historical.id],
  );
  await db.exec(await readFile(`supabase/migrations/${migration}`, "utf8"));
  const profile = async () =>
    (
      await db.query("select * from public.person_summary where id=$1", [
        historical.person_id,
      ])
    ).rows[0];
  assert.equal((await profile()).paternal_surname, null);
  assert.equal((await profile()).last_names, personal.last_names);
  await assert.rejects(
    rpc({
      ...(await photo()),
      person_id: historical.person_id,
      contact: { ...personal, address: "No guardar" },
      control,
    }),
    { code: "PT424" },
  );
  assert.equal((await profile()).address, personal.address);
  const request = {
    ...(await photo()),
    person_id: historical.person_id,
    person_details: details,
    control,
  };
  const saved = await rpc(request);
  for (const field of [
    "paternal_surname",
    "maternal_surname",
    "sex",
  ] as const) {
    assert.equal((await profile())[field], details[field]);
    assert.equal(saved.acta_person![field], details[field]);
  }
  assert.equal(saved.acta_person!.last_names, "De la Cruz Pérez");
  assert.equal(saved.art12bis!.presented_document, "DNI N.º QASQL12345");
  assert.equal(
    (
      await db.query("select acta_person from public.controls where id=$1", [
        historical.id,
      ])
    ).rows[0].acta_person.sex,
    undefined,
  );
  const repeated = await rpc({
    ...request,
    person_details: { ...details, sex: "Masculino" },
  });
  assert.equal(repeated.id, saved.id);
  assert.equal(repeated.acta_person!.sex, "Femenino");
  assert.equal((await profile()).sex, "Femenino");
  await assert.rejects(
    rpc({
      ...(await photo()),
      person_id: saved.person_id,
      person_details: { ...details, sex: "Masculino" },
      control,
    }),
    { code: "PT409" },
  );
  assert.equal((await profile()).sex, "Femenino");
  const newPerson = await rpc({
    ...(await photo()),
    identity: { ...identity, document_number: "QASQL67890" },
    personal: {
      ...personal,
      ...details,
      maternal_surname: "",
      last_names: "No confiar en este valor",
    },
    control,
  });
  assert.equal(newPerson.acta_person!.last_names, "De la Cruz");
  assert.equal(newPerson.acta_person!.maternal_surname, "");
  await assert.rejects(
    rpc({
      ...(await photo()),
      identity: { ...identity, document_number: "QASQLINVALIDO" },
      personal: { ...personal, ...details, sex: "" },
      control,
    }),
    { code: "23514" },
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from public.persons where document_number='QASQLINVALIDO'",
      )
    ).rows[0].count,
    0,
  );
  await assert.rejects(
    db.query(
      "update public.persons set last_names='Otro apellido' where id=$1",
      [saved.person_id],
    ),
    { code: "23514" },
  );
  await assert.rejects(
    db.query("update public.persons set sex=null where id=$1", [
      saved.person_id,
    ]),
    { code: "23514" },
  );
  await db.query("update public.persons set sex='Masculino' where id=$1", [
    saved.person_id,
  ]);
  const stored = (
    await db.query("select * from public.controls where id=$1", [saved.id])
  ).rows[0] as Control;
  assert.equal(consultationReportFields(stored).SEX, "Femenino");
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.register_control(jsonb,uuid)','EXECUTE') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  const document = await generateControlDocument(stored, {
    person: await actaImage(await photoFixture()),
  });
  const text = new PizZip(document)
    .file("word/document.xml")!
    .asText()
    .replace(/<[^>]*>/g, "");
  for (const expected of [
    "APELLIDO PATERNO: De la Cruz",
    "APELLIDO MATERNO: Pérez",
    "SEXO: Femenino",
    "DNI",
    "QASQL12345",
  ])
    assert.ok(text.includes(expected), expected);
  await mkdir("test-results/person-details", { recursive: true });
  await writeFile(
    "test-results/person-details/datos-del-sistema.docx",
    document,
  );
  console.log(
    "PASS: 18 migraciones; ficha antigua, alta nueva, captura inmutable, apellidos compuestos, apellido único, validación SQL, rollback, 8 horas, reintento y Word desde datos guardados.",
  );
} finally {
  await db.close();
}
