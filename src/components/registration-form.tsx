"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  History,
  Info,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import {
  chileDate,
  contactSchema,
  controlSchema,
  displayDocument,
  documentTypes,
  identitySchema,
  identityDocumentDescription,
  normalizeDocument,
  personalSchema,
  personDetailsSchema,
  joinedSurnames,
  sexOptions,
  validRut,
  type Control,
  type ControlInput,
  type Identity,
  type Person,
  type PersonalForm,
} from "@/lib/domain";
import { ControlPhoto, PhotoInput } from "./control-photo";
import { ControlDocument } from "./control-document";
import { CountryInput } from "./country-input";
import { normalizeCountry } from "@/lib/countries";
import { photoFileName } from "@/lib/client-photo";
import { ControlLocationInput } from "./control-location-input";
import { DocumentNumberInput } from "./document-number-input";
import { ControlIntervalNotice } from "./control-interval-notice";

const emptyPersonal: PersonalForm = {
  first_names: "",
  last_names: "",
  paternal_surname: "",
  maternal_surname: "",
  sex: "",
  nationality: "",
  birth_date: "",
  address: "",
  commune: "",
  phone: "",
};

function personalForm(person?: Person): PersonalForm {
  return person
    ? {
        ...person,
        paternal_surname: person.paternal_surname || "",
        maternal_surname: person.maternal_surname || "",
        sex: person.sex || "",
      }
    : emptyPersonal;
}

export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    signal,
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "No fue posible completar la solicitud.");
  return data;
}

export function RegistrationForm({
  initialPerson,
  staff,
  onSaved,
  onHistory,
}: {
  initialPerson?: Person;
  staff: { name: string; officer_code: string | null; officer_grade: string };
  onSaved: () => void;
  onHistory: () => void;
}) {
  const [identity, setIdentity] = useState<Identity>({
    document_type: initialPerson?.document_type || "RUT",
    document_number: initialPerson?.document_number || "",
    issuing_country: initialPerson?.issuing_country || "Chile",
    document_label: initialPerson?.document_label || "",
  });
  const [person, setPerson] = useState<Person | null>(initialPerson || null);
  const [canControl, setCanControl] = useState(!initialPerson);
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const [personal, setPersonal] = useState<PersonalForm>(() =>
    personalForm(initialPerson),
  );
  const [isNew, setIsNew] = useState(false);
  const [step, setStep] = useState(initialPerson ? 2 : 1);
  const [results, setResults] = useState<Person[] | null>(null);
  const [searchedKey, setSearchedKey] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Control | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoConfirmed, setPhotoConfirmed] = useState(false);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [includeDocumentPhoto, setIncludeDocumentPhoto] = useState(false);
  const [documentPhoto, setDocumentPhoto] = useState<Blob | null>(null);
  const [documentConfirmed, setDocumentConfirmed] = useState(false);
  const [preparingDocument, setPreparingDocument] = useState(false);
  const [locating, setLocating] = useState(false);
  const [control, setControl] = useState<ControlInput>({
    art12bis: { lesions: "", presented_document: "" },
    reason: "Fiscalización migratoria",
    location: "",
    notes: "",
  });
  const requestId = useRef("");
  const changeLocation = useCallback((location: string) => {
    setControl((previous) => ({ ...previous, location }));
  }, []);
  const activeSearch = useRef<AbortController | null>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const searchKey = `${identity.document_type}|${identity.issuing_country}|${normalizeDocument(identity.document_number)}`;
  const isRut = identity.document_type === "RUT";
  const presentedDocument = identityDocumentDescription(person || identity);
  const normalizedNumber = normalizeDocument(identity.document_number);
  const rutValid = isRut && validRut(normalizedNumber);
  const rutInvalid =
    isRut &&
    !rutValid &&
    (normalizedNumber.length >= 8 || /[^\dK]|K.+/.test(normalizedNumber));

  useEffect(() => {
    if (
      person ||
      isNew ||
      normalizeDocument(identity.document_number).length < 2 ||
      !normalizeCountry(identity.issuing_country)
    )
      return;
    const controller = new AbortController();
    activeSearch.current?.abort();
    activeSearch.current = controller;
    const timeout = setTimeout(async () => {
      if (controller.signal.aborted) return;
      setSearching(true);
      try {
        const data = await api<{ people: Person[] }>(
          "/api/people/search",
          {
            type: identity.document_type,
            country: identity.issuing_country,
            query: identity.document_number,
          },
          controller.signal,
        );
        setResults(data.people);
        setSearchedKey(searchKey);
      } catch (err) {
        if (!controller.signal.aborted) {
          setResults(null);
          setSearchedKey("");
          setError((err as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    identity.document_type,
    identity.document_number,
    identity.issuing_country,
    person,
    isNew,
    searchKey,
  ]);

  useEffect(() => {
    if (step > 1) formHeading.current?.focus();
  }, [step]);
  useEffect(
    () => () => {
      activeSearch.current?.abort();
    },
    [],
  );

  function changeIdentity(change: Partial<Identity>) {
    setControl((previous) => ({
      ...previous,
      art12bis: { lesions: "", presented_document: "" },
    }));
    setPhoto(null);
    setIncludeDocumentPhoto(false);
    setDocumentPhoto(null);
    setDocumentConfirmed(false);
    setPreparingDocument(false);
    setPhotoConfirmed(false);
    setPreparingPhoto(false);
    requestId.current = "";
    activeSearch.current?.abort();
    setSearching(false);
    setResults(null);
    setSearchedKey("");
    setError("");
    setPerson(null);
    setCanControl(true);
    setIsNew(false);
    setPersonal(emptyPersonal);
    setStep(1);
    setIdentity((prev) => ({ ...prev, ...change }));
  }
  function choose(found: Person) {
    setControl((previous) => ({
      ...previous,
      art12bis: { lesions: "", presented_document: "" },
    }));
    setPhoto(null);
    setIncludeDocumentPhoto(false);
    setDocumentPhoto(null);
    setDocumentConfirmed(false);
    setPreparingDocument(false);
    setPhotoConfirmed(false);
    setPreparingPhoto(false);
    activeSearch.current?.abort();
    setSearching(false);
    setPerson(found);
    setCanControl(false);
    setPersonal(personalForm(found));
    setIdentity({
      document_type: found.document_type,
      document_number: found.document_number,
      issuing_country: found.issuing_country,
      document_label: found.document_label,
    });
    setIsNew(false);
    setResults(null);
    setStep(2);
    setError("");
    requestId.current = "";
  }
  async function searchNow() {
    const valid = identitySchema.safeParse(identity);
    if (!valid.success) {
      setError(valid.error.issues[0].message);
      return;
    }
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setSearching(true);
    setError("");
    try {
      const data = await api<{ people: Person[] }>(
        "/api/people/search",
        {
          type: identity.document_type,
          country: identity.issuing_country,
          query: identity.document_number,
        },
        controller.signal,
      );
      const exact = data.people.find(
        (p) => p.document_number === valid.data.document_number,
      );
      setResults(data.people);
      setSearchedKey(searchKey);
      if (exact) choose(exact);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError((err as Error).message);
        setResults(null);
        setSearchedKey("");
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  function createPerson() {
    const valid = identitySchema.safeParse(identity);
    if (!valid.success) {
      setError(valid.error.issues[0].message);
      return;
    }
    if (searchedKey !== searchKey) return;
    setIdentity(valid.data);
    activeSearch.current?.abort();
    setSearching(false);
    setIsNew(true);
    setResults(null);
    setStep(2);
    setError("");
    requestId.current = "";
  }
  function continueToControl() {
    if (person && !canControl) return;
    const valid = personalSchema.safeParse(personal);
    if (!valid.success) {
      setError(valid.error.issues[0].message);
      return;
    }
    setPersonal(valid.data);
    setControl((previous) => ({
      ...previous,
      art12bis: {
        ...previous.art12bis,
        presented_document: presentedDocument,
      },
    }));
    setError("");
    setStep(3);
  }
  async function submit() {
    if (saving || preparingPhoto || preparingDocument || locating) return;
    if (person && !canControl) return;
    const valid = controlSchema.safeParse({
      ...control,
      art12bis: {
        ...control.art12bis,
        presented_document: presentedDocument,
      },
    });
    if (!valid.success) {
      setError(valid.error.issues[0].message);
      return;
    }
    if (!photo || !photoConfirmed) {
      setError(
        "Adjunta una foto actualizada y confirma que corresponde a la persona en este control.",
      );
      return;
    }
    const attachedDocumentPhoto = includeDocumentPhoto ? documentPhoto : null;
    if (attachedDocumentPhoto && !documentConfirmed) {
      setError(
        "Confirma que la imagen del documento adjunta se lee claramente.",
      );
      return;
    }
    requestId.current ||= crypto.randomUUID();
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.set(
        "payload",
        JSON.stringify({
          request_id: requestId.current,
          ...(person
            ? {
                person_id: person.id,
                contact: contactSchema.parse(personal),
                person_details: personDetailsSchema.parse(personal),
              }
            : { identity, personal }),
          control: valid.data,
        }),
      );
      form.set("photo", photo, photoFileName(photo));
      form.set("photo_confirmed", "true");
      if (attachedDocumentPhoto) {
        form.set(
          "document_photo",
          attachedDocumentPhoto,
          `documento-${photoFileName(attachedDocumentPhoto)}`,
        );
        form.set("document_photo_confirmed", "true");
      }
      const response = await fetch("/api/controls", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (data.code === "CONTROL_INTERVAL")
        setAvailabilityRevision((value) => value + 1);
      if (!response.ok)
        throw new Error(
          data.error ||
            "No se pudo guardar el control y su foto. Intenta nuevamente.",
        );
      setSaved(data.control);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function reset() {
    setPhoto(null);
    setIncludeDocumentPhoto(false);
    setDocumentPhoto(null);
    setDocumentConfirmed(false);
    setPreparingDocument(false);
    setPhotoConfirmed(false);
    setPreparingPhoto(false);
    activeSearch.current?.abort();
    setSearching(false);
    setIdentity({
      document_type: "RUT",
      document_number: "",
      issuing_country: "Chile",
      document_label: "",
    });
    setPerson(null);
    setCanControl(true);
    setPersonal(emptyPersonal);
    setIsNew(false);
    setStep(1);
    setResults(null);
    setSearchedKey("");
    setError("");
    setSaved(null);
    setControl((prev) => ({
      ...prev,
      notes: "",
      art12bis: { lesions: "", presented_document: "" },
    }));
    requestId.current = "";
  }
  const canCreate =
    results !== null &&
    searchedKey === searchKey &&
    identitySchema.safeParse(identity).success &&
    !results.some(
      (p) => p.document_number === normalizeDocument(identity.document_number),
    );

  if (saved)
    return (
      <section className="success-panel card" aria-live="polite">
        <span className="success-icon">
          <CheckCircle2 size={40} />
        </span>
        <span className="eyebrow">REGISTRO COMPLETADO</span>
        <h2>Control registrado correctamente</h2>
        <p>
          El control de{" "}
          <strong>
            {personal.first_names} {personal.last_names}
          </strong>{" "}
          ya está guardado.
        </p>
        <div className="success-receipt">
          <span>
            {identity.document_type} ·{" "}
            {displayDocument(
              identity.document_type,
              normalizeDocument(identity.document_number),
            )}
          </span>
          <strong>{chileDate(saved.controlled_at, true)}</strong>
          <small>Registro {saved.id.slice(0, 8).toUpperCase()}</small>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={onHistory}>
            <History size={17} /> Ver historial
          </button>
          <button className="button primary" onClick={reset}>
            <Plus size={18} /> Nuevo control
          </button>
        </div>
        <ControlDocument key={saved.id} control={saved} />
        <ControlPhoto control={saved} />
      </section>
    );

  return (
    <div className="registration-grid">
      <div className="form-column">
        <div className="steps" aria-label="Progreso del registro">
          {["Documento", "Persona", "Control"].map((label, i) => (
            <div
              className={`step ${step === i + 1 ? "current" : ""} ${step > i + 1 ? "complete" : ""}`}
              key={label}
              aria-current={step === i + 1 ? "step" : undefined}
            >
              <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span>
              <span>{label}</span>
              {i < 2 && <ChevronRight size={15} className="step-arrow" />}
            </div>
          ))}
        </div>
        <section className="card main-form">
          <div className="section-heading">
            <div>
              <h2 tabIndex={-1} ref={formHeading}>
                {step === 1
                  ? "Identificar persona"
                  : step === 2
                    ? "Datos personales"
                    : "Datos del control"}
              </h2>
              <p>
                {step === 1
                  ? "Busca un documento o registra una persona nueva."
                  : step === 2
                    ? person
                      ? "Información recuperada desde la ficha existente."
                      : "Completa la información de la nueva persona."
                    : "Completa los antecedentes de este procedimiento."}
              </p>
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <Info size={18} />
              <span>{error}</span>
            </div>
          )}
          {person && step > 1 && (
            <ControlIntervalNotice
              key={person.id}
              personId={person.id}
              revision={availabilityRevision}
              onChange={setCanControl}
            />
          )}
          {step === 1 && (
            <>
              <label className="field-label">
                Tipo de documento <span>*</span>
              </label>
              <div
                className="document-options"
                role="group"
                aria-label="Tipo de documento"
              >
                {documentTypes.map((type) => (
                  <button
                    key={type}
                    className={`document-option ${identity.document_type === type ? "selected" : ""}`}
                    aria-pressed={identity.document_type === type}
                    onClick={() =>
                      changeIdentity({
                        document_type: type,
                        document_number: "",
                        issuing_country: type === "RUT" ? "Chile" : "",
                        document_label: "",
                      })
                    }
                  >
                    <span>{type}</span>
                  </button>
                ))}
              </div>
              {identity.document_type !== "RUT" && (
                <div className="fields-grid identity-extra">
                  <Field label="País emisor" required>
                    <CountryInput
                      label="País emisor"
                      value={identity.issuing_country}
                      onChange={(value) =>
                        changeIdentity({ issuing_country: value })
                      }
                    />
                  </Field>
                  {identity.document_type === "Otro" && (
                    <Field label="Nombre del documento" required>
                      <input
                        aria-label="Nombre del documento"
                        placeholder="Ej. cédula de identidad"
                        value={identity.document_label}
                        maxLength={60}
                        onChange={(e) =>
                          changeIdentity({ document_label: e.target.value })
                        }
                      />
                    </Field>
                  )}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void searchNow();
                }}
              >
                <Field
                  label={
                    identity.document_type === "RUT"
                      ? "RUT de la persona"
                      : "Número de documento"
                  }
                  required
                >
                  <div className="search-row">
                    <div className="input-icon">
                      <Search size={19} />
                      <DocumentNumberInput
                        documentType={identity.document_type}
                        aria-label="Número de documento"
                        aria-describedby="document-number-hint"
                        aria-invalid={rutInvalid || undefined}
                        placeholder={
                          identity.document_type === "RUT"
                            ? "Ej. 12.345.678-5"
                            : "Ingresa el número de documento"
                        }
                        autoComplete="off"
                        autoCapitalize="characters"
                        enterKeyHint="search"
                        spellCheck={false}
                        maxLength={30}
                        value={identity.document_number}
                        onValueChange={(value) =>
                          changeIdentity({ document_number: value })
                        }
                      />
                    </div>
                    <button
                      className="button primary search-button"
                      disabled={
                        searching ||
                        !identity.document_number.trim() ||
                        (isRut && !rutValid)
                      }
                      type="submit"
                    >
                      {searching ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <Search size={17} />
                      )}{" "}
                      Buscar
                    </button>
                  </div>
                </Field>
              </form>
              <p
                id="document-number-hint"
                className={`field-hint ${rutInvalid ? "document-invalid" : rutValid ? "document-valid" : ""}`}
                aria-live="polite"
              >
                {!isRut
                  ? "La búsqueda considera el tipo de documento y su país emisor."
                  : rutValid
                    ? "RUT válido."
                    : rutInvalid
                      ? "RUT inválido. Revisa el número y su dígito verificador."
                      : normalizedNumber
                        ? "Escribe el RUT completo, incluido el dígito verificador."
                        : "Los puntos y el guion se agregan automáticamente."}
              </p>
              <div aria-live="polite">
                {searching && (
                  <div className="search-status">
                    <LoaderCircle size={15} className="spin" /> Buscando
                    coincidencias…
                  </div>
                )}
                {!searching && results && results.length > 0 && (
                  <div className="results">
                    <div className="results-label">
                      COINCIDENCIAS ENCONTRADAS <span>{results.length}</span>
                    </div>
                    {results.map((found) => (
                      <button
                        className="result"
                        key={found.id}
                        onClick={() => choose(found)}
                      >
                        <span className="person-avatar">
                          <UserRound size={19} />
                        </span>
                        <span>
                          <strong>
                            {found.first_names} {found.last_names}
                          </strong>
                          <small>
                            {displayDocument(
                              found.document_type,
                              found.document_number,
                            )}{" "}
                            · {found.nationality}
                          </small>
                        </span>
                        <span className="result-date">
                          {found.last_control_at
                            ? `Último control: ${chileDate(found.last_control_at)}`
                            : "Sin controles anteriores"}
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  </div>
                )}
                {!searching && canCreate && (
                  <div className="new-person-result">
                    <div>
                      <UserRoundPlus size={21} />
                      <span>
                        <strong>Este documento no está registrado</strong>
                        <small>
                          Puedes crear la ficha y registrar su primer control.
                        </small>
                      </span>
                    </div>
                    <button className="button secondary" onClick={createPerson}>
                      <Plus size={16} /> Registrar nueva persona
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className={`alert ${person ? "positive" : "neutral"}`}>
                <CheckCircle2 size={19} />
                <span>
                  <strong>
                    {person ? "Persona encontrada" : "Nuevo registro"}
                  </strong>{" "}
                  · {identity.document_type}{" "}
                  {displayDocument(
                    identity.document_type,
                    normalizeDocument(identity.document_number),
                  )}
                  {person && (
                    <small>
                      Último control:{" "}
                      {person.last_control_at
                        ? chileDate(person.last_control_at, true)
                        : "Sin controles anteriores"}
                    </small>
                  )}
                </span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  continueToControl();
                }}
              >
                <div className="fields-grid">
                  <Field label="Nombres" required>
                    <input
                      aria-label="Nombres"
                      required
                      readOnly={!!person}
                      value={personal.first_names}
                      maxLength={100}
                      placeholder="Nombres de la persona"
                      onChange={(e) =>
                        setPersonal({
                          ...personal,
                          first_names: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Apellido paterno" required>
                    <input
                      aria-label="Apellido paterno"
                      required
                      value={personal.paternal_surname}
                      maxLength={100}
                      autoComplete="off"
                      placeholder="Apellido paterno completo"
                      onChange={(e) =>
                        setPersonal({
                          ...personal,
                          paternal_surname: e.target.value,
                          last_names: joinedSurnames(
                            e.target.value,
                            personal.maternal_surname,
                          ),
                        })
                      }
                    />
                    {person && !person.paternal_surname && (
                      <p className="field-hint">
                        Apellidos registrados: {person.last_names}. Completa los
                        campos por separado.
                      </p>
                    )}
                  </Field>
                  <Field label="Apellido materno">
                    <input
                      aria-label="Apellido materno"
                      value={personal.maternal_surname}
                      maxLength={100}
                      autoComplete="off"
                      placeholder="Apellido materno completo"
                      onChange={(e) =>
                        setPersonal({
                          ...personal,
                          maternal_surname: e.target.value,
                          last_names: joinedSurnames(
                            personal.paternal_surname,
                            e.target.value,
                          ),
                        })
                      }
                    />
                    <p className="field-hint">
                      Déjalo vacío si la persona no tiene segundo apellido.
                    </p>
                  </Field>
                  <Field label="Sexo" required>
                    <select
                      aria-label="Sexo"
                      required
                      value={personal.sex}
                      onChange={(e) =>
                        setPersonal({
                          ...personal,
                          sex: e.target.value as PersonalForm["sex"],
                        })
                      }
                    >
                      <option value="" disabled>
                        Seleccionar
                      </option>
                      {sexOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Fecha de nacimiento" required>
                    <input
                      aria-label="Fecha de nacimiento"
                      type="date"
                      min="1900-01-01"
                      required
                      readOnly={!!person}
                      value={personal.birth_date}
                      onChange={(e) =>
                        setPersonal({ ...personal, birth_date: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Nacionalidad" required>
                    <CountryInput
                      label="Nacionalidad"
                      readOnly={!!person}
                      value={personal.nationality}
                      onChange={(value) =>
                        setPersonal({
                          ...personal,
                          nationality: value,
                        })
                      }
                    />
                  </Field>
                </div>
                <section
                  className="contact-fields"
                  aria-label="Datos de contacto"
                >
                  <h3>Datos de contacto</h3>
                  {person && (
                    <p className="field-hint">
                      Completa o actualiza estos datos. Se guardarán con el
                      nuevo control.
                    </p>
                  )}
                  <div className="fields-grid">
                    <Field label="Domicilio" wide required>
                      <input
                        aria-label="Domicilio"
                        required
                        value={personal.address}
                        maxLength={250}
                        placeholder="Calle, número y departamento"
                        onChange={(e) =>
                          setPersonal({ ...personal, address: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Comuna" required>
                      <input
                        aria-label="Comuna"
                        required
                        value={personal.commune}
                        maxLength={80}
                        placeholder="Comuna de residencia"
                        onChange={(e) =>
                          setPersonal({ ...personal, commune: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Teléfono de contacto" required>
                      <input
                        aria-label="Teléfono de contacto"
                        type="tel"
                        required
                        value={personal.phone}
                        maxLength={30}
                        placeholder="Ej. +56 9 1234 5678"
                        onChange={(e) =>
                          setPersonal({ ...personal, phone: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                </section>
                <div className="form-actions">
                  <button
                    type="button"
                    className="button text-button"
                    onClick={reset}
                  >
                    <ArrowLeft size={16} /> Cambiar persona
                  </button>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={!!person && !canControl}
                  >
                    Continuar <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            </>
          )}
          {step === 3 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="selected-person">
                <span className="person-avatar">
                  <UserRound size={22} />
                </span>
                <div>
                  <strong>
                    {personal.first_names} {personal.last_names}
                  </strong>
                  <small>
                    {identity.document_type} ·{" "}
                    {displayDocument(
                      identity.document_type,
                      normalizeDocument(identity.document_number),
                    )}
                  </small>
                </div>
                <span className="badge green">
                  {person ? "Ficha existente" : "Nueva persona"}
                </span>
              </div>
              <fieldset
                disabled={saving || preparingPhoto || preparingDocument}
                className="control-fieldset"
              >
                <PhotoInput
                  photo={photo}
                  onChange={setPhoto}
                  confirmed={photoConfirmed}
                  onConfirm={setPhotoConfirmed}
                  onPreparing={setPreparingPhoto}
                  disabled={saving}
                />
                <div className="optional-document-photo">
                  <label className="photo-confirm">
                    <input
                      type="checkbox"
                      checked={includeDocumentPhoto}
                      onChange={(event) => {
                        setIncludeDocumentPhoto(event.target.checked);
                        if (!event.target.checked) {
                          setDocumentPhoto(null);
                          setDocumentConfirmed(false);
                          setPreparingDocument(false);
                          setError("");
                        }
                      }}
                    />
                    <span>Agregar foto del documento (opcional)</span>
                  </label>
                  <p className="field-hint">
                    Puedes guardar el control sin esta foto.
                  </p>
                  {includeDocumentPhoto && (
                    <PhotoInput
                      kind="document"
                      photo={documentPhoto}
                      onChange={setDocumentPhoto}
                      confirmed={documentConfirmed}
                      onConfirm={setDocumentConfirmed}
                      onPreparing={setPreparingDocument}
                      disabled={saving}
                    />
                  )}
                </div>
                <div className="fields-grid">
                  <div className="field field-wide">
                    <span className="field-label">Funcionario responsable</span>
                    <strong>
                      {[staff.officer_grade, staff.name]
                        .filter(Boolean)
                        .join(" · ")}
                    </strong>
                    <p className="field-hint">
                      {staff.officer_code ? `${staff.officer_code} · ` : ""}
                      Datos automáticos de tu cuenta.
                    </p>
                    {!staff.officer_grade && (
                      <p className="field-hint">
                        El administrador puede completar tu grado en Usuarios.
                      </p>
                    )}
                  </div>
                  <ControlLocationInput
                    value={control.location}
                    onChange={changeLocation}
                    onLocating={setLocating}
                  />
                  <Field label="Observaciones" wide>
                    <textarea
                      aria-label="Observaciones"
                      rows={4}
                      value={control.notes}
                      maxLength={2000}
                      placeholder="Agrega antecedentes relevantes del control (opcional)."
                      onChange={(e) =>
                        setControl({ ...control, notes: e.target.value })
                      }
                    />
                    <span className="character-count">
                      {control.notes.length} / 2.000
                    </span>
                  </Field>
                </div>
                <div className="acta-fields">
                  <strong>Acta del artículo 12 bis</strong>
                  <p className="field-hint">
                    Al guardar podrás descargar el PDF del acta o el Word con el
                    reporte de consulta como primera página. El N.º de acta y
                    los datos de la PDI quedan en blanco. Se incluyen la foto de
                    la persona y, si se adjunta, la imagen del documento.
                  </p>
                  <div className="fields-grid">
                    {(
                      [
                        ["lesions", "Lesiones consignadas", 120],
                        [
                          "presented_document",
                          "Documento de identidad presentado",
                          160,
                        ],
                      ] as const
                    ).map(([key, label, maxLength]) => (
                      <Field label={label} key={key} required>
                        <input
                          aria-label={label}
                          required
                          maxLength={maxLength}
                          readOnly={key === "presented_document"}
                          value={
                            key === "presented_document"
                              ? presentedDocument
                              : control.art12bis[key]
                          }
                          placeholder={
                            key === "lesions"
                              ? "Describe las lesiones o indica Sin lesiones"
                              : "Tipo y número de documento"
                          }
                          onChange={(e) =>
                            setControl({
                              ...control,
                              art12bis: {
                                ...control.art12bis,
                                [key]: e.target.value,
                              },
                            })
                          }
                        />
                        <p className="field-hint">
                          {key === "lesions"
                            ? "Si no presenta lesiones, escribe «Sin lesiones»."
                            : "Es el documento seleccionado al inicio y el que aparecerá en el PDF. Para corregirlo, vuelve al paso Documento."}
                        </p>
                      </Field>
                    ))}
                  </div>
                </div>
                <div className="info-note">
                  <History size={17} />
                  <p>
                    La fecha y hora se asignarán automáticamente al guardar el
                    control.
                  </p>
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="button text-button"
                    onClick={() => {
                      setStep(2);
                      setError("");
                    }}
                  >
                    <ArrowLeft size={16} /> Atrás
                  </button>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={
                      preparingPhoto ||
                      preparingDocument ||
                      locating ||
                      (!!person && !canControl)
                    }
                  >
                    {saving ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <ShieldCheck size={17} />
                    )}{" "}
                    {saving ? "Guardando control…" : "Guardar control"}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`field ${wide ? "field-wide" : ""}`}>
      <label className="field-label">
        {label}
        {required && <span> *</span>}
      </label>
      {children}
    </div>
  );
}
