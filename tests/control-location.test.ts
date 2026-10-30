import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { locateControlAddress } from "../src/lib/client-location";
import {
  addressFromPhoton,
  coordinatesSchema,
} from "../src/lib/control-location";

const coords = { latitude: -33.4372, longitude: -70.6506, accuracy: 12.4 };
function browser(
  t: TestContext,
  getPosition: Geolocation["getCurrentPosition"],
) {
  const previousNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const previousFetch = globalThis.fetch;
  const calls: { url: string; body: unknown }[] = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { geolocation: { getCurrentPosition: getPosition } },
  });
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    return Response.json({ address: "Plaza de Armas 947, Santiago" });
  };
  t.after(() => {
    if (previousNavigator)
      Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    globalThis.fetch = previousFetch;
  });
  return calls;
}

test("GPS reciente completa la dirección y solo envía coordenadas", async (t) => {
  const calls = browser(t, (success, _error, options) => {
    assert.equal(options?.enableHighAccuracy, true);
    assert.equal(options?.maximumAge, 0);
    assert.equal(options?.timeout, 15000);
    success({ coords } as GeolocationPosition);
  });
  const result = await locateControlAddress(new AbortController().signal);
  assert.deepEqual(result, {
    address: "Plaza de Armas 947, Santiago",
    accuracy: 13,
  });
  assert.deepEqual(calls, [
    {
      url: "/api/location/reverse",
      body: { latitude: coords.latitude, longitude: coords.longitude },
    },
  ]);
});

test("Denegar ubicación o tener poca precisión no consulta al proveedor", async (t) => {
  const calls = browser(t, (_success, error) =>
    error?.({ code: 1 } as GeolocationPositionError),
  );
  await assert.rejects(
    locateControlAddress(new AbortController().signal),
    /Permite la ubicación/,
  );
  navigator.geolocation.getCurrentPosition = (success) =>
    success({ coords: { ...coords, accuracy: 800 } } as GeolocationPosition);
  await assert.rejects(
    locateControlAddress(new AbortController().signal),
    /poco precisa/,
  );
  assert.equal(calls.length, 0);
});

test("Cancelar al editar manualmente ignora un GPS tardío", async (t) => {
  let callback: PositionCallback | undefined;
  const calls = browser(t, (success) => {
    callback = success;
  });
  const controller = new AbortController();
  const pending = locateControlAddress(controller.signal);
  controller.abort();
  callback?.({ coords } as GeolocationPosition);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls.length, 0);
});

test("La dirección conserva calle y número, sin inventar una dirección desde una ciudad", () => {
  assert.equal(
    addressFromPhoton({
      features: [{ properties: { name: "Santiago", city: "Santiago" } }],
    }),
    null,
  );
  assert.equal(
    addressFromPhoton({
      features: [
        {
          properties: {
            street: "Plaza de Armas",
            housenumber: "947",
            district: "Santiago",
            city: "Santiago",
            state: "Región Metropolitana",
          },
        },
      ],
    }),
    "Plaza de Armas 947, Santiago, Región Metropolitana",
  );
  assert.equal(
    addressFromPhoton({
      features: [
        {
          properties: {
            name: "Camino Rural",
            osm_key: "highway",
            city: "Temuco",
          },
        },
      ],
    }),
    "Camino Rural, Temuco",
  );
  assert.equal(addressFromPhoton({ error: "No data" }), null);
});

test("La API de dirección solo admite coordenadas válidas", () => {
  for (const value of [
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 },
    { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: 0, document: "no enviar" },
  ]) {
    assert.equal(coordinatesSchema.safeParse(value).success, false);
  }
});
