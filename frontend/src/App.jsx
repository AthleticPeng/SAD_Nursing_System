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
const MAX_BURDEN_SCORE = 225;
const duplicatedDetailKeys = new Set([
  "床號",
  "主治醫師",
  "病人姓名",
  "性別",
  "年齡",
  "出生日期",
  "住院日期",
  "診斷",
  "負責護理師"
]);

function App() {
  const [campus, setCampus] = useState(campusOptions[0]);
  const [workspace, setWorkspace] = useState(workspaceOptions[0]);
  const [selectedNurse, setSelectedNurse] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [patients, setPatients] = useState([]);
  const [assessmentItems, setAssessmentItems] = useState([]);
  const [detailPatient, setDetailPatient] = useState(null);
  const [view, setView] = useState("home");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [healthStatus, setHealthStatus] = useState("idle");
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const isNursingWorkspace = workspace === nursingWorkspace;
  const showNursingDashboard = isLoggedIn && isNursingWorkspace;
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
    if (!isNursingWorkspace) {
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
  }, [isNursingWorkspace]);

  useEffect(() => {
    if (!isLoggedIn) {
      setHealthStatus("idle");
      return;
    }

    let isMounted = true;
    setHealthStatus("checking");

    fetch(`${API_BASE_URL}/api/health`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("health check failed");
        }
        return response.json();
      })
      .then((data) => {
        if (!isMounted) {
          return;
        }
        setHealthStatus(data.status === "ok" ? "ok" : "error");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setHealthStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [isLoggedIn]);

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

  function openScheduling() {
    setView("scheduling");
  }

  function enterWorkspace() {
    if (!selectedNurse) {
      return;
    }

    setIsLoggedIn(true);
    setView("home");
  }

  function signOut() {
    setIsLoggedIn(false);
    setView("home");
    setSelectedPatientId(null);
    setDetailPatient(null);
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
        patient.id === patientId
          ? {
              ...patient,
              assessmentScores: updatedAssessment.assessmentScores,
              burdenScore: updatedAssessment.burdenScore
            }
          : patient
      )
    );
  }

  async function saveNurseAssignment(patientId, responsibleNurse) {
    const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}/nurse`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ responsibleNurse })
    });

    if (!response.ok) {
      throw new Error("排班調整儲存失敗");
    }

    const updatedPatient = await response.json();
    setPatients((currentPatients) =>
      currentPatients.map((patient) =>
        patient.id === patientId ? { ...patient, responsibleNurse: updatedPatient.responsibleNurse } : patient
      )
    );

    if (selectedPatientId === patientId) {
      setSelectedNurse(updatedPatient.responsibleNurse);
    }
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

  if (view === "scheduling") {
    return (
      <SchedulingPage
        patients={patients}
        selectedPatientId={selectedPatientId}
        nurseOptions={nurseOptions}
        onBack={() => setView("home")}
        onSave={saveNurseAssignment}
      />
    );
  }

  return (
    <main>
      {!isLoggedIn ? (
        <section className="home-layout" aria-labelledby="campus-title">
          <div className="home-main">
            <h1 id="campus-title">照護系統</h1>
            <p className="hint">請先登入院區環境與使用者，再進入病人工作台。</p>
            <div className="home-tags" aria-label="系統狀態">
              <span>病人導向工作台</span>
              <span>銳評與排班整合</span>
            </div>

            <div className="home-side" aria-label="環境登入">
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

              <div className="nurse-field">
                <label htmlFor="nurse">使用者</label>
                <input
                  id="nurse"
                  list="nurse-options"
                  value={selectedNurse}
                  onChange={(event) => setSelectedNurse(event.target.value)}
                  placeholder="輸入或選擇護理師名稱"
                />
                <datalist id="nurse-options">
                  {nurseOptions.map((nurse) => (
                    <option key={nurse} value={nurse} />
                  ))}
                </datalist>
              </div>

              <button className="primary-login-button" type="button" onClick={enterWorkspace} disabled={!selectedNurse}>
                進入病人工作台
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="workspace-header" aria-label="工作區資訊">
            <div className="workspace-title">
              <h2>病人工作台</h2>
              <p>目前病人清單與照護作業</p>
            </div>
            <HealthBadge status={healthStatus} />
            <div className="workspace-meta">
              <span>{campus}</span>
              <span>{workspace}</span>
              <span>使用者 {selectedNurse}</span>
            </div>
            <button className="secondary-button" type="button" onClick={signOut}>
              切換登入資訊
            </button>
          </section>

          {!isNursingWorkspace && (
            <p className="message">目前作業區尚未啟用病人工作台，請返回切換至急住醫令護理作業。</p>
          )}

          {showNursingDashboard && (
        <section className="patient-section" aria-label="急住醫令護理功能">
          <PatientTable
            patients={patients}
            assessmentItems={assessmentItems}
            selectedNurse={selectedNurse}
            selectedPatientId={selectedPatientId}
            onSelectPatient={setSelectedPatientId}
            status={status}
            errorMessage={errorMessage}
          />

          <FunctionButtons
            selectedPatient={selectedPatient}
            selectedNurse={selectedNurse}
            onAssessmentClick={openAssessment}
            onSchedulingClick={openScheduling}
          />
        </section>
          )}
        </>
      )}
    </main>
  );
}

function FunctionButtons({ selectedPatient, selectedNurse, onAssessmentClick, onSchedulingClick }) {
  const canOpenAssessment = selectedPatient && selectedPatient.responsibleNurse === selectedNurse;

  return (
    <div className="function-panel">
      {functionButtons.map((label) => {
        const isAssessmentButton = label === "銳評";
        const isSchedulingButton = label === "排班建議";

        return (
          <button
            className="function-button"
            type="button"
            key={label}
            onClick={isAssessmentButton ? onAssessmentClick : isSchedulingButton ? onSchedulingClick : undefined}
            disabled={isAssessmentButton && !canOpenAssessment}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function HealthBadge({ status }) {
  const statusMap = {
    idle: { label: "API 未檢查", level: "idle" },
    checking: { label: "API 檢查中", level: "checking" },
    ok: { label: "API 正常", level: "ok" },
    error: { label: "API 異常", level: "error" }
  };
  const currentStatus = statusMap[status] ?? statusMap.idle;

  return (
    <div className={`health-badge ${currentStatus.level}`} aria-live="polite">
      <span />
      <b>{currentStatus.label}</b>
    </div>
  );
}

function PatientTable({
  patients,
  assessmentItems,
  selectedNurse,
  selectedPatientId,
  onSelectPatient,
  status,
  errorMessage
}) {
  const [tooltip, setTooltip] = useState(null);

  if (status === "loading" && patients.length === 0) {
    return <p className="message">資料載入中...</p>;
  }

  if (status === "error") {
    return <p className="message error">{errorMessage}</p>;
  }

  const maxBurdenScore = MAX_BURDEN_SCORE;

  return (
    <div className="table-wrap">
      <table className="patient-main-table">
        <colgroup>
          <col style={{ width: "8%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "24%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "9%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>床號</th>
            <th>主治醫師</th>
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
            const scoredItems = getScoredAssessmentItems(patient.assessmentScores ?? {}, assessmentItems);

            return (
              <tr
                className={`${isOwned ? "clickable-row" : "locked-row"} ${isSelected ? "selected-row" : ""}`}
                key={patient.id}
                onMouseEnter={(event) => {
                  setTooltip({
                    patient,
                    scoredItems,
                    x: event.clientX,
                    y: event.clientY
                  });
                }}
                onMouseMove={(event) => {
                  setTooltip((currentTooltip) =>
                    currentTooltip
                      ? {
                          ...currentTooltip,
                          x: event.clientX,
                          y: event.clientY
                        }
                      : null
                  );
                }}
                onMouseLeave={() => setTooltip(null)}
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
                <td>{formatNormalizedScore(patient.burdenScore, maxBurdenScore)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {tooltip && (
        <div className="patient-tooltip" style={getTooltipStyle(tooltip.x, tooltip.y)}>
          <strong>
            {tooltip.patient.bedNo} / {tooltip.patient.patientName}
          </strong>
          {tooltip.scoredItems.length > 0 ? (
            <ul>
              {tooltip.scoredItems.map((item) => (
                <li key={item.key}>
                  <span>{item.label}</span>
                  <b>{item.valueLabel}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>目前沒有被打分數的銳評項目。</p>
          )}
        </div>
      )}
    </div>
  );
}

function SchedulingPage({ patients, selectedPatientId, nurseOptions, onBack, onSave }) {
  const [assignments, setAssignments] = useState(
    Object.fromEntries(patients.map((patient) => [patient.id, patient.responsibleNurse]))
  );
  const [savingPatientId, setSavingPatientId] = useState(null);
  const [message, setMessage] = useState("");
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId);
  const maxBurdenScore = MAX_BURDEN_SCORE;
  const sortedPatients = [...patients].sort((first, second) => {
    if (first.id === selectedPatientId) {
      return -1;
    }

    if (second.id === selectedPatientId) {
      return 1;
    }

    return second.burdenScore - first.burdenScore;
  });

  async function handleSave(patientId) {
    try {
      setSavingPatientId(patientId);
      setMessage("");
      await onSave(patientId, assignments[patientId]);
      setMessage("排班調整已儲存。");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingPatientId(null);
    }
  }

  return (
    <main>
      <section className="detail-header">
        <button className="secondary-button" type="button" onClick={onBack}>
          返回首頁
        </button>
        <div>
          <h1>排班建議</h1>
          <p className="hint">
            {selectedPatient
              ? `目前選取 ${selectedPatient.bedNo} / ${selectedPatient.patientName}，可手動調整負責護理師。`
              : "可依麻煩度與護理師負擔，手動調整每位病人的負責護理師。"}
          </p>
        </div>
      </section>

      <section className="schedule-summary" aria-label="排班摘要">
        {nurseOptions.map((nurse) => {
          const nursePatients = patients.filter((patient) => assignments[patient.id] === nurse);
          const averageBurdenScore =
            nursePatients.length > 0
              ? nursePatients.reduce((total, patient) => total + normalizeScore(patient.burdenScore, maxBurdenScore), 0) /
                nursePatients.length
              : 0;

          return (
            <div className="dashboard-card" key={nurse}>
              <span>護理師 {nurse}</span>
              <strong>{nursePatients.length} 位病人</strong>
              <p>平均麻煩度 {formatScore(averageBurdenScore)}</p>
            </div>
          );
        })}
      </section>

      <div className="table-wrap">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>床號</th>
              <th>病人姓名</th>
              <th>性別</th>
              <th>主治醫師</th>
              <th>診斷</th>
              <th>年齡</th>
              <th>護理師</th>
              <th>麻煩度分數</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedPatients.map((patient) => {
              const hasChanged = assignments[patient.id] !== patient.responsibleNurse;

              return (
                <tr className={patient.id === selectedPatientId ? "selected-row" : ""} key={patient.id}>
                  <td>{patient.bedNo}</td>
                  <td>{patient.patientName}</td>
                  <td>{patient.gender}</td>
                  <td>{patient.attendingDoctorPrimary}</td>
                  <td className="diagnosis-cell">{patient.diagnosis}</td>
                  <td>{patient.age}</td>
                  <td>
                    <select
                      className="inline-select"
                      value={assignments[patient.id]}
                      onChange={(event) =>
                        setAssignments((currentAssignments) => ({
                          ...currentAssignments,
                          [patient.id]: event.target.value
                        }))
                      }
                    >
                      {nurseOptions.map((nurse) => (
                        <option key={nurse} value={nurse}>
                          {nurse}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{formatNormalizedScore(patient.burdenScore, maxBurdenScore)}</td>
                  <td>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!hasChanged || savingPatientId === patient.id}
                      onClick={() => handleSave(patient.id)}
                    >
                      {savingPatientId === patient.id ? "儲存中" : "儲存"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {message && <p className="message schedule-message">{message}</p>}
    </main>
  );
}

function AssessmentPage({ patient, assessmentItems, onBack, onSave }) {
  const [scores, setScores] = useState(patient.assessmentScores ?? {});
  const [saveStatus, setSaveStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const burdenScore = calculateWeightedScore(scores, assessmentItems);
  const maxBurdenScore = getMaxBurdenScore(assessmentItems) || MAX_BURDEN_SCORE;
  const normalizedBurdenScore = normalizeScore(burdenScore, maxBurdenScore);
  const riskLevel = getRiskLevel(burdenScore, maxBurdenScore);
  const topAssessmentItems = getTopAssessmentItems(scores, assessmentItems);
  const hiddenDetailKeys = new Set([
    ...duplicatedDetailKeys,
    ...assessmentItems.map((item) => item.sourceKey?.trim()).filter(Boolean)
  ]);
  const filteredDetailEntries = Object.entries(patient.detail ?? {}).filter(([key]) => {
    return !hiddenDetailKeys.has(key.trim());
  });

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSaveStatus("saving");
      setMessage("");
      await onSave(patient.id, scores);
      onBack();
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

      <section className="assessment-dashboard" aria-label="銳評儀表板">
        <div className="dashboard-card score-card">
          <span>即時麻煩度</span>
          <strong>{formatScore(normalizedBurdenScore)}</strong>
          <p>{riskLevel.label}</p>
          <div className="score-meter" aria-hidden="true">
            <span style={{ width: `${normalizedBurdenScore}%` }} />
          </div>
        </div>

        <div className="dashboard-card">
          <span>病人資訊</span>
          <strong>
            {patient.bedNo} / {patient.patientName}
          </strong>
          <p>
            {patient.gender}，{patient.age} 歲，{patient.attendingDoctorPrimary} 醫師
          </p>
        </div>

        <div className="dashboard-card">
          <span>照護資訊</span>
          <strong>護理師 {patient.responsibleNurse}</strong>
          <p>住院日期 {patient.admissionDate}</p>
        </div>

        <div className="dashboard-card diagnosis-card">
          <span>診斷</span>
          <strong>{patient.diagnosis || "-"}</strong>
        </div>
      </section>

      <section className="dashboard-section" aria-label="同步評分摘要">
        <div className="summary-panel">
          <h2>主要負擔來源</h2>
          {topAssessmentItems.length === 0 ? (
            <p className="hint">目前尚未有明顯負擔項目。</p>
          ) : (
            <div className="burden-list">
              {topAssessmentItems.map((item) => (
                <div className="burden-item" key={item.key}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.valueLabel}</span>
                  </div>
                  <b>{formatScore(item.weightedScore)}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="summary-panel">
          <h2>當班資訊</h2>
          <div className="quick-list">
            <div>
              <span>藥物</span>
              <strong>{formatDetailValue(patient.detail?.["當班使用藥物清單"])}</strong>
            </div>
            <div>
              <span>檢查</span>
              <strong>{formatDetailValue(patient.detail?.["當班開立檢查清單"])}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="detail-grid compact-details" aria-label="完整詳細資訊">
        {filteredDetailEntries.map(([key, value]) => (
          <div className="detail-item" key={key}>
            <span>{key.trim()}</span>
            <strong>{formatDetailValue(value)}</strong>
          </div>
        ))}
      </section>

      <form className="assessment-form" onSubmit={handleSubmit}>
        <div className="assessment-title">
          <h2>麻煩度量表</h2>
          <p>依題目型態勾選或選擇，系統會依原始配分計算加權總分。</p>
          <strong>目前麻煩度：{formatScore(normalizedBurdenScore)}</strong>
        </div>

        <div className="assessment-list">
          {assessmentItems.map((item) => (
            <div className={`score-row ${item.type === "multi" ? "score-row-multi" : ""}`} key={item.key}>
              <div>
                {item.label}
                <small>{getItemHint(item)}</small>
              </div>
              <AssessmentControl
                item={item}
                value={scores[item.key]}
                onChange={(value) =>
                  setScores((currentScores) => ({
                    ...currentScores,
                    [item.key]: value
                  }))
                }
              />
              <output>{formatScore(calculateItemScore(item, scores[item.key]))}</output>
            </div>
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
  return assessmentItems.reduce((total, item) => total + calculateItemScore(item, scores[item.key]), 0);
}

function calculateItemScore(item, value) {
  if (item.type === "boolean") {
    return value ? item.weight : 0;
  }

  if (item.type === "select") {
    return Math.min(item.weight, Number(value ?? 0) * item.pointsPerUnit);
  }

  if (item.type === "multi") {
    const selectedValues = Array.isArray(value) ? value : [];
    return item.options
      .filter((option) => selectedValues.includes(option.value))
      .reduce((total, option) => total + option.weight, 0);
  }

  return 0;
}

function getMaxBurdenScore(assessmentItems) {
  return assessmentItems.reduce((total, item) => {
    if (item.type === "multi") {
      return total + item.options.reduce((sum, option) => sum + option.weight, 0);
    }

    return total + item.weight;
  }, 0);
}

function getTopAssessmentItems(scores, assessmentItems) {
  return assessmentItems
    .map((item) => {
      return {
        ...item,
        valueLabel: formatAssessmentValue(item, scores[item.key]),
        weightedScore: calculateItemScore(item, scores[item.key])
      };
    })
    .filter((item) => item.weightedScore > 0)
    .sort((first, second) => second.weightedScore - first.weightedScore)
    .slice(0, 3);
}

function getRiskLevel(score, maxScore) {
  const ratio = maxScore > 0 ? score / maxScore : 0;

  if (ratio >= 0.6) {
    return { label: "高負擔" };
  }

  if (ratio >= 0.3) {
    return { label: "中負擔" };
  }

  return { label: "低負擔" };
}

function AssessmentControl({ item, value, onChange }) {
  if (item.type === "boolean") {
    return (
      <div className="segmented-control">
        <button className={value ? "is-active" : ""} type="button" onClick={() => onChange(true)}>
          是
        </button>
        <button className={!value ? "is-active" : ""} type="button" onClick={() => onChange(false)}>
          否
        </button>
      </div>
    );
  }

  if (item.type === "select") {
    return (
      <select className="inline-select" value={value ?? 0} onChange={(event) => onChange(Number(event.target.value))}>
        {item.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (item.type === "multi") {
    const selectedValues = Array.isArray(value) ? value : [];

    return (
      <div className="checkbox-grid">
        {item.options.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={selectedValues.includes(option.value)}
              onChange={(event) => {
                if (event.target.checked) {
                  onChange([...selectedValues, option.value]);
                  return;
                }

                onChange(selectedValues.filter((selectedValue) => selectedValue !== option.value));
              }}
            />
            <span>
              {option.label}
              <small>+{option.weight}</small>
            </span>
          </label>
        ))}
      </div>
    );
  }

  return null;
}

function getItemHint(item) {
  if (item.type === "boolean") {
    return `是 = +${item.weight} 分`;
  }

  if (item.type === "select") {
    return `每項 +${item.pointsPerUnit} 分，最多 +${item.weight} 分`;
  }

  if (item.type === "multi") {
    return "可複選，依選項加總";
  }

  return "";
}

function formatAssessmentValue(item, value) {
  if (item.type === "boolean") {
    return value ? `是，+${item.weight} 分` : "否";
  }

  if (item.type === "select") {
    const option = item.options.find((currentOption) => Number(currentOption.value) === Number(value ?? 0));
    return option ? option.label : "0 項";
  }

  if (item.type === "multi") {
    const selectedValues = Array.isArray(value) ? value : [];
    const labels = item.options
      .filter((option) => selectedValues.includes(option.value))
      .map((option) => option.label);

    return labels.length > 0 ? labels.join("、") : "未選擇";
  }

  return "";
}

function getScoredAssessmentItems(scores, assessmentItems) {
  return assessmentItems
    .map((item) => ({
      ...item,
      valueLabel: formatAssessmentValue(item, scores[item.key]),
      weightedScore: calculateItemScore(item, scores[item.key])
    }))
    .filter((item) => item.weightedScore > 0);
}

function getTooltipStyle(x, y) {
  const tooltipWidth = 360;
  const tooltipHeight = 420;
  const gap = 16;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  return {
    left: Math.max(gap, Math.min(x + gap, viewportWidth - tooltipWidth - gap)),
    top: Math.max(gap, Math.min(y + gap, viewportHeight - tooltipHeight - gap))
  };
}

function formatScore(score) {
  return Number(score ?? 0).toFixed(1);
}

function normalizeScore(score, maxScore) {
  if (!maxScore || maxScore <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (Number(score ?? 0) / maxScore) * 100));
}

function formatNormalizedScore(score, maxScore) {
  return formatScore(normalizeScore(score, maxScore));
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
