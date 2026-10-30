import assert from "node:assert/strict";
import { test } from "node:test";
import { formatOfficerCode, officerCodeSchema } from "../src/lib/staff-code";
import { userActionSchema } from "../src/lib/admin-domain";

test("El código conserva seis dígitos, guion y letra; normaliza minúsculas", () => {
  assert.equal(officerCodeSchema.parse(" 001111-m "), "001111-M");
  assert.equal(officerCodeSchema.parse("003466u"), "003466-U");
  assert.equal(officerCodeSchema.parse(" 003466 - u "), "003466-U");
  assert.equal(officerCodeSchema.parse("111111M"), "111111-M");
  assert.equal(formatOfficerCode("00346"), "00346");
  assert.equal(formatOfficerCode("admin@example.com"), "admin@example.com");
  assert.equal(formatOfficerCode("1111111-M"), "1111111-M");
  for (const value of [
    "11111-M",
    "1111111-M",
    "111111-1",
    "111111-MM",
    "111 11-M",
  ]) {
    assert.equal(officerCodeSchema.safeParse(value).success, false, value);
  }
});

test("Funcionario requiere código y clave inicial; administrador mantiene correo separado", () => {
  const data = {
    action: "create",
    name: "Prueba",
    role: "officer",
    password: "ClaveTemporal123!",
  };
  assert.equal(
    userActionSchema.safeParse({ ...data, email: "qa@example.com" }).success,
    false,
  );
  assert.equal(
    userActionSchema.safeParse({ ...data, officer_code: "111111-M" }).success,
    true,
  );
  assert.equal(
    userActionSchema.safeParse({
      ...data,
      officer_code: "111111-M",
      password: undefined,
    }).success,
    false,
  );
  assert.equal(
    userActionSchema.safeParse({
      ...data,
      role: "admin",
      email: "qa@example.com",
    }).success,
    true,
  );
});
