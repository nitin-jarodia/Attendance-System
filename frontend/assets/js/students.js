const studentsTableBody = document.getElementById("students-table-body");
const totalStudentsEl = document.getElementById("total-students");
const addStudentForm = document.getElementById("add-student-form");
const bulkStudentForm = document.getElementById("bulk-student-form");
const bulkSummary = document.getElementById("bulk-summary");

async function loadStudents() {
  const students = await window.apiClient.getStudents();
  totalStudentsEl.textContent = students.length;

  if (!students.length) {
    studentsTableBody.innerHTML = `
      <tr>
        <td colspan="3">
          <div class="empty-state">No students added yet. Start with the form or bulk upload.</div>
        </td>
      </tr>
    `;
    return;
  }

  studentsTableBody.innerHTML = students
    .map(
      (student, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${student.roll_number}</td>
          <td>${window.appUi.escapeHtml(student.name)}</td>
        </tr>
      `
    )
    .join("");
}

function renderBulkSummary(result) {
  const hasDetails = result.skipped_lines.length || result.duplicate_roll_numbers.length;
  bulkSummary.innerHTML = `
    <p><strong>${result.created_count}</strong> students added successfully.</p>
    ${
      hasDetails
        ? `
          <div class="helper-text">
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
          </div>
        `
        : ""
    }
  `;
}

addStudentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(addStudentForm);
  const payload = {
    roll_number: Number(formData.get("roll_number")),
    name: String(formData.get("name") || ""),
  };

  try {
    await window.apiClient.addStudent(payload);
    addStudentForm.reset();
    await loadStudents();
    window.appUi.showToast("Student added successfully.");
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

bulkStudentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rawText = document.getElementById("bulk-input").value;

  try {
    const result = await window.apiClient.bulkAddStudents(rawText);
    renderBulkSummary(result);
    bulkStudentForm.reset();
    await loadStudents();
    window.appUi.showToast("Bulk upload completed.");
  } catch (error) {
    bulkSummary.innerHTML = "";
    window.appUi.showToast(error.message, "error");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadStudents();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
