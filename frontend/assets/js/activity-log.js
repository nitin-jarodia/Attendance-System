const activityFeed = document.getElementById("activity-feed");
const paginationContainer = document.getElementById("activity-pagination");
const filterActionType = document.getElementById("filter-action-type");
const filterPerformer = document.getElementById("filter-performer");

let currentPage = 1;
const PAGE_SIZE = 20;
let filterTimer = null;

function renderActivityFeed(data) {
  if (!data.items.length) {
    activityFeed.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        No activity yet. Actions will appear here as they happen.
      </div>`;
    return;
  }

  activityFeed.innerHTML = data.items.map((entry) => {
    const icon = window.appUi.activityIcon(entry.action_type);
    const time = window.appUi.relativeTime(entry.created_at);
    const changeHtml = entry.previous_value && entry.new_value
      ? `<div class="activity-change">
          <span class="old-value">${window.appUi.escapeHtml(entry.previous_value)}</span>
          <span class="arrow">→</span>
          <span style="color:var(--text);font-weight:600;">${window.appUi.escapeHtml(entry.new_value)}</span>
        </div>`
      : "";

    return `
      <div class="activity-entry">
        <div class="activity-icon">${icon}</div>
        <div class="activity-body">
          <strong>${window.appUi.escapeHtml(entry.details)}</strong>
          ${changeHtml}
          <span class="activity-time">🕐 ${time} · by ${window.appUi.escapeHtml(entry.performer_name)}${entry.performer_role ? ` (${entry.performer_role})` : ""}</span>
        </div>
      </div>`;
  }).join("");
}

async function loadActivityLog(page = 1) {
  currentPage = page;
  window.appUi.setLoading(activityFeed);

  try {
    const params = {
      page,
      page_size: PAGE_SIZE,
    };
    const actionType = filterActionType.value;
    const performer = filterPerformer.value.trim();
    if (actionType) params.action_type = actionType;
    if (performer) params.performer_name = performer;

    const data = await window.apiClient.getActivityLog(params);
    renderActivityFeed(data);
    window.appUi.renderPagination(paginationContainer, {
      total: data.total,
      page: data.page,
      page_size: data.page_size,
    }, loadActivityLog);
  } catch (err) {
    activityFeed.innerHTML = `<div class="empty-state">Failed to load activity log: ${window.appUi.escapeHtml(err.message)}</div>`;
  }
}

filterActionType.addEventListener("change", () => loadActivityLog(1));
filterPerformer.addEventListener("input", () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => loadActivityLog(1), 300);
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await window.appUi.initializeApp();
    await loadActivityLog();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
