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
const quickCounterEl = document.getElementById("attendance-quick-counter");
const stickySaveSummary = document.getElementById("sticky-save-summary");

let attendanceState = [];
let currentUser = null;
let searchTimer = null;
let availableClasses = [];
let realtimeSocket = null;
let selectedIndex = 0;

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
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function renderClassOptions(classes) {
  attendanceClassSelect.innerHTML = `
    <option value="">All classes</option>
    ${classes
      .map((classroom) => `<option value="${classroom.id}">${window.appUi.escapeHtml(classroom.name)}</option>`)
      .join("")}
  `;

  const requestedClassId = getQueryParam("class_id");
  const requestedClassName = (getQueryParam("class") || "").trim().toLowerCase();
  if (requestedClassId) {
    attendanceClassSelect.value = requestedClassId;
  } else if (requestedClassName) {
    const matchedClass = classes.find((item) => item.name.toLowerCase() === requestedClassName);
    if (matchedClass) {
      attendanceClassSelect.value = String(matchedClass.id);
    }
  }

  if (currentUser?.role === "teacher" && currentUser?.assigned_class_id) {
    attendanceClassSelect.value = String(currentUser.assigned_class_id);
    attendanceClassSelect.disabled = true;
  }
}

function sortAttendanceState() {
  const sortBy = attendanceSortSelect.value;
  attendanceState.sort((left, right) => {
    if (sortBy === "name") {
      return left.name.localeCompare(right.name);
    }
    return left.roll_number - right.roll_number;
  });
}

function persistDraft() {
  const payload = attendanceState.map((student) => ({
    roll_number: student.roll_number,
    status: student.status,
  }));
  window.localStorage.setItem(getDraftKey(), JSON.stringify(payload));
}

function hydrateDraft() {
  const rawDraft = window.localStorage.getItem(getDraftKey());
  if (!rawDraft) {
    return;
  }

  try {
    const draftItems = JSON.parse(rawDraft);
    const draftMap = new Map(draftItems.map((item) => [item.roll_number, item.status]));
    attendanceState = attendanceState.map((student) => ({
      ...student,
      status: draftMap.has(student.roll_number) ? draftMap.get(student.roll_number) : student.status,
    }));
  } catch {
    window.localStorage.removeItem(getDraftKey());
  }
}

function updateSummary() {
  const counts = attendanceState.reduce(
    (summary, student) => {
      if (!student.status) {
        summary.unmarked += 1;
      } else {
        summary[student.status] += 1;
      }
      return summary;
    },
    { present: 0, absent: 0, late: 0, unmarked: 0 }
  );

  totalCountEl.textContent = attendanceState.length;
  presentCountEl.textContent = counts.present;
  absentCountEl.textContent = counts.absent;
  lateCountEl.textContent = counts.late;
  quickCounterEl.textContent = `Present: ${counts.present} | Absent: ${counts.absent} | Unmarked: ${counts.unmarked}`;
  stickySaveSummary.textContent = `Save attendance for ${attendanceDateInput.value} · ${counts.absent} absent`;
  persistDraft();
}

function updateStudentStatus(rollNumber, status) {
  attendanceState = attendanceState.map((student) => {
    if (student.roll_number !== rollNumber) {
      return student;
    }

    if (status === "toggle") {
      if (!student.status || student.status === "present") {
        return { ...student, status: "absent" };
      }
      return { ...student, status: "present" };
    }

    return { ...student, status };
  });

  renderAttendanceRows();
}

function renderAttendanceRows() {
  sortAttendanceState();
  if (!attendanceState.length) {
    attendanceContainer.innerHTML = `
      <div class="empty-state">
        No students available. Add students first on the Students page before marking attendance.
      </div>
    `;
    updateSummary();
    return;
  }

  attendanceContainer.innerHTML = attendanceState
    .map(
      (student, index) => `
        <div class="attendance-row attendance-state-${student.status || "unmarked"} ${
          selectedIndex === index ? "is-selected" : ""
        }" data-roll="${student.roll_number}" tabindex="0">
          <div class="student-row-main">
            <div class="student-avatar">${createAvatar(student.name)}</div>
            <div class="student-meta">
              <strong><span class="roll-pill">${String(student.roll_number).padStart(2, "0")}</span> ${window.appUi.escapeHtml(
                student.name
              )}</strong>
              <span>${window.appUi.escapeHtml(student.class_name || "Unassigned class")}</span>
            </div>
          </div>
          <div class="status-group">
            <button type="button" class="status-toggle status-${student.status || "unmarked"}" data-action="toggle">
              ${
                student.status === "absent"
                  ? "❌ Absent"
                  : student.status === "late"
                    ? "🕒 Late"
                    : student.status === "present"
                      ? "✅ Present"
                      : "○ Unmarked"
              }
            </button>
            <button type="button" class="btn btn-secondary btn-small" data-action="late">Late</button>
          </div>
        </div>
      `
    )
    .join("");

  attendanceContainer.querySelectorAll(".attendance-row").forEach((row, index) => {
    row.addEventListener("click", (event) => {
      const rollNumber = Number(row.dataset.roll);
      const actionButton = event.target.closest("[data-action]");
      selectedIndex = index;

      if (actionButton?.dataset.action === "late") {
        updateStudentStatus(rollNumber, "late");
        return;
      }

      updateStudentStatus(rollNumber, "toggle");
    });

    let touchStartX = 0;
    row.addEventListener("touchstart", (event) => {
      touchStartX = event.changedTouches[0].clientX;
    });
    row.addEventListener("touchend", (event) => {
      const deltaX = event.changedTouches[0].clientX - touchStartX;
      const rollNumber = Number(row.dataset.roll);
      if (deltaX > 60) {
        updateStudentStatus(rollNumber, "present");
      } else if (deltaX < -60) {
        updateStudentStatus(rollNumber, "absent");
      }
    });
  });

  updateSummary();
}

async function loadAttendancePage() {
  window.appUi.setLoading(attendanceContainer, "Loading class roster...");
  const classId = attendanceClassSelect.value || undefined;
  const search = attendanceSearchInput.value.trim() || undefined;
  const [students, existingAttendance] = await Promise.all([
    window.apiClient.getStudents({ class_id: classId, search }),
    window.apiClient.getAttendance({ date: attendanceDateInput.value, class_id: classId, search }),
  ]);

  const attendanceMap = new Map(existingAttendance.map((record) => [record.roll_number, record.status]));
  const defaultStatus = getDefaultAttendanceMode() === "all_present" ? "present" : "";
  attendanceState = students.map((student) => ({
    ...student,
    status: attendanceMap.get(student.roll_number) || defaultStatus,
  }));
  hydrateDraft();
  renderAttendanceRows();
}

async function saveAttendance() {
  if (!attendanceState.length) {
    window.appUi.showToast("There are no students to save attendance for.", "error");
    return;
  }

  const payload = attendanceState.map((student) => ({
    roll_number: student.roll_number,
    status: student.status || "absent",
  }));
  await window.apiClient.markAttendance(attendanceDateInput.value, payload);
  window.localStorage.removeItem(getDraftKey());
  window.appUi.showToast("Attendance saved successfully.");
  await loadAttendancePage();
}

function setupRealtimeRefresh() {
  realtimeSocket = window.apiClient.createAttendanceRealtimeConnection((message) => {
    if (message.type !== "attendance_updated") {
      return;
    }

    const selectedClassId = attendanceClassSelect.value ? Number(attendanceClassSelect.value) : null;
    const classMatch = !selectedClassId || message.class_ids.includes(selectedClassId);
    const dateMatch = !attendanceDateInput.value || message.attendance_date === attendanceDateInput.value;
    if (classMatch && dateMatch) {
      window.appUi.showToast("Attendance view refreshed from a live update.");
      loadAttendancePage().catch((error) => window.appUi.showToast(error.message, "error"));
    }
  });
}

function setupVoiceCommands() {
  if (!window.voiceCommands) {
    return;
  }

  window.voiceCommands.createVoiceController({
    button: voiceCommandButton,
    feedbackElement: voiceCommandFeedback,
    onCommand: async (transcript) => {
      if (transcript.startsWith("mark attendance for ")) {
        const className = transcript.replace("mark attendance for ", "").trim();
        const matchedClass = availableClasses.find((item) => item.name.toLowerCase() === className);
        if (matchedClass) {
          attendanceClassSelect.value = String(matchedClass.id);
          await loadAttendancePage();
          voiceCommandFeedback.textContent = `Class changed to ${matchedClass.name}.`;
          return;
        }
      }

      if (transcript.includes("mark all present")) {
        attendanceState = attendanceState.map((student) => ({ ...student, status: "present" }));
        renderAttendanceRows();
        return;
      }

      const rollMatch = transcript.match(/mark roll number (\d+) absent/);
      if (rollMatch) {
        updateStudentStatus(Number(rollMatch[1]), "absent");
        return;
      }

      const markStudentMatch = transcript.match(/mark (.+) (present|absent)/);
      if (markStudentMatch) {
        const [, name, status] = markStudentMatch;
        const matchedStudent = attendanceState.find((student) => student.name.toLowerCase().includes(name.trim()));
        if (matchedStudent) {
          updateStudentStatus(matchedStudent.roll_number, status.trim());
          return;
        }
      }

      if (transcript.includes("save attendance")) {
        await saveAttendance();
        return;
      }

      voiceCommandFeedback.textContent = `No action matched for "${transcript}".`;
    },
  });
}

attendanceDateInput.addEventListener("change", () => {
  loadAttendancePage().catch((error) => window.appUi.showToast(error.message, "error"));
});

attendanceClassSelect.addEventListener("change", () => {
  loadAttendancePage().catch((error) => window.appUi.showToast(error.message, "error"));
});

attendanceSortSelect.addEventListener("change", renderAttendanceRows);

attendanceSearchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    loadAttendancePage().catch((error) => window.appUi.showToast(error.message, "error"));
  }, 250);
});

markAllPresentButton.addEventListener("click", () => {
  attendanceState = attendanceState.map((student) => ({ ...student, status: "present" }));
  renderAttendanceRows();
});

markAllAbsentButton.addEventListener("click", () => {
  attendanceState = attendanceState.map((student) => ({ ...student, status: "absent" }));
  renderAttendanceRows();
});

resetAllButton.addEventListener("click", () => {
  const resetValue = getDefaultAttendanceMode() === "all_present" ? "present" : "";
  attendanceState = attendanceState.map((student) => ({ ...student, status: resetValue }));
  renderAttendanceRows();
});

saveAttendanceButton.addEventListener("click", () => {
  saveAttendance().catch((error) => window.appUi.showToast(error.message, "error"));
});

stickySaveButton.addEventListener("click", () => {
  saveAttendance().catch((error) => window.appUi.showToast(error.message, "error"));
});

document.addEventListener("keydown", (event) => {
  if (!attendanceState.length || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "")) {
    return;
  }

  if (event.key === "ArrowDown") {
    selectedIndex = Math.min(attendanceState.length - 1, selectedIndex + 1);
    renderAttendanceRows();
  } else if (event.key === "ArrowUp") {
    selectedIndex = Math.max(0, selectedIndex - 1);
    renderAttendanceRows();
  } else if (event.key.toLowerCase() === "p") {
    updateStudentStatus(attendanceState[selectedIndex].roll_number, "present");
  } else if (event.key.toLowerCase() === "a") {
    updateStudentStatus(attendanceState[selectedIndex].roll_number, "absent");
  } else if (event.key === "Enter") {
    saveAttendance().catch((error) => window.appUi.showToast(error.message, "error"));
  }
});

window.addEventListener("beforeunload", () => {
  realtimeSocket?.close();
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const app = await window.appUi.initializeApp();
    currentUser = app.user;
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
