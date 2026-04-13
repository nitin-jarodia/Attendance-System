const attendanceDateInput = document.getElementById("attendance-date");
const attendanceClassSelect = document.getElementById("attendance-class");
const attendanceSearchInput = document.getElementById("attendance-search");
const attendanceContainer = document.getElementById("attendance-container");
const saveAttendanceButton = document.getElementById("save-attendance-button");
const totalCountEl = document.getElementById("attendance-total");
const presentCountEl = document.getElementById("attendance-present");
const absentCountEl = document.getElementById("attendance-absent");
const lateCountEl = document.getElementById("attendance-late");

let attendanceState = [];
let currentUser = null;
let searchTimer = null;

function renderClassOptions(classes) {
  if (!attendanceClassSelect) {
    return;
  }
  attendanceClassSelect.innerHTML = `
    <option value="">All classes</option>
    ${classes
      .map((classroom) => `<option value="${classroom.id}">${window.appUi.escapeHtml(classroom.name)}</option>`)
      .join("")}
  `;
  if (currentUser?.role === "teacher" && currentUser?.assigned_class_id) {
    attendanceClassSelect.value = String(currentUser.assigned_class_id);
    attendanceClassSelect.disabled = true;
  }
}

function updateSummary() {
  const counts = attendanceState.reduce(
    (summary, student) => {
      summary[student.status] += 1;
      return summary;
    },
    { present: 0, absent: 0, late: 0 }
  );

  totalCountEl.textContent = attendanceState.length;
  presentCountEl.textContent = counts.present;
  absentCountEl.textContent = counts.absent;
  lateCountEl.textContent = counts.late;
}

function renderAttendanceRows() {
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
      (student) => `
        <div class="attendance-row">
          <div class="student-meta">
            <strong>${window.appUi.escapeHtml(student.name)}</strong>
            <span>Roll Number: ${student.roll_number}</span>
          </div>
          <div class="status-group" data-roll="${student.roll_number}">
            ${["present", "absent", "late"]
              .map(
                (status) => `
                  <button
                    type="button"
                    class="status-chip ${status} ${student.status === status ? "active" : ""}"
                    data-status="${status}"
                  >
                    ${status}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      `
    )
    .join("");

  attendanceContainer.querySelectorAll(".status-group").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest(".status-chip");
      if (!button) {
        return;
      }

      const rollNumber = Number(group.dataset.roll);
      const newStatus = button.dataset.status;
      attendanceState = attendanceState.map((student) =>
        student.roll_number === rollNumber ? { ...student, status: newStatus } : student
      );
      renderAttendanceRows();
      updateSummary();
    });
  });

  updateSummary();
}

async function loadAttendancePage() {
  const selectedDate = attendanceDateInput.value;
  window.appUi.setLoading(attendanceContainer, "Loading class roster...");
  const classId = attendanceClassSelect.value || undefined;
  const search = attendanceSearchInput.value.trim() || undefined;
  const [students, existingAttendance] = await Promise.all([
    window.apiClient.getStudents({ class_id: classId, search }),
    window.apiClient.getAttendance({ date: selectedDate, class_id: classId, search }),
  ]);

  const attendanceMap = new Map(existingAttendance.map((record) => [record.roll_number, record.status]));
  attendanceState = students.map((student) => ({
    ...student,
    status: attendanceMap.get(student.roll_number) || "absent",
  }));

  renderAttendanceRows();
}

attendanceDateInput.addEventListener("change", async () => {
  try {
    await loadAttendancePage();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

attendanceClassSelect.addEventListener("change", async () => {
  try {
    await loadAttendancePage();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

attendanceSearchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    loadAttendancePage().catch((error) => window.appUi.showToast(error.message, "error"));
  }, 250);
});

saveAttendanceButton.addEventListener("click", async () => {
  try {
    if (!attendanceState.length) {
      window.appUi.showToast("There are no students to save attendance for.", "error");
      return;
    }

    const payload = attendanceState.map((student) => ({
      roll_number: student.roll_number,
      status: student.status,
    }));
    await window.apiClient.markAttendance(attendanceDateInput.value, payload);
    window.appUi.showToast("Attendance saved successfully.");
    await loadAttendancePage();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const app = await window.appUi.initializeApp();
    currentUser = app.user;
    attendanceDateInput.value = window.appUi.getTodayDate();
    const classes = await window.apiClient.getClasses();
    renderClassOptions(classes);
    await loadAttendancePage();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
