import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTROL_INTERVAL_MS } from "../src/lib/control-interval";

// Existing integration stories simulate a later visit without waiting eight
// hours. Only their explicitly synthetic person can have its timestamps moved.
export async function ageSyntheticControls(
  db: SupabaseClient,
  personId: string,
) {
  const person = await db
    .from("persons")
    .select("first_names,document_number")
    .eq("id", personId)
    .single();
  assert.ifError(person.error);
  assert.match(person.data!.first_names, /^Prueba/);
  assert.match(person.data!.document_number, /^(QA|PHOTOQA)/);
  const controls = await db
    .from("controls")
    .select("id")
    .eq("person_id", personId)
    .order("controlled_at", { ascending: false });
  assert.ifError(controls.error);
  for (const [index, control] of controls.data!.entries()) {
    const controlled_at = new Date(
      Date.now() - CONTROL_INTERVAL_MS * (index + 1) - 1000,
    ).toISOString();
    assert.ifError(
      (await db.from("controls").update({ controlled_at }).eq("id", control.id))
        .error,
    );
  }
}
