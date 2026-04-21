DROP TABLE IF EXISTS patients;

CREATE TABLE patients (
  id SERIAL PRIMARY KEY,
  bed_no VARCHAR(20) NOT NULL UNIQUE,
  attending_doctor_primary VARCHAR(50) NOT NULL,
  patient_name VARCHAR(50) NOT NULL,
  gender VARCHAR(10) NOT NULL,
  age INTEGER NOT NULL,
  birth_date DATE NOT NULL,
  admission_date DATE NOT NULL,
  diagnosis TEXT,
  responsible_nurse VARCHAR(20) NOT NULL,
  burden_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
  assessment_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO patients (
  bed_no,
  attending_doctor_primary,
  patient_name,
  gender,
  age,
  birth_date,
  admission_date,
  diagnosis,
  responsible_nurse
) VALUES
  ('MI-01', '彭OO', '林OO', '男', 88, '1937-05-25', '2026-04-16', 'Septic shock with multi-organ failure', 'A'),
  ('MI-02', '彭OO', '王OO', '男', 84, '1941-05-02', '2026-04-16', 'Acute myocardial infarction (AMI) status post percutaneous coronary intervention (PCI), stable', 'A'),
  ('MI-03', '彭OO', '李OO', '男', 87, '1938-11-20', '2026-03-17', NULL, 'B'),
  ('MI-04', '彭OO', '黃OO', '女', 74, '1951-10-01', '2026-03-26', NULL, 'B'),
  ('MI-05', '彭OO', '江OO', '男', 76, '1949-05-25', '2026-04-16', NULL, 'C'),
  ('MI-06', '胡OO', '楊OO', '女', 47, '1979-01-08', '2026-03-06', NULL, 'C'),
  ('MI-07', '胡OO', '陳OO', '男', 76, '1950-02-21', '2026-02-07', NULL, 'D'),
  ('MI-08', '胡OO', '王OO', '女', 62, '1964-03-31', '2026-03-23', NULL, 'D'),
  ('MI-09', '胡OO', '張OO', '女', 93, '1932-04-24', '2026-03-10', NULL, 'E'),
  ('MI-10', '胡OO', '鍾OO', '男', 70, '1955-10-17', '2026-04-07', NULL, 'E'),
  ('MI-11', '胡OO', '張OO', '男', 74, '1952-04-20', '2026-04-13', NULL, 'F'),
  ('MI-12', '李OO', '童OO', '女', 84, '1941-08-26', '2026-04-01', NULL, 'F'),
  ('MI-13', '李OO', '林OO', '男', 82, '1944-01-06', '2026-04-03', NULL, 'G'),
  ('MI-14', '李OO', '宋OO', '女', 71, '1955-01-23', '2026-03-04', NULL, 'G'),
  ('MI-15', '李OO', '馬OO', '男', 52, '1974-03-08', '2026-04-11', NULL, 'H'),
  ('MI-16', '李OO', '吳OO', '男', 79, '1947-03-18', '2026-04-03', NULL, 'H'),
  ('MI-17', '李OO', '林OO', '女', 95, '1930-10-21', '2026-04-02', NULL, 'I');
