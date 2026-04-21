import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const app = express();
const port = process.env.PORT ?? 3000;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPatientDataPath = path.resolve(currentDir, "../../database/病人模擬資料.json");
const patientDataPath = process.env.PATIENT_DATA_PATH ?? defaultPatientDataPath;

const assessmentItems = [
  { key: "ventilatorDemand", label: "高呼吸器需求", sourceKey: "高呼吸器需求(FiO₂>60% 或 PEEP≥10)(10分)", type: "boolean", weight: 10 },
  { key: "rassAgitation", label: "RASS鎮靜分數在+2以上", sourceKey: "RASS鎮靜分數在+2以上(10分)", type: "boolean", weight: 10 },
  { key: "fallRisk", label: "躁動且有下床風險", sourceKey: "是否躁動且有下床風險(25分)", type: "boolean", weight: 25 },
  { key: "tubeRemovalRisk", label: "躁動且有自拔管路風險", sourceKey: "是否躁動且有自拔管路風險(25分)", type: "boolean", weight: 25 },
  { key: "negativePressureRoom", label: "負壓隔離室", sourceKey: "是否在負壓隔離室(10分)", type: "boolean", weight: 10 },
  { key: "tubeFeeding", label: "需人工管灌", sourceKey: "需人工管灌(5分)", type: "boolean", weight: 5 },
  { key: "frequentDressing", label: "需頻繁換藥", sourceKey: "需頻繁換藥(10分)", type: "boolean", weight: 10 },
  {
    key: "abnormalReports",
    label: "檢查報告異常項目數",
    sourceKey: "檢查報告異常項目數(每項+2分、最多10分)",
    type: "select",
    weight: 10,
    pointsPerUnit: 2,
    options: [
      { value: 0, label: "0 項" },
      { value: 1, label: "1 項" },
      { value: 2, label: "2 項" },
      { value: 3, label: "3 項" },
      { value: 4, label: "4 項" },
      { value: 5, label: "5 項以上" }
    ]
  },
  { key: "externalExam", label: "出門做特殊檢查", sourceKey: "出門做特殊檢查(15分)", type: "boolean", weight: 15 },
  { key: "frequentMonitoring", label: "需頻繁監測生理狀態", sourceKey: "需頻繁監測生理狀態(10分)", type: "boolean", weight: 10 },
  {
    key: "specialTreatment",
    label: "特殊處置",
    sourceKey: "特殊處置(如: Prone+10分、IABP+10分、CRRT+20分、低溫治療+5分、大量輸血+15分、Plasma Exchange+15分)",
    type: "multi",
    options: [
      { value: "prone", label: "Prone", weight: 10 },
      { value: "iabp", label: "IABP", weight: 10 },
      { value: "crrt", label: "CRRT", weight: 20 },
      { value: "hypothermia", label: "低溫治療", weight: 5 },
      { value: "massiveTransfusion", label: "大量輸血", weight: 15 },
      { value: "plasmaExchange", label: "Plasma Exchange", weight: 15 }
    ]
  },
  { key: "multipleDrains", label: "多引流管", sourceKey: "多引流管(10分) ", type: "boolean", weight: 10 },
  { key: "familyMeeting", label: "需召開家庭會議", sourceKey: "需召開家庭會議(10分)", type: "boolean", weight: 10 }
];

app.use(cors());
app.use(express.json());

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeDate(value) {
  const [year, month, day] = normalizeText(value).split("/").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDiagnosis(patient) {
  const diagnosisKey = Object.keys(patient).find((key) => key.trim() === "診斷");
  return normalizeText(patient[diagnosisKey]);
}

function buildInitialScores(patient) {
  return Object.fromEntries(
    assessmentItems.map((item) => {
      const originalValue = Number(patient[item.sourceKey] ?? 0);

      if (item.type === "boolean") {
        return [item.key, originalValue > 0];
      }

      if (item.type === "select") {
        return [item.key, Math.max(0, Math.min(5, Math.round(originalValue / item.pointsPerUnit)))];
      }

      if (item.type === "multi") {
        return [item.key, buildInitialMultiSelection(originalValue, item.options)];
      }

      return [item.key, 0];
    })
  );
}

function buildInitialMultiSelection(originalValue, options) {
  if (originalValue <= 0) {
    return [];
  }

  if (originalValue >= 20) {
    return ["crrt"];
  }

  const closestOption = options
    .filter((option) => option.weight <= originalValue)
    .sort((first, second) => second.weight - first.weight)[0];

  return closestOption ? [closestOption.value] : [];
}

function calculateBurdenScore(scores) {
  return assessmentItems.reduce((total, item) => total + calculateItemScore(item, scores[item.key]), 0);
}

function calculateItemScore(item, value) {
  if (item.type === "boolean") {
    return value ? item.weight : 0;
  }

  if (item.type === "select") {
    const count = Math.max(0, Math.min(5, Number(value ?? 0)));
    return Math.min(item.weight, count * item.pointsPerUnit);
  }

  if (item.type === "multi") {
    const selectedValues = Array.isArray(value) ? value : [];
    return item.options
      .filter((option) => selectedValues.includes(option.value))
      .reduce((total, option) => total + option.weight, 0);
  }

  return 0;
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      bed_no VARCHAR(20) NOT NULL UNIQUE,
      attending_doctor_primary VARCHAR(50),
      patient_name VARCHAR(50),
      gender VARCHAR(10),
      age INTEGER,
      birth_date DATE,
      admission_date DATE,
      diagnosis TEXT,
      responsible_nurse VARCHAR(20),
      burden_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
      assessment_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await pool.query(`
    ALTER TABLE patients
      ADD COLUMN IF NOT EXISTS attending_doctor_primary VARCHAR(50),
      ADD COLUMN IF NOT EXISTS patient_name VARCHAR(50),
      ADD COLUMN IF NOT EXISTS gender VARCHAR(10),
      ADD COLUMN IF NOT EXISTS age INTEGER,
      ADD COLUMN IF NOT EXISTS birth_date DATE,
      ADD COLUMN IF NOT EXISTS admission_date DATE,
      ADD COLUMN IF NOT EXISTS diagnosis TEXT,
      ADD COLUMN IF NOT EXISTS responsible_nurse VARCHAR(20),
      ADD COLUMN IF NOT EXISTS burden_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS assessment_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS detail JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    DO $$
    DECLARE
      legacy_column TEXT;
    BEGIN
      FOREACH legacy_column IN ARRAY ARRAY['name', 'attending_doctor', 'department', 'hospital_days', 'note']
      LOOP
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'patients'
            AND column_name = legacy_column
        ) THEN
          EXECUTE format('ALTER TABLE patients ALTER COLUMN %I DROP NOT NULL', legacy_column);
        END IF;
      END LOOP;
    END $$;
  `);
}

async function seedPatientsFromJson() {
  const fileContent = await fs.readFile(patientDataPath, "utf8");
  const patients = JSON.parse(fileContent);

  for (const patient of patients) {
    const assessmentScores = buildInitialScores(patient);
    const burdenScore = calculateBurdenScore(assessmentScores);

    await pool.query(
      `
        INSERT INTO patients (
          bed_no,
          attending_doctor_primary,
          patient_name,
          gender,
          age,
          birth_date,
          admission_date,
          diagnosis,
          responsible_nurse,
          burden_score,
          assessment_scores,
          detail
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
        ON CONFLICT (bed_no) DO UPDATE SET
          attending_doctor_primary = EXCLUDED.attending_doctor_primary,
          patient_name = EXCLUDED.patient_name,
          gender = EXCLUDED.gender,
          age = EXCLUDED.age,
          birth_date = EXCLUDED.birth_date,
          admission_date = EXCLUDED.admission_date,
          diagnosis = EXCLUDED.diagnosis,
          responsible_nurse = COALESCE(patients.responsible_nurse, EXCLUDED.responsible_nurse),
          burden_score = CASE
            WHEN patients.assessment_scores = '{}'::jsonb
              OR jsonb_typeof(patients.assessment_scores -> 'ventilatorDemand') = 'number'
            THEN EXCLUDED.burden_score
            ELSE patients.burden_score
          END,
          assessment_scores = CASE
            WHEN patients.assessment_scores = '{}'::jsonb
              OR jsonb_typeof(patients.assessment_scores -> 'ventilatorDemand') = 'number'
            THEN EXCLUDED.assessment_scores
            ELSE patients.assessment_scores
          END,
          detail = EXCLUDED.detail;
      `,
      [
        normalizeText(patient["床號"]),
        normalizeText(patient["主治醫師"]),
        normalizeText(patient["病人姓名"]),
        normalizeText(patient["性別"]),
        Number(patient["年齡"]),
        normalizeDate(patient["出生日期"]),
        normalizeDate(patient["住院日期"]),
        getDiagnosis(patient),
        normalizeText(patient["負責護理師"]),
        burdenScore.toFixed(2),
        JSON.stringify(assessmentScores),
        JSON.stringify(patient)
      ]
    );
  }

  await pool.query("DELETE FROM patients WHERE bed_no <> ALL($1::text[]);", [
    patients.map((patient) => normalizeText(patient["床號"]))
  ]);
}

function patientListColumns() {
  return `
      id,
      bed_no AS "bedNo",
      attending_doctor_primary AS "attendingDoctorPrimary",
      patient_name AS "patientName",
      gender,
      age,
      TO_CHAR(birth_date, 'YYYY/MM/DD') AS "birthDate",
      TO_CHAR(admission_date, 'YYYY/MM/DD') AS "admissionDate",
      COALESCE(diagnosis, '') AS diagnosis,
      responsible_nurse AS "responsibleNurse",
      burden_score::float AS "burdenScore",
      assessment_scores AS "assessmentScores"
  `;
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/assessment-items", (req, res) => {
  res.json(assessmentItems);
});

app.get("/api/patients", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        ${patientListColumns()}
      FROM patients
      ORDER BY bed_no;
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/patients/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT
          ${patientListColumns()},
          detail
        FROM patients
        WHERE id = $1;
      `,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: "找不到病人資料" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/patients/:id/assessment", async (req, res, next) => {
  try {
    const scores = req.body.scores ?? {};
    const normalizedScores = Object.fromEntries(
      assessmentItems.map((item) => {
        if (item.type === "boolean") {
          return [item.key, Boolean(scores[item.key])];
        }

        if (item.type === "select") {
          return [item.key, Math.max(0, Math.min(5, Number(scores[item.key] ?? 0)))];
        }

        if (item.type === "multi") {
          const validValues = item.options.map((option) => option.value);
          const selectedValues = Array.isArray(scores[item.key]) ? scores[item.key] : [];
          return [item.key, selectedValues.filter((value) => validValues.includes(value))];
        }

        return [item.key, 0];
      })
    );
    const burdenScore = calculateBurdenScore(normalizedScores);

    const result = await pool.query(
      `
        UPDATE patients
        SET assessment_scores = $1::jsonb,
            burden_score = $2
        WHERE id = $3
        RETURNING id, assessment_scores AS "assessmentScores", burden_score::float AS "burdenScore";
      `,
      [JSON.stringify(normalizedScores), burdenScore.toFixed(2), req.params.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: "找不到病人資料" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/patients/:id/nurse", async (req, res, next) => {
  try {
    const responsibleNurse = normalizeText(req.body.responsibleNurse);

    if (!responsibleNurse) {
      res.status(400).json({ message: "請提供負責護理師" });
      return;
    }

    const result = await pool.query(
      `
        UPDATE patients
        SET responsible_nurse = $1
        WHERE id = $2
        RETURNING
          id,
          responsible_nurse AS "responsibleNurse";
      `,
      [responsibleNurse, req.params.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: "找不到病人資料" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "伺服器發生錯誤" });
});

async function startServer() {
  await ensureSchema();
  await seedPatientsFromJson();

  app.listen(port, () => {
    console.log(`API server running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
