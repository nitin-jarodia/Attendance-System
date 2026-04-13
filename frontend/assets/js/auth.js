const loginForm = document.getElementById("login-form");

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const submitButton = loginForm.querySelector('button[type="submit"]');

  try {
    window.appUi.setButtonLoading(submitButton, true);
    const response = await window.apiClient.login({
      username: String(formData.get("username") || ""),
      password: String(formData.get("password") || ""),
    });
    window.appUi.setAuthState(response.access_token, response.user);
    const next = new URLSearchParams(window.location.search).get("next") || "dashboard.html";
    window.location.href = `/${next}`;
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  } finally {
    window.appUi.setButtonLoading(submitButton, false);
  }
});

document.querySelectorAll("[data-demo-login]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const role = btn.dataset.demoLogin;
    const credentials = {
      admin: { username: "admin", password: "admin1234" },
      teacher: { username: "admin", password: "admin1234" },
      principal: { username: "admin", password: "admin1234" },
    };
    const creds = credentials[role] || credentials.admin;

    try {
      window.appUi.setButtonLoading(btn, true);
      const response = await window.apiClient.login(creds);
      window.appUi.setAuthState(response.access_token, response.user);

      if (role !== response.user.role) {
        const switchResult = await window.apiClient.demoSwitchRole(role);
        window.appUi.setAuthState(switchResult.access_token, switchResult.user);
      }

      window.location.href = "/dashboard.html";
    } catch (error) {
      window.appUi.showToast(`Demo login failed: ${error.message}. Make sure the default admin account exists.`, "error");
    } finally {
      window.appUi.setButtonLoading(btn, false);
    }
  });
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await window.appUi.initializeApp();
    if (window.appUi.getStoredToken()) {
      window.location.href = "/dashboard.html";
    }
  } catch {
    window.appUi.clearAuthState();
  }
});
