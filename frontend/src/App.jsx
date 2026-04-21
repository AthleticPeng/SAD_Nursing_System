import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const nursingWorkspace = "急住醫令-護理_開放系統\\最近使用的作業";

const campusOptions = [
  "台大/兒醫",
  "淡水",
  "臺東",
  "新竹",
  "竹兒",
  "和聯",
  "長照",
  "西園",
  "清大"
];

const workspaceOptions = [
  "病例合併_開放系統\\醫事作業\\病歷管理系統作業",
  "門診病例修改_開放系統\\醫令作業\\資料補登",
  "住院醫令",
  nursingWorkspace
];

const functionButtons = [
  "醫囑與報告",
  "Check Order",
  "TPRsheet",
  "用藥資訊",
  "I/O sheet",
  "表單列印",
  "Kardex",
  "銳評",
  "排班建議"
];

function App() {
  const [campus, setCampus] = useState(campusOptions[0]);
  const [workspace, setWorkspace] = useState(workspaceOptions[0]);
  const [selectedNurse, setSelectedNurse] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [patients, setPatients] = useState([]);
  const [assessmentItems, setAssessmentItems] = useState([]);
  const [detailPatient, setDetailPatient] = useState(null);
  const [view, setView] = useState("home");
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const showNursingDashboard = workspace === nursingWorkspace;
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId);
  const nurseOptions = useMemo(
    () => [...new Set(patients.map((patient) => patient.responsibleNurse))].filter(Boolean).sort(),
    [patients]
  );

  async function loadPatients(signal) {
    setStatus("loading");
    setErrorMessage("");

    const response = await fetch(`${API_BASE_URL}/api/patients`, { signal });

    if (!response.ok) {
      throw new Error("病人資料讀取失敗");
    }

    const data = await response.json();
    setPatients(data);
    setStatus("success");
  }

  useEffect(() => {
    if (!showNursingDashboard) {
      setSelectedPatientId(null);
      setView("home");
      return;
    }

    const controller = new AbortController();

    async function loadDashboard() {
      try {
        const [itemsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/assessment-items`, { signal: controller.signal }),
          loadPatients(controller.signal)
        ]);

        if (!itemsResponse.ok) {
          throw new Error("量表項目讀取失敗");
        }

        setAssessmentItems(await itemsResponse.json());
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        setStatus("error");
        setErrorMessage(error.message);
      }
    }

    loadDashboard();

    return () => {
      controller.abort();
    };
  }, [showNursingDashboard]);

  useEffect(() => {
    if (!selectedNurse && nurseOptions.length > 0) {
      setSelectedNurse(nurseOptions[0]);
    }
  }, [nurseOptions, selectedNurse]);

  async function openAssessment() {
    if (!selectedPatient || selectedPatient.responsibleNurse !== selectedNurse) {
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/patients/${selectedPatient.id}`);

      if (!response.ok) {
        throw new Error("病人詳細資料讀取失敗");
      }

      setDetailPatient(await response.json());
      setView("assessment");
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error.message);
    }
  }

  async function saveAssessment(patientId, scores) {
    const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}/assessment`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ scores })
    });

    if (!response.ok) {
      throw new Error("銳評儲存失敗");
    }

    const updatedAssessment = await response.json();
    setDetailPatient((patient) => ({
      ...patient,
      assessmentScores: updatedAssessment.assessmentScores,
      burdenScore: updatedAssessment.burdenScore
    }));
    setPatients((currentPatients) =>
      currentPatients.map((patient) =>
        patient.id === patientId ? { ...patient, burdenScore: updatedAssessment.burdenScore } : patient
      )
    );
  }

  if (view === "assessment" && detailPatient) {
    return (
      <AssessmentPage
        patient={detailPatient}
        assessmentItems={assessmentItems}
        onBack={() => setView("home")}
        onSave={saveAssessment}
      />
    );
  }

  return (
    <main>
      <section className="home" aria-labelledby="campus-title">
        <div>
          <h1 id="campus-title">照護系統</h1>
          <p className="hint">請選擇目前所在院區。</p>
        </div>

        <div className="campus-field">
          <label htmlFor="campus">院區</label>
          <select id="campus" name="campus" value={campus} onChange={(event) => setCampus(event.target.value)}>
            {campusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="workspace">
          <label htmlFor="workspace">作業區</label>
          <select
            id="workspace"
            name="workspace"
            value={workspace}
            onChange={(event) => setWorkspace(event.target.value)}
          >
            {workspaceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </section>

      {showNursingDashboard && (
        <section className="patient-section" aria-label="急住醫令護理功能">
          <div className="nurse-field">
            <label htmlFor="nurse">使用者護理師</label>
            <select id="nurse" value={selectedNurse} onChange={(event) => setSelectedNurse(event.target.value)}>
              {nurseOptions.map((nurse) => (
                <option key={nurse} value={nurse}>
                  {nurse}
                </option>
              ))}
            </select>
          </div>

          <FunctionButtons
            selectedPatient={selectedPatient}
            selectedNurse={selectedNurse}
            onAssessmentClick={openAssessment}
          />

          <PatientTable
            patients={patients}
            selectedNurse={selectedNurse}
            selectedPatientId={selectedPatientId}
            onSelectPatient={setSelectedPatientId}
            status={status}
            errorMessage={errorMessage}
          />
        </section>
      )}
    </main>
  );
}

function FunctionButtons({ selectedPatient, selectedNurse, onAssessmentClick }) {
  const canOpenAssessment = selectedPatient && selectedPatient.responsibleNurse === selectedNurse;

  return (
    <div className="function-panel">
      {functionButtons.map((label) => {
        const isAssessmentButton = label === "銳評";

        return (
          <button
            className="function-button"
            type="button"
            key={label}
            onClick={isAssessmentButton ? onAssessmentClick : undefined}
            disabled={isAssessmentButton && !canOpenAssessment}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function PatientTable({ patients, selectedNurse, selectedPatientId, onSelectPatient, status, errorMessage }) {
  if (status === "loading" && patients.length === 0) {
    return <p className="message">資料載入中...</p>;
  }

  if (status === "error") {
    return <p className="message error">{errorMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>床號</th>
            <th>主治醫師一師</th>
            <th>病人姓名</th>
            <th>性別</th>
            <th>年齡</th>
            <th>出生日期</th>
            <th>住院日期</th>
            <th>診斷</th>
            <th>負責護理師</th>
            <th>麻煩度評分</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => {
            const isOwned = patient.responsibleNurse === selectedNurse;
            const isSelected = patient.id === selectedPatientId;

            return (
              <tr
                className={`${isOwned ? "clickable-row" : "locked-row"} ${isSelected ? "selected-row" : ""}`}
                key={patient.id}
                onClick={() => {
                  if (isOwned) {
                    onSelectPatient(patient.id);
                  }
                }}
              >
                <td>{patient.bedNo}</td>
                <td>{patient.attendingDoctorPrimary}</td>
                <td>{patient.patientName}</td>
                <td>{patient.gender}</td>
                <td>{patient.age}</td>
                <td>{patient.birthDate}</td>
                <td>{patient.admissionDate}</td>
                <td className="diagnosis-cell">{patient.diagnosis}</td>
                <td>{patient.responsibleNurse}</td>
                <td>{formatScore(patient.burdenScore)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AssessmentPage({ patient, assessmentItems, onBack, onSave }) {
  const [scores, setScores] = useState(patient.assessmentScores ?? {});
  const [saveStatus, setSaveStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const burdenScore = calculateWeightedScore(scores, assessmentItems);

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSaveStatus("saving");
      setMessage("");
      await onSave(patient.id, scores);
      setSaveStatus("success");
      setMessage("銳評已儲存，首頁麻煩度評分已更新。");
    } catch (error) {
      setSaveStatus("error");
      setMessage(error.message);
    }
  }

  return (
    <main>
      <section className="detail-header">
        <button className="secondary-button" type="button" onClick={onBack}>
          返回首頁
        </button>
        <div>
          <h1>銳評</h1>
          <p className="hint">
            {patient.bedNo} / {patient.patientName} / 負責護理師 {patient.responsibleNurse}
          </p>
        </div>
      </section>

      <section className="detail-grid" aria-label="病人詳細資訊">
        {Object.entries(patient.detail ?? {}).map(([key, value]) => (
          <div className="detail-item" key={key}>
            <span>{key.trim()}</span>
            <strong>{formatDetailValue(value)}</strong>
          </div>
        ))}
      </section>

      <form className="assessment-form" onSubmit={handleSubmit}>
        <div className="assessment-title">
          <h2>麻煩度量表</h2>
          <p>每項請填 0-5 分，系統會依原始配分加權計算總分。</p>
          <strong>目前加權總分：{formatScore(burdenScore)}</strong>
        </div>

        <div className="assessment-list">
          {assessmentItems.map((item) => (
            <label className="score-row" key={item.key}>
              <span>
                {item.label}
                <small>權重 {item.weight}</small>
              </span>
              <input
                type="range"
                min="0"
                max="5"
                step="1"
                value={scores[item.key] ?? 0}
                onChange={(event) =>
                  setScores((currentScores) => ({
                    ...currentScores,
                    [item.key]: Number(event.target.value)
                  }))
                }
              />
              <output>{scores[item.key] ?? 0}</output>
            </label>
          ))}
        </div>

        <div className="form-actions">
          <button className="function-button" type="submit" disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? "儲存中..." : "儲存銳評"}
          </button>
          {message && <p className={`message ${saveStatus === "error" ? "error" : ""}`}>{message}</p>}
        </div>
      </form>
    </main>
  );
}

function calculateWeightedScore(scores, assessmentItems) {
  return assessmentItems.reduce((total, item) => {
    const score = Number(scores[item.key] ?? 0);
    return total + (Math.max(0, Math.min(5, score)) / 5) * item.weight;
  }, 0);
}

function formatScore(score) {
  return Number(score ?? 0).toFixed(1);
}

function formatDetailValue(value) {
  if (Array.isArray(value)) {
    return value.join("、");
  }

  if (value === null || value === undefined || String(value).trim() === "") {
    return "-";
  }

  return String(value);
}

export default App;
