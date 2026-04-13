const recordsDateInput = document.getElementById("records-date");
const exportButton = document.getElementById("export-button");
const recordsTableBody = document.getElementById("records-table-body");
const totalRecordsEl = document.getElementById("records-total");

async function loadRecords() {
  const date = recordsDateInput.value;
  const records = await window.apiClient.getAttendance(date);
  totalRecordsEl.textContent = records.length;

  if (!records.length) {
    recordsTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">No attendance records found for the selected date.</div>
        </td>
      </tr>
    `;
    return;
  }

  recordsTableBody.innerHTML = records
    .map(
      (record) => `
        <tr>
          <td>${record.roll_number}</td>
          <td>${window.appUi.escapeHtml(record.name)}</td>
          <td>${window.appUi.statusBadge(record.status)}</td>
          <td>
            <div class="inline-actions">
              <select class="select record-status-select" data-roll="${record.roll_number}">
                ${["present", "absent", "late"]
                  .map(
                    (status) => `
                      <option value="${status}" ${record.status === status ? "selected" : ""}>${status}</option>
                    `
                  )
                  .join("")}
              </select>
              <button type="button" class="btn btn-secondary save-row-button" data-roll="${record.roll_number}">
                Save
              </button>
            </div>
          </td>
          <td>
            <button type="button" class="btn btn-danger delete-row-button" data-roll="${record.roll_number}">
              Delete
            </button>
          </td>
        </tr>
      `
    )
    .join("");
}

recordsDateInput.addEventListener("change", async () => {
  try {
    await loadRecords();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

exportButton.addEventListener("click", () => {
  const date = recordsDateInput.value;
  window.location.href = window.apiClient.exportAttendanceUrl(date);
});

recordsTableBody.addEventListener("click", async (event) => {
  const saveButton = event.target.closest(".save-row-button");
  const deleteButton = event.target.closest(".delete-row-button");

  try {
    if (saveButton) {
      const rollNumber = Number(saveButton.dataset.roll);
      const select = recordsTableBody.querySelector(`.record-status-select[data-roll="${rollNumber}"]`);
      await window.apiClient.updateAttendance({
        roll_number: rollNumber,
        date: recordsDateInput.value,
        status: select.value,
      });
      window.appUi.showToast("Attendance updated successfully.");
      await loadRecords();
      return;
    }

    if (deleteButton) {
      const rollNumber = Number(deleteButton.dataset.roll);
      await window.apiClient.deleteAttendance({
        roll_number: rollNumber,
        date: recordsDateInput.value,
      });
      window.appUi.showToast("Attendance deleted successfully.");
      await loadRecords();
    }
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  recordsDateInput.value = window.appUi.getTodayDate();
  try {
    await loadRecords();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
