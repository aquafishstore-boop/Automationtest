/**
 * Lightweight FHIR R4 Server
 * Serves synthetic patient data for pathology system testing.
 * Endpoints: Patient, Observation, DiagnosticReport, Specimen, ServiceRequest
 *
 * Runs as an Express sub-app on /api/fhir/r4/
 */

import { Router } from "express";
import { generatePatient, generateObservation, generateDiagnosticReport, generateSpecimen, generateServiceRequest, generateBundle } from "./fhir-generator.js";

const patients = new Map();

export function createFHIRRouter() {
  const router = Router();

  // --- Capability Statement ---
  router.get("/metadata", (req, res) => {
    res.json({
      resourceType: "CapabilityStatement",
      status: "active",
      date: new Date().toISOString(),
      publisher: "Aetheris Pathology Cloud",
      kind: "instance",
      software: { name: "UAT FHIR Server", version: "1.0.0" },
      fhirVersion: "4.0.1",
      format: ["application/fhir+json"],
      rest: [{
        mode: "server",
        resource: [
          { type: "Patient", interaction: [{ code: "read" }, { code: "search-type" }, { code: "create" }] },
          { type: "Observation", interaction: [{ code: "read" }, { code: "search-type" }, { code: "create" }] },
          { type: "DiagnosticReport", interaction: [{ code: "read" }, { code: "search-type" }] },
          { type: "Specimen", interaction: [{ code: "read" }, { code: "create" }] },
          { type: "ServiceRequest", interaction: [{ code: "read" }, { code: "create" }] }
        ]
      }]
    });
  });

  // --- Patient ---
  router.get("/Patient/:id", (req, res) => {
    let patient;
    if (patients.has(req.params.id)) {
      patient = patients.get(req.params.id);
    } else {
      patient = generatePatient({ id: req.params.id, nhsNumber: req.query.nhsNumber });
      patients.set(req.params.id, patient);
    }
    res.json(patient);
  });

  router.get("/Patient", (req, res) => {
    const identifier = req.query.identifier || "";
    const family = req.query.family || "";
    let results = Array.from(patients.values());

    if (identifier) results = results.filter(p => p.identifier?.some(i => i.value?.includes(identifier)));
    if (family) results = results.filter(p => p.name?.some(n => n.family?.toLowerCase() === family.toLowerCase()));

    if (results.length === 0) {
      results = [generatePatient({ nhsNumber: identifier.replace(/^.*\//, "") || undefined, family })];

      if (req.query._count === "1") {
        patients.set(results[0].id, results[0]);
        return res.json(results[0]);
      }
    }

    const bundle = generateBundle(results.slice(0, parseInt(req.query._count) || 10), "searchset");
    bundle.total = results.length;
    res.json(bundle);
  });

  router.post("/Patient", (req, res) => {
    const patient = { ...generatePatient(req.body), ...req.body, meta: { ...generatePatient(req.body).meta, ...req.body.meta } };
    patients.set(patient.id, patient);
    res.status(201).json(patient);
  });

  // --- Observation ---
  router.get("/Observation/:id", (req, res) => {
    res.json(generateObservation(req.params.patientId || req.query.patient?.[0] || "unknown", { id: req.params.id }));
  });

  router.get("/Observation", (req, res) => {
    const patientRef = req.query["subject"] || req.query.patient || "";
    const code = req.query.code || "";
    const n = parseInt(req.query._count) || 10;
    const patientId = patientRef.replace("Patient/", "");
    const obs = Array.from({ length: n }, (_, i) =>
      generateObservation(patientId, code ? { code: [{ system: "http://loinc.org", code, display: "Requested test" }] } : {})
    );
    res.json(generateBundle(obs, "searchset"));
  });

  router.post("/Observation", (req, res) => {
    res.status(201).json(generateObservation(req.body.subject?.reference?.replace("Patient/", "") || "unknown", req.body));
  });

  // --- DiagnosticReport ---
  router.get("/DiagnosticReport/:id", (req, res) => {
    const obs = Array.from({ length: 5 }, () => generateObservation(req.query.patient || "unknown"));
    res.json(generateDiagnosticReport(req.query.patient || "unknown", obs, { id: req.params.id }));
  });

  router.get("/DiagnosticReport", (req, res) => {
    const patientId = (req.query.subject || req.query.patient || "").replace("Patient/", "");
    const n = parseInt(req.query._count) || 5;
    const reports = Array.from({ length: n }, () => {
      const obs = Array.from({ length: 3 }, () => generateObservation(patientId));
      return generateDiagnosticReport(patientId, obs);
    });
    res.json(generateBundle(reports, "searchset"));
  });

  // --- Specimen ---
  router.post("/Specimen", (req, res) => {
    const patientId = req.body.subject?.reference?.replace("Patient/", "") || "unknown";
    res.status(201).json(generateSpecimen(patientId, req.body));
  });

  // --- ServiceRequest ---
  router.post("/ServiceRequest", (req, res) => {
    const patientId = req.body.subject?.reference?.replace("Patient/", "") || "unknown";
    res.status(201).json(generateServiceRequest(patientId, req.body));
  });

  return router;
}
