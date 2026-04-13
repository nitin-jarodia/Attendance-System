const totalStudentsEl = document.getElementById("dashboard-total-students");
const totalClassesEl = document.getElementById("dashboard-total-classes");
const attendanceRateEl = document.getElementById("dashboard-attendance-rate");
const statusSummaryEl = document.getElementById("dashboard-status-summary");
const recentActivityEl = document.getElementById("recent-activity");
const lowAttendanceBody = document.getElementById("low-attendance-body");
const classAnalyticsBody = document.getElementById("class-analytics-body");
const thresholdInput = document.getElementById("analytics-threshold");

function renderSummary(summary) {
  totalStudentsEl.textContent = summary.total_students;
  totalClassesEl.textContent = summary.total_classes;
  attendanceRateEl.textContent = `${summary.today_attendance_percentage}%`;
  statusSummaryEl.textContent = `${summary.present_count} / ${summary.absent_count} / ${summary.late_count}`;

  recentActivityEl.innerHTML = summary.recent_activity
    ? `
      <div class="activity-card">
        <strong>${window.appUi.escapeHtml(summary.recent_activity.class_name || "Unassigned class")}</strong>
        <p>${summary.recent_activity.total_marked} records updated for ${summary.recent_activity.attendance_date}</p>
        <span class="muted">Last updated: ${new Date(summary.recent_activity.updated_at).toLocaleString()}</span>
      </div>
    `
    : `<div class="empty-state">No attendance activity has been recorded yet.</div>`;
}

function renderLowAttendance(response) {
  const lowAttendanceStudents = response.items.filter((item) => item.is_low_attendance);
  if (!lowAttendanceStudents.length) {
    lowAttendanceBody.innerHTML = `
      <tr>
        <td colspan="4"><div class="empty-state">No students are below the current attendance threshold.</div></td>
      </tr>
    `;
    return;
  }

  lowAttendanceBody.innerHTML = lowAttendanceStudents
    .map(
      (item) => `
        <tr>
          <td>${item.roll_number}</td>
          <td>${window.appUi.escapeHtml(item.name)}</td>
          <td>${window.appUi.escapeHtml(item.class_name || "Unassigned")}</td>
          <td>${item.attendance_percentage}%</td>
        </tr>
      `
    )
    .join("");
}

function renderClassAnalytics(response) {
  if (!response.items.length) {
    classAnalyticsBody.innerHTML = `
      <tr>
        <td colspan="6"><div class="empty-state">No class analytics available yet.</div></td>
      </tr>
    `;
    return;
  }

  classAnalyticsBody.innerHTML = response.items
    .map(
      (item) => `
        <tr>
          <td>${window.appUi.escapeHtml(item.class_name)}</td>
          <td>${item.total_students}</td>
          <td>${item.present_count}</td>
          <td>${item.absent_count}</td>
          <td>${item.late_count}</td>
          <td>${item.attendance_percentage}%</td>
        </tr>
      `
    )
    .join("");
}

async function loadDashboard() {
  const threshold = Number(thresholdInput.value || 75);
  const [summary, studentAnalytics, classAnalytics] = await Promise.all([
    window.apiClient.getDashboardSummary(),
    window.apiClient.getStudentAnalytics({ threshold, page: 1, page_size: 100 }),
    window.apiClient.getClassAnalytics(),
  ]);
  renderSummary(summary);
  renderLowAttendance(studentAnalytics);
  renderClassAnalytics(classAnalytics);
}

thresholdInput.addEventListener("change", () => {
  loadDashboard().catch((error) => window.appUi.showToast(error.message, "error"));
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await window.appUi.initializeApp();
    await loadDashboard();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
