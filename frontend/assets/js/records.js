const recordsDateInput = document.getElementById("records-date");
const recordsClassInput = document.getElementById("records-class");
const recordsStatusInput = document.getElementById("records-status");
const recordsSearchInput = document.getElementById("records-search");
const exportButton = document.getElementById("export-button");
const recordsTableBody = document.getElementById("records-table-body");
const totalRecordsEl = document.getElementById("records-total");
const paginationEl = document.getElementById("records-pagination");

let currentPage = 1;
let searchTimer = null;

function renderClassOptions(classes) {
  recordsClassInput.innerHTML = `
    <option value="">All classes</option>
    ${classes
      .map((classroom) => `<option value="${classroom.id}">${window.appUi.escapeHtml(classroom.name)}</option>`)
      .join("")}
  `;
}

async function loadRecords(page = currentPage) {
  currentPage = page;
  window.appUi.setLoading(recordsTableBody, "Loading attendance records...");
  const response = await window.apiClient.searchAttendance({
    page,
    page_size: 10,
    date: recordsDateInput.value,
    class_id: recordsClassInput.value || undefined,
    status: recordsStatusInput.value || undefined,
    search: recordsSearchInput.value.trim() || undefined,
  });
  totalRecordsEl.textContent = response.total;

  if (!response.items.length) {
    recordsTableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">No attendance records found for the selected date.</div>
        </td>
      </tr>
    `;
    return;
  }

  recordsTableBody.innerHTML = response.items
    .map(
      (record) => `
        <tr>
          <td>${record.date}</td>
          <td>${record.roll_number}</td>
          <td>${window.appUi.escapeHtml(record.name)}</td>
          <td>${window.appUi.escapeHtml(record.class_name || "Unassigned")}</td>
          <td>${window.appUi.statusBadge(record.status)}</td>
          <td>
            <div class="inline-actions">
              <select class="select record-status-select" data-roll="${record.roll_number}" data-date="${record.date}">
                ${["present", "absent", "late"]
                  .map(
                    (status) => `
                      <option value="${status}" ${record.status === status ? "selected" : ""}>${status}</option>
                    `
                  )
                  .join("")}
              </select>
              <button type="button" class="btn btn-secondary save-row-button" data-roll="${record.roll_number}" data-date="${record.date}">
                Save
              </button>
            </div>
          </td>
          <td>
            <button type="button" class="btn btn-danger delete-row-button" data-roll="${record.roll_number}" data-date="${record.date}">
              Delete
            </button>
          </td>
        </tr>
      `
    )
    .join("");
  window.appUi.renderPagination(paginationEl, response, loadRecords);
}

recordsDateInput.addEventListener("change", async () => {
  try {
    await loadRecords(1);
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

recordsClassInput.addEventListener("change", async () => {
  try {
    await loadRecords(1);
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

recordsStatusInput.addEventListener("change", async () => {
  try {
    await loadRecords(1);
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

recordsSearchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    loadRecords(1).catch((error) => window.appUi.showToast(error.message, "error"));
  }, 250);
});

exportButton.addEventListener("click", async () => {
  try {
    const download = await window.apiClient.downloadAttendanceExport({
      date: recordsDateInput.value,
      class_id: recordsClassInput.value || undefined,
      status: recordsStatusInput.value || undefined,
      search: recordsSearchInput.value.trim() || undefined,
    });
    const url = window.URL.createObjectURL(download.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = download.filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

recordsTableBody.addEventListener("click", async (event) => {
  const saveButton = event.target.closest(".save-row-button");
  const deleteButton = event.target.closest(".delete-row-button");

  try {
    if (saveButton) {
      const rollNumber = Number(saveButton.dataset.roll);
      const rowDate = saveButton.dataset.date;
      const select = recordsTableBody.querySelector(
        `.record-status-select[data-roll="${rollNumber}"][data-date="${rowDate}"]`
      );
      await window.apiClient.updateAttendance({
        roll_number: rollNumber,
        date: rowDate,
        status: select.value,
      });
      window.appUi.showToast("Attendance updated successfully.");
      await loadRecords(currentPage);
      return;
    }

    if (deleteButton) {
      const rollNumber = Number(deleteButton.dataset.roll);
      const rowDate = deleteButton.dataset.date;
      await window.apiClient.deleteAttendance({
        roll_number: rollNumber,
        date: rowDate,
      });
      window.appUi.showToast("Attendance deleted successfully.");
      await loadRecords(currentPage);
    }
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await window.appUi.initializeApp();
    recordsDateInput.value = window.appUi.getTodayDate();
    const classes = await window.apiClient.getClasses();
    renderClassOptions(classes);
    await loadRecords(1);
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
