const studentsTableBody = document.getElementById("students-table-body");
const totalStudentsEl = document.getElementById("total-students");
const addStudentForm = document.getElementById("add-student-form");
const bulkStudentForm = document.getElementById("bulk-student-form");
const bulkSummary = document.getElementById("bulk-summary");
const paginationEl = document.getElementById("students-pagination");
const studentSearchInput = document.getElementById("student-search");
const studentFilterClass = document.getElementById("student-filter-class");
const studentClassSelect = document.getElementById("student-class-id");
const bulkClassSelect = document.getElementById("bulk-class-id");

let currentUser = null;
let currentPage = 1;
let searchTimer = null;
let classes = [];

function createAvatar(name) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function renderClassOptions() {
  const options = classes
    .map((classroom) => `<option value="${classroom.id}">${window.appUi.escapeHtml(classroom.name)}</option>`)
    .join("");

  if (studentFilterClass) {
    studentFilterClass.innerHTML = `<option value="">All classes</option>${options}`;
  }
  if (studentClassSelect) {
    studentClassSelect.innerHTML = `<option value="">Unassigned</option>${options}`;
  }
  if (bulkClassSelect) {
    bulkClassSelect.innerHTML = `<option value="">Unassigned</option>${options}`;
  }
}

function renderBulkSummary(result) {
  const hasDetails = result.skipped_lines.length || result.duplicate_roll_numbers.length;
  bulkSummary.innerHTML = `
    <p><strong>${result.created_count}</strong> students added successfully.</p>
    ${
      hasDetails
        ? `
          ${
            result.duplicate_roll_numbers.length
              ? `<p>Duplicate roll numbers ignored: ${result.duplicate_roll_numbers.join(", ")}</p>`
              : ""
          }
          ${
            result.skipped_lines.length
              ? `<p>Skipped invalid lines:</p><ul class="list">${result.skipped_lines
                  .map((line) => `<li>${window.appUi.escapeHtml(line)}</li>`)
                  .join("")}</ul>`
              : ""
          }
        `
        : ""
    }
  `;
  window.appUi.animateContentIn(bulkSummary);
}

function assignmentControls(student) {
  if (currentUser?.role !== "admin") {
    return "";
  }

  return `
    <td>
      <div class="inline-actions">
        <select class="select row-class-select" data-roll="${student.roll_number}">
          <option value="">Unassigned</option>
          ${classes
            .map(
              (classroom) => `
                <option value="${classroom.id}" ${student.class_id === classroom.id ? "selected" : ""}>
                  ${window.appUi.escapeHtml(classroom.name)}
                </option>
              `
            )
            .join("")}
        </select>
        <button type="button" class="btn btn-secondary save-student-class" data-roll="${student.roll_number}">
          Save
        </button>
      </div>
    </td>
  `;
}

function renderStudents(response) {
  totalStudentsEl.textContent = response.total;

  if (!response.items.length) {
    studentsTableBody.innerHTML = `
      <tr>
        <td colspan="${currentUser?.role === "admin" ? 4 : 3}">
          <div class="empty-state">No students matched the current filters.</div>
        </td>
      </tr>
    `;
    window.appUi.animateContentIn(studentsTableBody);
    return;
  }

  studentsTableBody.innerHTML = response.items
    .map(
      (student) => `
        <tr>
          <td><span class="roll-pill">${String(student.roll_number).padStart(2, "0")}</span></td>
          <td>
            <div class="student-row-main">
              <div class="student-avatar">${createAvatar(student.name)}</div>
              <div class="student-meta">
                <strong>${window.appUi.escapeHtml(student.name)}</strong>
                <span>${window.appUi.escapeHtml(student.class_name || "Unassigned")}</span>
              </div>
            </div>
          </td>
          <td>${window.appUi.escapeHtml(student.class_name || "Unassigned")}</td>
          ${assignmentControls(student)}
        </tr>
      `
    )
    .join("");
  window.appUi.animateContentIn(studentsTableBody);
}

async function loadStudents(page = currentPage) {
  currentPage = page;
  window.appUi.setLoading(studentsTableBody, "Loading students...");
  const response = await window.apiClient.searchStudents({
    page,
    page_size: 10,
    search: studentSearchInput.value.trim(),
    class_id: studentFilterClass.value || undefined,
  });
  renderStudents(response);
  window.appUi.renderPagination(paginationEl, response, loadStudents);
}

async function loadClasses() {
  classes = await window.apiClient.getClasses();
  renderClassOptions();
}

addStudentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(addStudentForm);
  try {
    await window.apiClient.addStudent({
      roll_number: Number(formData.get("roll_number")),
      name: String(formData.get("name") || ""),
      class_id: formData.get("class_id") ? Number(formData.get("class_id")) : null,
    });
    addStudentForm.reset();
    await loadStudents(1);
    window.appUi.showToast("Student added successfully.");
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

bulkStudentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await window.apiClient.bulkAddStudents({
      raw_text: document.getElementById("bulk-input").value,
      class_id: bulkClassSelect.value ? Number(bulkClassSelect.value) : null,
    });
    renderBulkSummary(result);
    bulkStudentForm.reset();
    await loadStudents(1);
    window.appUi.showToast("Bulk upload completed.");
  } catch (error) {
    bulkSummary.innerHTML = "";
    window.appUi.showToast(error.message, "error");
  }
});

studentSearchInput?.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadStudents(1), 250);
});

studentFilterClass?.addEventListener("change", () => {
  loadStudents(1);
});

studentsTableBody.addEventListener("click", async (event) => {
  const saveButton = event.target.closest(".save-student-class");
  if (!saveButton) {
    return;
  }

  const rollNumber = Number(saveButton.dataset.roll);
  const select = studentsTableBody.querySelector(`.row-class-select[data-roll="${rollNumber}"]`);
  try {
    await window.apiClient.updateStudentClass(rollNumber, {
      class_id: select.value ? Number(select.value) : null,
    });
    await loadStudents(currentPage);
    window.appUi.showToast("Student class updated.");
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const app = await window.appUi.initializeApp();
    currentUser = app.user;
    await loadClasses();
    await loadStudents(1);
  } catch (error) {
    if (error?.message) {
      window.appUi.showToast(error.message, "error");
    }
  }
});
