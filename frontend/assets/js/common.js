const STORAGE_KEYS = {
  token: "attendance_token",
  user: "attendance_user",
  sidebarPinned: "attendance_sidebar_pinned",
  darkMode: "attendance_dark_mode",
  defaultAttendanceMode: "attendance_default_mode",
  soundEnabled: "attendance_sound_enabled",
  language: "attendance_language",
};

let activeDialogCleanup = null;

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

function getPreference(key, fallback = null) {
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value;
}

function setPreference(key, value) {
  window.localStorage.setItem(key, String(value));
}

function isDesktopViewport() {
  return window.matchMedia("(min-width: 901px)").matches;
}

function getStoredToken() {
  return window.localStorage.getItem(STORAGE_KEYS.token);
}

function getStoredUser() {
  const rawValue = window.localStorage.getItem(STORAGE_KEYS.user);
  return rawValue ? JSON.parse(rawValue) : null;
}

function setAuthState(token, user) {
  window.localStorage.setItem(STORAGE_KEYS.token, token);
  window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

function clearAuthState() {
  window.localStorage.removeItem(STORAGE_KEYS.token);
  window.localStorage.removeItem(STORAGE_KEYS.user);
}

function redirectToLogin() {
  const currentPath = window.location.pathname.split("/").pop() || "dashboard.html";
  if (currentPath === "login.html") {
    return;
  }
  window.location.href = `/login.html?next=${encodeURIComponent(currentPath)}`;
}

function statusBadge(status) {
  return `<span class="badge ${status}">${escapeHtml(status)}</span>`;
}

function showToast(message, type = "success", options = {}) {
  const root = document.getElementById("toast-root");
  if (!root) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <p>${escapeHtml(message)}</p>
      ${
        options.actionLabel
          ? `<button class="toast-action" type="button">${escapeHtml(options.actionLabel)}</button>`
          : ""
      }
    </div>
  `;
  root.appendChild(toast);

  if (typeof options.onAction === "function") {
    toast.querySelector(".toast-action")?.addEventListener("click", async () => {
      await options.onAction();
      toast.remove();
    });
  }

  const timeout = window.setTimeout(() => {
    toast.remove();
  }, options.duration || 4000);

  toast.addEventListener("mouseenter", () => window.clearTimeout(timeout), { once: true });
}

function closeDialog() {
  activeDialogCleanup?.();
  activeDialogCleanup = null;
}

function showDialog({
  title,
  description = "",
  bodyHtml = "",
  actions = [],
}) {
  closeDialog();

  const dialogRoot = document.createElement("div");
  dialogRoot.className = "dialog-backdrop";
  dialogRoot.innerHTML = `
    <div class="dialog-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="dialog-header">
        <div>
          <h3>${escapeHtml(title)}</h3>
          ${description ? `<p class="section-copy">${escapeHtml(description)}</p>` : ""}
        </div>
        <button class="icon-button" type="button" aria-label="Close dialog">×</button>
      </div>
      <div class="dialog-body">${bodyHtml}</div>
      <div class="dialog-actions"></div>
    </div>
  `;

  const actionsContainer = dialogRoot.querySelector(".dialog-actions");
  actions.forEach((action, index) => {
    const button = document.createElement("button");
    button.type = action.submit ? "submit" : "button";
    button.className = `btn ${action.variant || "btn-secondary"}`;
    button.textContent = action.label;
    if (action.id) {
      button.dataset.actionId = action.id;
    }
    if (index === 0) {
      button.autofocus = true;
    }
    button.addEventListener("click", async () => {
      if (typeof action.onClick === "function") {
        const result = await action.onClick(dialogRoot);
        if (result === false) {
          return;
        }
      }
      if (!action.keepOpen) {
        closeDialog();
      }
    });
    actionsContainer.appendChild(button);
  });

  dialogRoot.querySelector(".icon-button")?.addEventListener("click", closeDialog);
  dialogRoot.addEventListener("click", (event) => {
    if (event.target === dialogRoot) {
      closeDialog();
    }
  });

  document.body.appendChild(dialogRoot);
  document.body.classList.add("dialog-open");
  activeDialogCleanup = () => {
    document.body.classList.remove("dialog-open");
    dialogRoot.remove();
  };

  return dialogRoot;
}

function setActiveNav() {
  const currentPath = window.location.pathname.split("/").pop() || "dashboard.html";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const isActive = link.getAttribute("href") === currentPath;
    link.classList.toggle("active", isActive);
    if (isActive) {
      document.querySelectorAll("[data-page-title]").forEach((node) => {
        node.textContent = link.dataset.label || link.textContent.trim();
      });
    }
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

function applyTheme() {
  const prefersDark = getPreference(STORAGE_KEYS.darkMode, "false") === "true";
  document.documentElement.classList.toggle("dark-mode", prefersDark);
}

function buildNavIcons() {
  const iconMap = {
    "dashboard.html": "⌂",
    "analytics.html": "◔",
    "students.html": "👥",
    "attendance.html": "✓",
    "records.html": "▤",
    "classes.html": "▣",
    "settings.html": "⚙",
  };
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.querySelector(".nav-icon")) {
      return;
    }
    const label = link.textContent.trim();
    const icon = iconMap[link.getAttribute("href")] || "•";
    link.dataset.label = label;
    link.innerHTML = `
      <span class="nav-icon" aria-hidden="true">${icon}</span>
      <span class="nav-label">${escapeHtml(label)}</span>
    `;
  });
}

function initializeSidebar() {
  const shell = document.querySelector(".shell-layout");
  const sidebar = document.querySelector(".sidebar");
  if (!shell || !sidebar || document.querySelector(".sidebar-hover-zone")) {
    return;
  }

  buildNavIcons();
  shell.classList.add("sidebar-collapsed");

  let pinned = getPreference(STORAGE_KEYS.sidebarPinned, "false") === "true";
  const hoverZone = document.createElement("button");
  hoverZone.type = "button";
  hoverZone.className = "sidebar-hover-zone";
  hoverZone.setAttribute("aria-label", "Open sidebar");

  const mobileToggle = document.createElement("button");
  mobileToggle.type = "button";
  mobileToggle.className = "mobile-menu-button";
  mobileToggle.setAttribute("aria-label", "Toggle navigation menu");
  mobileToggle.textContent = "☰";

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "sidebar-backdrop";
  backdrop.setAttribute("aria-label", "Close navigation");

  const pinButton = document.createElement("button");
  pinButton.type = "button";
  pinButton.className = "pin-sidebar-button";
  pinButton.setAttribute("aria-label", "Pin sidebar");
  pinButton.textContent = "📌";
  sidebar.prepend(pinButton);

  function syncSidebarState() {
    shell.classList.toggle("sidebar-expanded", pinned);
    shell.classList.toggle("sidebar-collapsed", !pinned);
    shell.classList.toggle("sidebar-pinned", pinned);
    pinButton.classList.toggle("active", pinned);
  }

  function expandSidebar() {
    if (!isDesktopViewport()) {
      return;
    }
    shell.classList.add("sidebar-expanded");
    shell.classList.remove("sidebar-collapsed");
  }

  function collapseSidebar() {
    if (!isDesktopViewport() || pinned) {
      return;
    }
    shell.classList.remove("sidebar-expanded");
    shell.classList.add("sidebar-collapsed");
  }

  pinButton.addEventListener("click", () => {
    pinned = !pinned;
    setPreference(STORAGE_KEYS.sidebarPinned, pinned);
    syncSidebarState();
  });

  hoverZone.addEventListener("mouseenter", expandSidebar);
  sidebar.addEventListener("mouseenter", expandSidebar);
  sidebar.addEventListener("mouseleave", collapseSidebar);

  mobileToggle.addEventListener("click", () => {
    shell.classList.toggle("sidebar-mobile-open");
  });

  backdrop.addEventListener("click", () => {
    shell.classList.remove("sidebar-mobile-open");
  });

  window.addEventListener("resize", () => {
    if (isDesktopViewport()) {
      shell.classList.remove("sidebar-mobile-open");
      syncSidebarState();
    }
  });

  document.body.append(hoverZone, mobileToggle, backdrop);
  syncSidebarState();
}

async function initializeApp() {
  applyTheme();
  setActiveNav();
  attachLogoutHandlers();
  initializeSidebar();

  if (document.body.dataset.publicPage === "true") {
    return { user: getStoredUser() };
  }

  if (!getStoredToken()) {
    redirectToLogin();
    return { user: null };
  }

  try {
    const user = await window.apiClient.getCurrentUser();
    window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
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
  applyTheme();
  setActiveNav();
  attachLogoutHandlers();
  initializeSidebar();
  renderCurrentUser(getStoredUser());
});

window.appUi = {
  clearAuthState,
  closeDialog,
  escapeHtml,
  getPreference,
  getStoredToken,
  getStoredUser,
  getTodayDate,
  initializeApp,
  redirectToLogin,
  renderPagination,
  setAuthState,
  setLoading,
  setPreference,
  showDialog,
  showToast,
  statusBadge,
  STORAGE_KEYS,
};
