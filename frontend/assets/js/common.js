function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, type = "success") {
  const root = document.getElementById("toast-root");
  if (!root) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<p>${escapeHtml(message)}</p>`;
  root.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3500);
}

function statusBadge(status) {
  return `<span class="badge ${status}">${escapeHtml(status)}</span>`;
}

function getStoredToken() {
  return window.localStorage.getItem("attendance_token");
}

function getStoredUser() {
  const rawValue = window.localStorage.getItem("attendance_user");
  return rawValue ? JSON.parse(rawValue) : null;
}

function setAuthState(token, user) {
  window.localStorage.setItem("attendance_token", token);
  window.localStorage.setItem("attendance_user", JSON.stringify(user));
}

function clearAuthState() {
  window.localStorage.removeItem("attendance_token");
  window.localStorage.removeItem("attendance_user");
}

function redirectToLogin() {
  const currentPath = window.location.pathname.split("/").pop() || "dashboard.html";
  if (currentPath === "login.html") {
    return;
  }
  window.location.href = `/login.html?next=${encodeURIComponent(currentPath)}`;
}

function setActiveNav() {
  const currentPath = window.location.pathname.split("/").pop() || "dashboard.html";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === currentPath);
  });
}

function renderCurrentUser(user) {
  document.querySelectorAll("[data-user-name]").forEach((element) => {
    element.textContent = user?.username || "Guest";
  });
  document.querySelectorAll("[data-user-role]").forEach((element) => {
    element.textContent = user?.role ? String(user.role).toUpperCase() : "";
  });
  document.querySelectorAll("[data-admin-only]").forEach((element) => {
    element.hidden = user?.role !== "admin";
  });
}

function attachLogoutHandlers() {
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      clearAuthState();
      window.location.href = "/login.html";
    });
  });
}

async function initializeApp() {
  setActiveNav();
  attachLogoutHandlers();

  if (document.body.dataset.publicPage === "true") {
    return { user: getStoredUser() };
  }

  if (!getStoredToken()) {
    redirectToLogin();
    return { user: null };
  }

  try {
    const user = await window.apiClient.getCurrentUser();
    window.localStorage.setItem("attendance_user", JSON.stringify(user));
    renderCurrentUser(user);
    return { user };
  } catch (error) {
    clearAuthState();
    redirectToLogin();
    throw error;
  }
}

function setLoading(target, message = "Loading...") {
  if (!target) {
    return;
  }
  target.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderPagination(container, meta, onPageChange) {
  if (!container || !meta) {
    return;
  }

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.page_size));
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button class="btn btn-secondary" type="button" ${meta.page <= 1 ? "disabled" : ""} data-page="${
      meta.page - 1
    }">Previous</button>
    <span class="pagination-meta">Page ${meta.page} of ${totalPages}</span>
    <button class="btn btn-secondary" type="button" ${
      meta.page >= totalPages ? "disabled" : ""
    } data-page="${meta.page + 1}">Next</button>
  `;

  container.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      onPageChange(Number(button.dataset.page));
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveNav();
  attachLogoutHandlers();
  renderCurrentUser(getStoredUser());
});

window.appUi = {
  clearAuthState,
  escapeHtml,
  getStoredToken,
  getStoredUser,
  getTodayDate,
  initializeApp,
  redirectToLogin,
  renderPagination,
  setAuthState,
  setLoading,
  showToast,
  statusBadge,
};
