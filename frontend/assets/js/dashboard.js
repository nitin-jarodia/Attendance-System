const totalStudentsEl = document.getElementById("dashboard-total-students");
const totalClassesEl = document.getElementById("dashboard-total-classes");
const attendanceRateEl = document.getElementById("dashboard-attendance-rate");
const statusSummaryEl = document.getElementById("dashboard-status-summary");
const recentActivityEl = document.getElementById("dashboard-recent-activity");
const lowAttendanceBody = document.getElementById("low-attendance-body");
const classAnalyticsBody = document.getElementById("class-analytics-body");
const thresholdInput = document.getElementById("analytics-threshold");
const aiSummaryEl = document.getElementById("dashboard-ai-summary");
const aiFallbackEl = document.getElementById("dashboard-ai-fallback");
const weeklyChartCanvas = document.getElementById("dashboard-weekly-chart");
const upcomingHolidaysEl = document.getElementById("dashboard-upcoming-holidays");

let realtimeSocket = null;
let weeklyChart = null;

function renderSummary(summary) {
  totalStudentsEl.textContent = summary.total_students;
  totalClassesEl.textContent = summary.total_classes;
  attendanceRateEl.textContent = `${summary.today_attendance_percentage}%`;
  statusSummaryEl.textContent = `${summary.present_count} / ${summary.absent_count} / ${summary.late_count}`;
}

async function renderRecentActivity() {
  try {
    const items = await window.apiClient.getRecentActivity(5);
    if (!items.length) {
      recentActivityEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📝</div>No activity yet. Actions will appear here as they happen.</div>`;
      window.appUi.animateContentIn(recentActivityEl);
      return;
    }
    recentActivityEl.innerHTML = items.map((entry) => {
      const icon = window.appUi.activityIcon(entry.action_type);
      const time = window.appUi.relativeTime(entry.created_at);
      return `
        <div class="activity-entry">
          <div class="activity-icon">${icon}</div>
          <div class="activity-body">
            <strong>${window.appUi.escapeHtml(entry.details)}</strong>
            <span class="activity-time">🕐 ${time}</span>
          </div>
        </div>`;
    }).join("");
    window.appUi.animateContentIn(recentActivityEl);
  } catch {
    recentActivityEl.innerHTML = `<div class="empty-state">Could not load recent activity.</div>`;
    window.appUi.animateContentIn(recentActivityEl);
  }
}

async function renderUpcomingHolidays() {
  if (!upcomingHolidaysEl) return;
  try {
    const holidays = await window.apiClient.getUpcomingHolidays(3);
    if (!holidays.length) {
      upcomingHolidaysEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎉</div>No upcoming holidays this month!</div>`;
      window.appUi.animateContentIn(upcomingHolidaysEl);
      return;
    }
    upcomingHolidaysEl.innerHTML = holidays.map((h) => `
      <div class="upcoming-holiday-item">
        <div><strong>${window.appUi.escapeHtml(h.name)}</strong></div>
        <span class="muted">${h.date} (in ${h.days_until} day${h.days_until === 1 ? "" : "s"})</span>
      </div>
    `).join("");
    window.appUi.animateContentIn(upcomingHolidaysEl);
  } catch {
    upcomingHolidaysEl.innerHTML = `<div class="empty-state">Could not load holidays.</div>`;
    window.appUi.animateContentIn(upcomingHolidaysEl);
  }
}

function renderLowAttendance(response) {
  const lowStudents = response.items.filter((item) => item.is_low_attendance);
  if (!lowStudents.length) {
    lowAttendanceBody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-state-icon">🎉</div>No students below the threshold.</div></td></tr>`;
    window.appUi.animateContentIn(lowAttendanceBody);
    return;
  }
  lowAttendanceBody.innerHTML = lowStudents.map((item) => `
    <tr>
      <td>${item.roll_number}</td>
      <td>${window.appUi.escapeHtml(item.name)}</td>
      <td>${window.appUi.escapeHtml(item.class_name || "Unassigned")}</td>
      <td>${item.attendance_percentage}%</td>
    </tr>
  `).join("");
  window.appUi.animateContentIn(lowAttendanceBody);
}

function renderClassAnalytics(response) {
  if (!response.items.length) {
    classAnalyticsBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No class analytics available.</div></td></tr>`;
    window.appUi.animateContentIn(classAnalyticsBody);
    return;
  }
  classAnalyticsBody.innerHTML = response.items.map((item) => `
    <tr>
      <td>${window.appUi.escapeHtml(item.class_name)}</td>
      <td>${item.total_students}</td>
      <td>${item.present_count}</td>
      <td>${item.absent_count}</td>
      <td>${item.late_count}</td>
      <td>${item.attendance_percentage}%</td>
    </tr>
  `).join("");
  window.appUi.animateContentIn(classAnalyticsBody);
}

function renderWeeklyChart(classAnalytics) {
  if (typeof Chart === "undefined" || !weeklyChartCanvas || !classAnalytics.items.length) return;
  const preferredClassId = classAnalytics.items[0].class_id;
  window.apiClient.getClassInsight(preferredClassId).then((insight) => {
    if (weeklyChart) weeklyChart.destroy();
    weeklyChart = new Chart(weeklyChartCanvas, {
      type: "line",
      data: {
        labels: insight.trend.map((p) => p.date),
        datasets: [{
          label: `${insight.class_name} attendance %`,
          data: insight.trend.map((p) => p.attendance_percentage),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          fill: true,
          tension: 0.3,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } },
    });
  });
}

async function loadDashboard() {
  const threshold = Number(thresholdInput.value || 75);
  const [summary, studentAnalytics, classAnalytics, aiSummary] = await Promise.all([
    window.apiClient.getDashboardSummary(),
    window.apiClient.getStudentAnalytics({ threshold, page: 1, page_size: 100 }),
    window.apiClient.getClassAnalytics(),
    window.apiClient.getAnalyticsSummary({ date: window.appUi.getTodayDate(), threshold }),
  ]);
  renderSummary(summary);
  renderLowAttendance(studentAnalytics);
  renderClassAnalytics(classAnalytics);
  renderWeeklyChart(classAnalytics);
  aiSummaryEl.textContent = aiSummary.ai_summary;
  aiFallbackEl.textContent = aiSummary.used_fallback
    ? "Groq unavailable, showing fallback summary."
    : "Groq-powered summary is active.";
  renderRecentActivity();
  renderUpcomingHolidays();
}

function setupRealtimeRefresh() {
  realtimeSocket = window.apiClient.createAttendanceRealtimeConnection((message) => {
    if (message.type !== "attendance_updated" || message.attendance_date !== window.appUi.getTodayDate()) return;
    window.appUi.showToast("Dashboard refreshed with live attendance updates.");
    loadDashboard().catch((e) => window.appUi.showToast(e.message, "error"));
  });
}

thresholdInput.addEventListener("change", () => loadDashboard().catch((e) => window.appUi.showToast(e.message, "error")));

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await window.appUi.initializeApp();
    setupRealtimeRefresh();
    await loadDashboard();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

window.addEventListener("beforeunload", () => realtimeSocket?.close());
