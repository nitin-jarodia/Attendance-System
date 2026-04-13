const analyticsDateInput = document.getElementById("analytics-date");
const analyticsClassSelect = document.getElementById("analytics-class");
const analyticsThresholdInput = document.getElementById("analytics-threshold");
const analyticsRefreshButton = document.getElementById("analytics-refresh-button");
const analyticsVoiceButton = document.getElementById("analytics-voice-button");
const analyticsVoiceFeedback = document.getElementById("analytics-voice-feedback");
const analyticsStudentSelect = document.getElementById("analytics-student");
const analyticsTrendClassLabel = document.getElementById("analytics-trend-class-label");

const analyticsSummaryPercentage = document.getElementById("analytics-summary-percentage");
const analyticsSummaryStatus = document.getElementById("analytics-summary-status");
const analyticsSummaryLow = document.getElementById("analytics-summary-low");
const analyticsSummaryFrequent = document.getElementById("analytics-summary-frequent");
const analyticsAiSummary = document.getElementById("analytics-ai-summary");
const analyticsAiMeta = document.getElementById("analytics-ai-meta");
const studentInsightMetrics = document.getElementById("student-insight-metrics");
const studentInsightText = document.getElementById("student-insight-text");
const classInsightMetrics = document.getElementById("class-insight-metrics");
const classInsightText = document.getElementById("class-insight-text");
const classLowAttendanceList = document.getElementById("class-low-attendance-list");
const predictionsBody = document.getElementById("predictions-body");

let currentUser = null;
let availableClasses = [];
let availableStudents = [];
let attendanceTrendChart = null;
let classComparisonChart = null;
let realtimeSocket = null;

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function renderClassOptions(classes) {
  analyticsClassSelect.innerHTML = `
    <option value="">All classes</option>
    ${classes
      .map((classroom) => `<option value="${classroom.id}">${window.appUi.escapeHtml(classroom.name)}</option>`)
      .join("")}
  `;

  const requestedClassId = getQueryParam("class_id");
  const requestedClassName = (getQueryParam("class") || "").trim().toLowerCase();
  if (requestedClassId) {
    analyticsClassSelect.value = requestedClassId;
  } else if (requestedClassName) {
    const matchedClass = classes.find((item) => item.name.toLowerCase() === requestedClassName);
    if (matchedClass) {
      analyticsClassSelect.value = String(matchedClass.id);
    }
  }

  if (currentUser?.role === "teacher" && currentUser?.assigned_class_id) {
    analyticsClassSelect.value = String(currentUser.assigned_class_id);
    analyticsClassSelect.disabled = true;
  }
}

async function loadStudentOptions() {
  const classId = analyticsClassSelect.value || undefined;
  availableStudents = await window.apiClient.getStudents({ class_id: classId });
  analyticsStudentSelect.innerHTML = availableStudents.length
    ? availableStudents
        .map(
          (student) => `
            <option value="${student.roll_number}">
              ${window.appUi.escapeHtml(student.name)} (${student.roll_number})
            </option>
          `
        )
        .join("")
    : `<option value="">No students available</option>`;
}

function resolveTrendClassId(classAnalytics) {
  if (analyticsClassSelect.value) {
    return Number(analyticsClassSelect.value);
  }

  if (currentUser?.role === "teacher" && currentUser?.assigned_class_id) {
    return Number(currentUser.assigned_class_id);
  }

  return classAnalytics.items[0]?.class_id || null;
}

function renderSummary(summary) {
  analyticsSummaryPercentage.textContent = `${summary.attendance_percentage}%`;
  analyticsSummaryStatus.textContent = `${summary.present_count} / ${summary.absent_count} / ${summary.late_count}`;
  analyticsSummaryLow.textContent = summary.low_attendance_students;
  analyticsSummaryFrequent.textContent = summary.frequently_absent_students;
  analyticsAiSummary.textContent = summary.ai_summary;
  analyticsAiMeta.textContent = summary.used_fallback
    ? "Using fallback summary because Groq is unavailable or not configured."
    : "AI summary generated with Groq.";
}

function renderMetrics(container, metrics) {
  container.innerHTML = metrics
    .map(
      (metric) => `
        <div class="metric-card">
          <span>${window.appUi.escapeHtml(metric.label)}</span>
          <strong>${window.appUi.escapeHtml(metric.value)}</strong>
        </div>
      `
    )
    .join("");
  window.appUi.animateContentIn(container);
}

function renderStudentInsight(insight) {
  renderMetrics(studentInsightMetrics, [
    { label: "Attendance %", value: `${insight.attendance_percentage}%` },
    { label: "Present", value: insight.present_count },
    { label: "Absent", value: insight.absent_count },
    { label: "Late", value: insight.late_count },
  ]);
  studentInsightText.textContent = insight.ai_insight;
}

function renderClassInsight(insight) {
  analyticsTrendClassLabel.textContent = insight.class_name;
  renderMetrics(classInsightMetrics, [
    { label: "Total students", value: insight.total_students },
    { label: "Attendance %", value: `${insight.attendance_percentage}%` },
    { label: "Present", value: insight.present_count },
    { label: "Absent", value: insight.absent_count },
  ]);
  classInsightText.textContent = insight.ai_insight;

  if (!insight.low_attendance_students.length) {
    classLowAttendanceList.innerHTML = `<div class="empty-state">No low-attendance students in this class right now.</div>`;
    window.appUi.animateContentIn(classLowAttendanceList);
    return;
  }

  classLowAttendanceList.innerHTML = insight.low_attendance_students
    .map(
      (student) => `
        <div class="list-card">
          <strong>${window.appUi.escapeHtml(student.name)}</strong>
          <span>${student.roll_number} · ${student.attendance_percentage}% attendance</span>
        </div>
      `
    )
    .join("");
  window.appUi.animateContentIn(classLowAttendanceList);
}

function renderPredictions(predictions) {
  if (!predictions.items.length) {
    predictionsBody.innerHTML = `
      <tr>
        <td colspan="7"><div class="empty-state">No at-risk students found for the current filters.</div></td>
      </tr>
    `;
    window.appUi.animateContentIn(predictionsBody);
    return;
  }

  predictionsBody.innerHTML = predictions.items
    .map(
      (item) => `
        <tr>
          <td>${item.roll_number}</td>
          <td>${window.appUi.escapeHtml(item.name)}</td>
          <td>${window.appUi.escapeHtml(item.class_name || "Unassigned")}</td>
          <td>${item.attendance_percentage}%</td>
          <td>${item.recent_attendance_percentage}%</td>
          <td><span class="pill ${item.risk_level}">${window.appUi.escapeHtml(item.risk_level)}</span></td>
          <td>${window.appUi.escapeHtml(item.explanation)}</td>
        </tr>
      `
    )
    .join("");
  window.appUi.animateContentIn(predictionsBody);
}

function renderTrendChart(insight) {
  const context = document.getElementById("attendance-trend-chart");
  if (!context || typeof Chart === "undefined") {
    return;
  }

  if (attendanceTrendChart) {
    attendanceTrendChart.destroy();
  }

  attendanceTrendChart = new Chart(context, {
    type: "line",
    data: {
      labels: insight.trend.map((point) => point.date),
      datasets: [
        {
          label: "Attendance %",
          data: insight.trend.map((point) => point.attendance_percentage),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          tension: 0.25,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
        },
      },
    },
  });
}

function renderClassComparisonChart(classAnalytics) {
  const context = document.getElementById("class-comparison-chart");
  if (!context || typeof Chart === "undefined") {
    return;
  }

  if (classComparisonChart) {
    classComparisonChart.destroy();
  }

  classComparisonChart = new Chart(context, {
    type: "bar",
    data: {
      labels: classAnalytics.items.map((item) => item.class_name),
      datasets: [
        {
          label: "Attendance %",
          data: classAnalytics.items.map((item) => item.attendance_percentage),
          backgroundColor: "#2563eb",
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
        },
      },
    },
  });
}

async function loadStudentInsight() {
  const rollNumber = analyticsStudentSelect.value;
  if (!rollNumber) {
    studentInsightMetrics.innerHTML = "";
    studentInsightText.textContent = "Select a student to load an AI insight.";
    window.appUi.animateContentIn(studentInsightText);
    return;
  }

  const insight = await window.apiClient.getStudentInsight(rollNumber, {
    threshold: analyticsThresholdInput.value,
  });
  renderStudentInsight(insight);
}

async function loadAnalytics() {
  const threshold = Number(analyticsThresholdInput.value || 75);
  const classId = analyticsClassSelect.value || undefined;
  const summaryDate = analyticsDateInput.value;

  const [summary, classAnalytics, predictions] = await Promise.all([
    window.apiClient.getAnalyticsSummary({ date: summaryDate, class_id: classId, threshold }),
    window.apiClient.getClassAnalytics(),
    window.apiClient.getPredictions({ class_id: classId, threshold }),
  ]);

  renderSummary(summary);
  renderPredictions(predictions);
  renderClassComparisonChart(classAnalytics);

  const trendClassId = resolveTrendClassId(classAnalytics);
  if (trendClassId) {
    const classInsight = await window.apiClient.getClassInsight(trendClassId, { threshold });
    renderClassInsight(classInsight);
    renderTrendChart(classInsight);
  } else {
    classInsightMetrics.innerHTML = "";
    classInsightText.textContent = "No class insight is available yet.";
    classLowAttendanceList.innerHTML = `<div class="empty-state">Create a class and mark attendance to unlock trends.</div>`;
    window.appUi.animateContentIn(classInsightText);
    window.appUi.animateContentIn(classLowAttendanceList);
  }

  await loadStudentOptions();
  await loadStudentInsight();
}

function setupRealtimeRefresh() {
  realtimeSocket = window.apiClient.createAttendanceRealtimeConnection((message) => {
    if (message.type !== "attendance_updated") {
      return;
    }

    const selectedClassId = analyticsClassSelect.value ? Number(analyticsClassSelect.value) : null;
    const classMatch = !selectedClassId || message.class_ids.includes(selectedClassId);
    const dateMatch = !analyticsDateInput.value || message.attendance_date === analyticsDateInput.value;
    if (!classMatch || !dateMatch) {
      return;
    }

    window.appUi.showToast("Attendance changed. Refreshing analytics...");
    loadAnalytics().catch((error) => window.appUi.showToast(error.message, "error"));
  });
}

function setupVoiceCommands() {
  if (!window.voiceCommands) {
    return;
  }

  window.voiceCommands.createVoiceController({
    button: analyticsVoiceButton,
    feedbackElement: analyticsVoiceFeedback,
    onCommand: async (transcript) => {
      if (transcript.includes("show today's attendance summary") || transcript.includes("today attendance summary")) {
        analyticsDateInput.value = window.appUi.getTodayDate();
        await loadAnalytics();
        return;
      }

      if (transcript.startsWith("open ")) {
        const destination = transcript.replace("open ", "").trim();
        const map = {
          dashboard: "dashboard.html",
          students: "students.html",
          attendance: "attendance.html",
          records: "records.html",
          classes: "classes.html",
          analytics: "analytics.html",
        };
        if (map[destination]) {
          window.location.href = `/${map[destination]}`;
          return;
        }
      }

      if (transcript.startsWith("mark attendance for ")) {
        const className = transcript.replace("mark attendance for ", "").trim();
        window.location.href = `/attendance.html?class=${encodeURIComponent(className)}`;
        return;
      }

      const studentMatch = transcript.match(/student\s+(\d+)/);
      if (studentMatch) {
        analyticsStudentSelect.value = studentMatch[1];
        await loadStudentInsight();
        return;
      }

      if (transcript.includes("refresh analytics") || transcript.includes("refresh summary")) {
        await loadAnalytics();
        return;
      }

      analyticsVoiceFeedback.textContent = `No action matched for "${transcript}".`;
    },
  });
}

analyticsRefreshButton.addEventListener("click", () => {
  loadAnalytics().catch((error) => window.appUi.showToast(error.message, "error"));
});

analyticsClassSelect.addEventListener("change", () => {
  loadAnalytics().catch((error) => window.appUi.showToast(error.message, "error"));
});

analyticsDateInput.addEventListener("change", () => {
  loadAnalytics().catch((error) => window.appUi.showToast(error.message, "error"));
});

analyticsThresholdInput.addEventListener("change", () => {
  loadAnalytics().catch((error) => window.appUi.showToast(error.message, "error"));
});

analyticsStudentSelect.addEventListener("change", () => {
  loadStudentInsight().catch((error) => window.appUi.showToast(error.message, "error"));
});

window.addEventListener("beforeunload", () => {
  realtimeSocket?.close();
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const app = await window.appUi.initializeApp();
    currentUser = app.user;
    analyticsDateInput.value = getQueryParam("date") || window.appUi.getTodayDate();
    availableClasses = await window.apiClient.getClasses();
    renderClassOptions(availableClasses);
    setupVoiceCommands();
    setupRealtimeRefresh();
    await loadAnalytics();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
