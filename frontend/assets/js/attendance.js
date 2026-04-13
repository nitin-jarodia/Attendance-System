const attendanceDateInput = document.getElementById("attendance-date");
const attendanceClassSelect = document.getElementById("attendance-class");
const attendanceSearchInput = document.getElementById("attendance-search");
const attendanceSortSelect = document.getElementById("attendance-sort");
const attendanceContainer = document.getElementById("attendance-container");
const saveAttendanceButton = document.getElementById("save-attendance-button");
const stickySaveButton = document.getElementById("save-attendance-button-sticky");
const voiceCommandButton = document.getElementById("voice-command-button");
const voiceCommandFeedback = document.getElementById("voice-command-feedback");
const markAllPresentButton = document.getElementById("mark-all-present-button");
const markAllAbsentButton = document.getElementById("mark-all-absent-button");
const resetAllButton = document.getElementById("reset-all-button");
const totalCountEl = document.getElementById("attendance-total");
const presentCountEl = document.getElementById("attendance-present");
const absentCountEl = document.getElementById("attendance-absent");
const lateCountEl = document.getElementById("attendance-late");
const unmarkedCountEl = document.getElementById("attendance-unmarked");
const stickySaveSummary = document.getElementById("sticky-save-summary");
const gracePeriodBanner = document.getElementById("grace-period-banner");
const lateArrivalsSection = document.getElementById("late-arrivals-section");
const lateArrivalsBody = document.getElementById("late-arrivals-body");

const GRACE_PERIOD_MINUTES = 10;
const CLASS_START_TIME = "09:00";

let attendanceState = [];
let currentUser = null;
let searchTimer = null;
let availableClasses = [];
let realtimeSocket = null;
let selectedIndex = 0;
let lastStatusChange = null;
let statusFlashTimer = null;
let previousSummaryCounts = null;

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getDraftKey() {
  return `attendance_draft_${attendanceDateInput.value}_${attendanceClassSelect.value || "all"}`;
}

function getDefaultAttendanceMode() {
  return window.appUi.getPreference(window.appUi.STORAGE_KEYS.defaultAttendanceMode, "all_present");
}

function createAvatar(name) {
  return name.split(" ").slice(0, 2).map((p) => p[0] || "").join("").toUpperCase();
}

function isPastGracePeriod() {
  const now = new Date();
  const [startHr, startMin] = CLASS_START_TIME.split(":").map(Number);
  const graceEnd = new Date(now);
  graceEnd.setHours(startHr, startMin + GRACE_PERIOD_MINUTES, 0, 0);
  return now > graceEnd;
}

function checkGracePeriod() {
  if (!gracePeriodBanner) return;
  const isToday = attendanceDateInput.value === window.appUi.getTodayDate();
  if (isToday && isPastGracePeriod()) {
    gracePeriodBanner.style.display = "flex";
  } else {
    gracePeriodBanner.style.display = "none";
  }
}

function renderClassOptions(classes) {
  attendanceClassSelect.innerHTML = `
    <option value="">All classes</option>
    ${classes.map((c) => `<option value="${c.id}">${window.appUi.escapeHtml(c.name)}</option>`).join("")}
  `;

  const requestedClassId = getQueryParam("class_id");
  const requestedClassName = (getQueryParam("class") || "").trim().toLowerCase();
  if (requestedClassId) {
    attendanceClassSelect.value = requestedClassId;
  } else if (requestedClassName) {
    const matched = classes.find((c) => c.name.toLowerCase() === requestedClassName);
    if (matched) attendanceClassSelect.value = String(matched.id);
  }

  if (currentUser?.role === "teacher" && currentUser?.assigned_class_id) {
    attendanceClassSelect.value = String(currentUser.assigned_class_id);
    attendanceClassSelect.disabled = true;
  }
}

function sortAttendanceState() {
  const sortBy = attendanceSortSelect.value;
  attendanceState.sort((a, b) => sortBy === "name" ? a.name.localeCompare(b.name) : a.roll_number - b.roll_number);
}

function persistDraft() {
  const payload = attendanceState.map((s) => ({ roll_number: s.roll_number, status: s.status }));
  window.localStorage.setItem(getDraftKey(), JSON.stringify(payload));
}

function hydrateDraft() {
  const raw = window.localStorage.getItem(getDraftKey());
  if (!raw) return;
  try {
    const items = JSON.parse(raw);
    const map = new Map(items.map((i) => [i.roll_number, i.status]));
    attendanceState = attendanceState.map((s) => ({ ...s, status: map.has(s.roll_number) ? map.get(s.roll_number) : s.status }));
  } catch { window.localStorage.removeItem(getDraftKey()); }
}

function updateSummary() {
  const counts = attendanceState.reduce(
    (acc, s) => {
      if (!s.status) acc.unmarked++;
      else acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0, unmarked: 0 }
  );

  const applyCount = (element, nextValue, key) => {
    if (!element) return;
    element.classList.add("counter-number");
    const changed = previousSummaryCounts && previousSummaryCounts[key] !== nextValue;
    element.textContent = nextValue;
    if (changed) {
      element.classList.remove("updated");
      void element.offsetWidth;
      element.classList.add("updated");
      window.setTimeout(() => element.classList.remove("updated"), 320);
    }
  };

  applyCount(totalCountEl, attendanceState.length, "total");
  applyCount(presentCountEl, counts.present, "present");
  applyCount(absentCountEl, counts.absent, "absent");
  applyCount(lateCountEl, counts.late, "late");
  if (unmarkedCountEl) applyCount(unmarkedCountEl, counts.unmarked, "unmarked");
  if (stickySaveSummary) stickySaveSummary.textContent = `Save attendance for ${attendanceDateInput.value} · ${counts.absent} absent · ${counts.late} late`;
  previousSummaryCounts = { total: attendanceState.length, ...counts };
  persistDraft();
}

function updateStudentStatus(rollNumber, newStatus) {
  attendanceState = attendanceState.map((s) => {
    if (s.roll_number !== rollNumber) return s;
    const effectiveStatus = newStatus === "toggle"
      ? (!s.status || s.status === "present" ? "absent" : "present")
      : newStatus;
    lastStatusChange = { rollNumber, status: effectiveStatus };
    return { ...s, status: effectiveStatus };
  });
  renderAttendanceRows();
}

function renderAttendanceRows() {
  sortAttendanceState();
  const readOnly = window.appUi.isReadOnly();

  if (!attendanceState.length) {
    attendanceContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        No students available. Add students first on the Students page before marking attendance.
      </div>`;
    updateSummary();
    return;
  }

  attendanceContainer.innerHTML = attendanceState.map((student, index) => {
    const status = student.status || "unmarked";
    const bgClass = status === "unmarked" ? "" : `attendance-state-${status}`;
    const flashClass = lastStatusChange?.rollNumber === student.roll_number && status !== "unmarked"
      ? `row-status-changed status-flash-${status}`
      : "";
    const editedTag = student.edited_by
      ? `<span class="edited-badge" title="Changed from ${window.appUi.escapeHtml(student.previous_status || "?")} by ${window.appUi.escapeHtml(student.edited_by)}">edited</span>`
      : "";

    return `
      <div class="attendance-row ${bgClass} ${flashClass} ${selectedIndex === index ? "is-selected" : ""}" data-roll="${student.roll_number}" data-index="${index}" tabindex="0">
        <div class="student-row-main">
          <div class="student-avatar">${createAvatar(student.name)}</div>
          <div class="student-meta">
            <strong><span class="roll-pill">${String(student.roll_number).padStart(2, "0")}</span> ${window.appUi.escapeHtml(student.name)} ${editedTag}</strong>
            <span>${window.appUi.escapeHtml(student.class_name || "Unassigned class")}</span>
          </div>
        </div>
        <div class="attendance-btn-group">
          <button type="button" class="attendance-status-btn ${status === "present" ? "active-present" : ""}" data-set-status="present" ${readOnly ? "disabled" : ""}>✅ Present</button>
          <button type="button" class="attendance-status-btn ${status === "late" ? "active-late" : ""}" data-set-status="late" ${readOnly ? "disabled" : ""}>🕐 Late</button>
          <button type="button" class="attendance-status-btn ${status === "absent" ? "active-absent" : ""}" data-set-status="absent" ${readOnly ? "disabled" : ""}>❌ Absent</button>
        </div>
      </div>`;
  }).join("");
  window.appUi.animateContentIn(attendanceContainer);

  attendanceContainer.querySelectorAll(".attendance-row").forEach((row) => {
    const rollNumber = Number(row.dataset.roll);
    const idx = Number(row.dataset.index);

    row.querySelectorAll("[data-set-status]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedIndex = idx;
        const newStatus = btn.dataset.setStatus;
        // Grace period soft suggestion
        if (newStatus === "present" && isPastGracePeriod() && attendanceDateInput.value === window.appUi.getTodayDate()) {
          const student = attendanceState.find((s) => s.roll_number === rollNumber);
          if (student && student.status !== "present") {
            window.appUi.showToast("It's past the grace period. Consider marking as Late instead.", "info", { duration: 3000 });
          }
        }
        updateStudentStatus(rollNumber, newStatus);
      });
    });

    let touchStartX = 0;
    row.addEventListener("touchstart", (e) => { touchStartX = e.changedTouches[0].clientX; });
    row.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (dx > 60) updateStudentStatus(rollNumber, "present");
      else if (dx < -60) updateStudentStatus(rollNumber, "absent");
    });
  });

  if (lastStatusChange) {
    window.clearTimeout(statusFlashTimer);
    statusFlashTimer = window.setTimeout(() => {
      const changedRoll = lastStatusChange?.rollNumber;
      const changedRow = changedRoll
        ? attendanceContainer.querySelector(`.attendance-row[data-roll="${changedRoll}"]`)
        : null;
      changedRow?.classList.remove("row-status-changed", "status-flash-present", "status-flash-late", "status-flash-absent");
      lastStatusChange = null;
    }, 520);
  }

  updateSummary();
}

async function loadLateArrivals() {
  if (!lateArrivalsSection || !lateArrivalsBody) return;
  try {
    const classId = attendanceClassSelect.value || undefined;
    const data = await window.apiClient.getLateArrivals({ class_id: classId, page: 1, page_size: 20 });
    if (!data.items.length) {
      lateArrivalsBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">🎉</div>No late arrivals this period.</div></td></tr>`;
      window.appUi.animateContentIn(lateArrivalsBody);
      return;
    }
    lateArrivalsBody.innerHTML = data.items.map((item) => {
      const timeStr = item.late_arrival_time ? new Date(item.late_arrival_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
      const freqBadge = item.late_count_this_week >= 3 ? `<span class="frequent-badge">Frequent</span>` : "";
      return `<tr>
        <td>${item.date}</td>
        <td>${item.roll_number}</td>
        <td>${window.appUi.escapeHtml(item.name)}</td>
        <td>${window.appUi.escapeHtml(item.class_name || "—")}</td>
        <td>${timeStr}</td>
        <td>${freqBadge}</td>
      </tr>`;
    }).join("");
    window.appUi.animateContentIn(lateArrivalsBody);
  } catch (err) {
    lateArrivalsBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">Failed to load late arrivals.</div></td></tr>`;
    window.appUi.animateContentIn(lateArrivalsBody);
  }
}

async function loadAttendancePage() {
  window.appUi.setLoading(attendanceContainer, "Loading class roster...");
  const classId = attendanceClassSelect.value || undefined;
  const search = attendanceSearchInput.value.trim() || undefined;
  const [students, existingAttendance] = await Promise.all([
    window.apiClient.getStudents({ class_id: classId, search }),
    window.apiClient.getAttendance({ date: attendanceDateInput.value, class_id: classId, search }),
  ]);

  const attendanceMap = new Map(existingAttendance.map((r) => [r.roll_number, r]));
  const defaultStatus = getDefaultAttendanceMode() === "all_present" ? "present" : "";
  attendanceState = students.map((student) => {
    const existing = attendanceMap.get(student.roll_number);
    return {
      ...student,
      status: existing?.status || defaultStatus,
      late_arrival_time: existing?.late_arrival_time || null,
      previous_status: existing?.previous_status || null,
      edited_by: existing?.edited_by || null,
      edited_at: existing?.edited_at || null,
    };
  });
  hydrateDraft();
  checkGracePeriod();
  renderAttendanceRows();
  loadLateArrivals();
}

async function saveAttendance() {
  if (!attendanceState.length) {
    window.appUi.showToast("There are no students to save attendance for.", "error");
    return;
  }

  window.appUi.setButtonLoading(saveAttendanceButton, true);
  window.appUi.setButtonLoading(stickySaveButton, true);
  try {
    const now = new Date().toISOString();
    const payload = attendanceState.map((s) => ({
      roll_number: s.roll_number,
      status: s.status || "absent",
      late_arrival_time: s.status === "late" ? now : null,
    }));
    await window.apiClient.markAttendance(attendanceDateInput.value, payload);
    window.localStorage.removeItem(getDraftKey());
    window.appUi.showToast("Attendance saved successfully.");
    await loadAttendancePage();
  } finally {
    window.appUi.setButtonLoading(saveAttendanceButton, false);
    window.appUi.setButtonLoading(stickySaveButton, false);
  }
}

function setupRealtimeRefresh() {
  realtimeSocket = window.apiClient.createAttendanceRealtimeConnection((message) => {
    if (message.type !== "attendance_updated") return;
    const selectedClassId = attendanceClassSelect.value ? Number(attendanceClassSelect.value) : null;
    const classMatch = !selectedClassId || message.class_ids.includes(selectedClassId);
    const dateMatch = !attendanceDateInput.value || message.attendance_date === attendanceDateInput.value;
    if (classMatch && dateMatch) {
      window.appUi.showToast("Attendance view refreshed from a live update.");
      loadAttendancePage().catch((e) => window.appUi.showToast(e.message, "error"));
    }
  });
}

function setupVoiceCommands() {
  if (!window.voiceCommands) return;
  window.voiceCommands.createVoiceController({
    button: voiceCommandButton,
    feedbackElement: voiceCommandFeedback,
    onCommand: async (transcript) => {
      if (transcript.startsWith("mark attendance for ")) {
        const className = transcript.replace("mark attendance for ", "").trim();
        const matched = availableClasses.find((c) => c.name.toLowerCase() === className);
        if (matched) {
          attendanceClassSelect.value = String(matched.id);
          await loadAttendancePage();
          return;
        }
      }
      if (transcript.includes("mark all present")) {
        attendanceState = attendanceState.map((s) => ({ ...s, status: "present" }));
        renderAttendanceRows();
        return;
      }
      if (transcript.includes("mark all absent")) {
        attendanceState = attendanceState.map((s) => ({ ...s, status: "absent" }));
        renderAttendanceRows();
        return;
      }
      const rollMatch = transcript.match(/mark roll (?:number )?(\d+) (present|absent|late)/);
      if (rollMatch) {
        updateStudentStatus(Number(rollMatch[1]), rollMatch[2]);
        return;
      }
      const nameMatch = transcript.match(/mark (.+) (present|absent|late)/);
      if (nameMatch) {
        const [, name, status] = nameMatch;
        const matched = attendanceState.find((s) => s.name.toLowerCase().includes(name.trim()));
        if (matched) { updateStudentStatus(matched.roll_number, status.trim()); return; }
      }
      if (transcript.includes("save attendance")) {
        await saveAttendance();
        return;
      }
      if (voiceCommandFeedback) voiceCommandFeedback.textContent = `No action matched for "${transcript}".`;
    },
  });
}

// Event listeners
attendanceDateInput.addEventListener("change", () => loadAttendancePage().catch((e) => window.appUi.showToast(e.message, "error")));
attendanceClassSelect.addEventListener("change", () => loadAttendancePage().catch((e) => window.appUi.showToast(e.message, "error")));
attendanceSortSelect.addEventListener("change", renderAttendanceRows);

attendanceSearchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadAttendancePage().catch((e) => window.appUi.showToast(e.message, "error")), 250);
});

markAllPresentButton?.addEventListener("click", () => {
  attendanceState = attendanceState.map((s) => ({ ...s, status: "present" }));
  renderAttendanceRows();
});

markAllAbsentButton?.addEventListener("click", () => {
  attendanceState = attendanceState.map((s) => ({ ...s, status: "absent" }));
  renderAttendanceRows();
});

resetAllButton?.addEventListener("click", () => {
  const resetValue = getDefaultAttendanceMode() === "all_present" ? "present" : "";
  attendanceState = attendanceState.map((s) => ({ ...s, status: resetValue }));
  renderAttendanceRows();
});

saveAttendanceButton?.addEventListener("click", () => saveAttendance().catch((e) => window.appUi.showToast(e.message, "error")));
stickySaveButton?.addEventListener("click", () => saveAttendance().catch((e) => window.appUi.showToast(e.message, "error")));

document.addEventListener("keydown", (event) => {
  if (!attendanceState.length || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "")) return;
  if (event.key === "ArrowDown") { selectedIndex = Math.min(attendanceState.length - 1, selectedIndex + 1); renderAttendanceRows(); }
  else if (event.key === "ArrowUp") { selectedIndex = Math.max(0, selectedIndex - 1); renderAttendanceRows(); }
  else if (event.key.toLowerCase() === "p") updateStudentStatus(attendanceState[selectedIndex].roll_number, "present");
  else if (event.key.toLowerCase() === "a") updateStudentStatus(attendanceState[selectedIndex].roll_number, "absent");
  else if (event.key.toLowerCase() === "l") updateStudentStatus(attendanceState[selectedIndex].roll_number, "late");
  else if (event.key === "Enter") saveAttendance().catch((e) => window.appUi.showToast(e.message, "error"));
});

window.addEventListener("beforeunload", () => realtimeSocket?.close());

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const app = await window.appUi.initializeApp();
    currentUser = app.user;

    if (window.appUi.isReadOnly()) {
      saveAttendanceButton && (saveAttendanceButton.disabled = true);
      stickySaveButton && (stickySaveButton.disabled = true);
      markAllPresentButton && (markAllPresentButton.disabled = true);
      markAllAbsentButton && (markAllAbsentButton.disabled = true);
      resetAllButton && (resetAllButton.disabled = true);
    }

    attendanceDateInput.value = getQueryParam("date") || window.appUi.getTodayDate();
    availableClasses = await window.apiClient.getClasses();
    renderClassOptions(availableClasses);
    setupVoiceCommands();
    setupRealtimeRefresh();
    await loadAttendancePage();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
