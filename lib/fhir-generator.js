/**
 * FHIR Test Data Generator
 * Generates synthetic patient data conforming to FHIR R4.
 * Covers: Patient, Observation, DiagnosticReport, Specimen, ServiceRequest
 */

export function generatePatient(overrides = {}) {
  const id = overrides.id || `pat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const family = overrides.family || randomElement(FAMILIES);
  const given = overrides.given || randomElement(GIVEN);
  const gender = overrides.gender || randomElement(["male", "female"]);
  const birthDate = overrides.birthDate || randomBirthDate();

  return {
    resourceType: "Patient",
    id,
    identifier: [
      { system: "https://fhir.nhs.uk/Id/nhs-number", value: overrides.nhsNumber || generateNHSNumber() },
      { system: "urn:oid:2.16.840.1.113883.2.1.4.1", value: `MRN-${Math.random().toString(36).slice(2, 10).toUpperCase()}` }
    ],
    name: [{ use: "official", family, given: [given] }],
    gender,
    birthDate,
    address: overrides.address || [{
      line: overrides.addressLine1 || randomElement(ADDRESSES),
      city: overrides.city || randomElement(CITIES),
      district: overrides.district || randomElement(DISTRICTS),
      postalCode: overrides.postCode || randomPostcode(),
      use: "home"
    }],
    telecom: [
      { system: "phone", value: `07${Math.random().toString().slice(2, 11)}`, use: "mobile" }
    ],
    generalPractitioner: overrides.gp ? [{ identifier: { system: "https://fhir.nhs.uk/Id/ods-organization-code", value: overrides.gp } }] : [],
    meta: {
      profile: ["https://fhir.nhs.uk/StructureDefinition/NHS-Patient"],
      lastUpdated: new Date().toISOString()
    }
  };
}

export function generateObservation(patientId, overrides = {}) {
  const codes = overrides.code ? [overrides.code] : randomElement(OBSERVATION_CODES);
  const value = overrides.value !== undefined ? overrides.value : randomValue(codes[0]);
  return {
    resourceType: "Observation",
    id: `obs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    status: overrides.status || "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
    code: {
      coding: codes,
      text: overrides.testName || codes[0]?.display || "Laboratory test"
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: overrides.effectiveDateTime || new Date().toISOString(),
    valueQuantity: value ? {
      value: value.value,
      unit: value.unit,
      system: "http://unitsofmeasure.org",
      code: value.code
    } : undefined,
    valueString: overrides.valueString,
    interpretation: value?.refLow && value?.refHigh ? [{
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
        code: value.value < value.refLow ? "L" : value.value > value.refHigh ? "H" : "N"
      }]
    }] : undefined,
    referenceRange: value?.refLow ? [{
      low: { value: value.refLow, unit: value.unit },
      high: { value: value.refHigh, unit: value.unit }
    }] : undefined,
    meta: { lastUpdated: new Date().toISOString() }
  };
}

export function generateDiagnosticReport(patientId, observations, overrides = {}) {
  return {
    resourceType: "DiagnosticReport",
    id: `rpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    status: overrides.status || "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB" }] }],
    code: {
      coding: overrides.reportCodes || [{ system: "http://loinc.org", code: "11502-2", display: "Laboratory report" }]
    },
    subject: { reference: `Patient/${patientId}` },
    issued: new Date().toISOString(),
    performer: overrides.performer ? [{ display: overrides.performer }] : [{ display: "UAT Pathology Lab" }],
    result: (observations || []).map(obs => ({ reference: `Observation/${obs.id}` })),
    conclusion: overrides.conclusion || "All results within reference ranges",
    meta: { lastUpdated: new Date().toISOString() }
  };
}

export function generateSpecimen(patientId, overrides = {}) {
  return {
    resourceType: "Specimen",
    id: `spec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type: {
      coding: overrides.specimenType || [{ system: "http://snomed.info/sct", code: "119297000", display: "Blood specimen" }]
    },
    subject: { reference: `Patient/${patientId}` },
    collection: {
      collectedDateTime: overrides.collectedDateTime || new Date().toISOString(),
      method: { coding: [{ system: "http://snomed.info/sct", code: "67889009", display: "Venipuncture" }] }
    },
    meta: { lastUpdated: new Date().toISOString() }
  };
}

export function generateServiceRequest(patientId, overrides = {}) {
  return {
    resourceType: "ServiceRequest",
    id: `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    status: overrides.status || "active",
    intent: "order",
    code: {
      coding: overrides.testCodes || [{ system: "http://loinc.org", code: "58410-2", display: "Complete blood count" }]
    },
    subject: { reference: `Patient/${patientId}` },
    requester: overrides.requester ? { display: overrides.requester } : { display: "Dr. UAT Tester" },
    occurrenceDateTime: overrides.occurrenceDateTime || new Date().toISOString(),
    reasonCode: overrides.reason ? [{ text: overrides.reason }] : [{ text: "Routine screening" }],
    meta: { lastUpdated: new Date().toISOString() }
  };
}

export function generateBundle(resources, type = "transaction") {
  return {
    resourceType: "Bundle",
    type,
    entry: resources.map(r => ({
      fullUrl: `urn:uuid:${r.id}`,
      resource: r,
      request: type === "transaction" ? {
        method: "POST",
        url: r.resourceType
      } : undefined
    })),
    meta: { lastUpdated: new Date().toISOString() }
  };
}

export function generateFullPatientBundle(overrides = {}) {
  const patient = generatePatient(overrides);
  const obsCount = overrides.observationCount || randomInt(3, 8);
  const observations = Array.from({ length: obsCount }, () => generateObservation(patient.id));
  const report = generateDiagnosticReport(patient.id, observations, overrides);
  const specimen = generateSpecimen(patient.id, overrides);
  const request = generateServiceRequest(patient.id, overrides);
  return generateBundle([patient, ...observations, report, specimen, request]);
}

function generateNHSNumber() {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
  return `999 ${digits.slice(0, 3)} ${digits.slice(3)}`;
}

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomBirthDate() {
  const year = randomInt(1940, 2020);
  const month = String(randomInt(1, 12)).padStart(2, "0");
  const day = String(randomInt(1, 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function randomPostcode() {
  const out = String.fromCharCode(65 + randomInt(0, 25)) + String.fromCharCode(65 + randomInt(0, 25));
  return `${out}${randomInt(1, 99)} ${randomInt(1, 9)}${String.fromCharCode(65 + randomInt(0, 25))}${String.fromCharCode(65 + randomInt(0, 25))}`;
}
function randomElement(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randomValue(codeObj) {
  const testDef = TEST_DEFS[codeObj.code];
  if (!testDef) return null;
  const val = testDef.refLow + Math.random() * (testDef.refHigh - testDef.refLow);
  return { value: Math.round(val * 100) / 100, unit: testDef.unit, code: testDef.unitCode, refLow: testDef.refLow, refHigh: testDef.refHigh };
}

const FAMILIES = ["Smith", "Jones", "Williams", "Brown", "Taylor", "Davies", "Wilson", "Evans", "Thomas", "Roberts", "Johnson", "Wright", "Walker", "Thompson", "White", "Hughes", "Edwards", "Green", "Hall", "Wood", "Harris", "Martin", "Jackson", "Clarke", "Turner"];
const GIVEN = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Christopher", "Karen"];
const CITIES = ["London", "Manchester", "Birmingham", "Leeds", "Liverpool", "Newcastle", "Sheffield", "Bristol", "Nottingham", "Southampton", "Portsmouth", "Leicester", "Oxford", "Cambridge", "Cardiff", "Edinburgh", "Glasgow", "Belfast"];
const DISTRICTS = ["Greater London", "Greater Manchester", "West Midlands", "West Yorkshire", "Merseyside", "Tyne and Wear", "South Yorkshire", "Bristol", "Nottinghamshire", "Hampshire", "Leicestershire"];
const ADDRESSES = ["1 High Street", "25 London Road", "42 Church Lane", "7 Park Avenue", "15 Queen Street", "33 Station Road", "8 Victoria Road", "19 Main Street", "3 King Street", "12 Oak Avenue"];

const OBSERVATION_CODES = [
  [{ system: "http://loinc.org", code: "718-7", display: "Haemoglobin" }],
  [{ system: "http://loinc.org", code: "787-2", display: "MCV" }],
  [{ system: "http://loinc.org", code: "6690-2", display: "White blood cell count" }],
  [{ system: "http://loinc.org", code: "777-3", display: "Platelet count" }],
  [{ system: "http://loinc.org", code: "6299-2", display: "Urea" }],
  [{ system: "http://loinc.org", code: "38483-4", display: "Creatinine" }],
  [{ system: "http://loinc.org", code: "33762-6", display: "Sodium" }],
  [{ system: "http://loinc.org", code: "6298-4", display: "Potassium" }],
  [{ system: "http://loinc.org", code: "1963-8", display: "Bilirubin" }],
  [{ system: "http://loinc.org", code: "1742-6", display: "ALT" }],
];

const TEST_DEFS = {
  "718-7": { unit: "g/L", unitCode: "g/L", refLow: 120, refHigh: 160 },
  "787-2": { unit: "fL", unitCode: "fL", refLow: 80, refHigh: 100 },
  "6690-2": { unit: "x10^9/L", unitCode: "10*9/L", refLow: 4.0, refHigh: 11.0 },
  "777-3": { unit: "x10^9/L", unitCode: "10*9/L", refLow: 150, refHigh: 400 },
  "6299-2": { unit: "mmol/L", unitCode: "mmol/L", refLow: 2.5, refHigh: 7.8 },
  "38483-4": { unit: "umol/L", unitCode: "umol/L", refLow: 60, refHigh: 120 },
  "33762-6": { unit: "mmol/L", unitCode: "mmol/L", refLow: 135, refHigh: 145 },
  "6298-4": { unit: "mmol/L", unitCode: "mmol/L", refLow: 3.5, refHigh: 5.2 },
  "1963-8": { unit: "umol/L", unitCode: "umol/L", refLow: 3, refHigh: 21 },
  "1742-6": { unit: "U/L", unitCode: "U/L", refLow: 10, refHigh: 40 },
};
