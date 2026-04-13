const createClassForm = document.getElementById("create-class-form");
const classesTableBody = document.getElementById("classes-table-body");
const createUserForm = document.getElementById("create-user-form");
const usersTableBody = document.getElementById("users-table-body");
const assignedClassSelect = document.getElementById("new-assigned-class");
const roleSelect = document.getElementById("new-role");

let currentUser = null;
let classes = [];

function renderClassSelect() {
  if (!assignedClassSelect) {
    return;
  }
  assignedClassSelect.innerHTML = `
    <option value="">None</option>
    ${classes
      .map((classroom) => `<option value="${classroom.id}">${window.appUi.escapeHtml(classroom.name)}</option>`)
      .join("")}
  `;
}

function renderClasses() {
  if (!classes.length) {
    classesTableBody.innerHTML = `
      <tr>
        <td colspan="${currentUser?.role === "admin" ? 4 : 2}">
          <div class="empty-state">No classes have been created yet.</div>
        </td>
      </tr>
    `;
    return;
  }

  classesTableBody.innerHTML = classes
    .map(
      (classroom) => `
        <tr>
          <td>${window.appUi.escapeHtml(classroom.name)}</td>
          <td>${classroom.student_count}</td>
          ${
            currentUser?.role === "admin"
              ? `
                <td>
                  <div class="inline-actions">
                    <input class="input table-input class-name-input" data-class-id="${classroom.id}" value="${window.appUi.escapeHtml(
                      classroom.name
                    )}">
                    <button class="btn btn-secondary save-class-button" type="button" data-class-id="${classroom.id}">Save</button>
                  </div>
                </td>
                <td>
                  <button class="btn btn-danger delete-class-button" type="button" data-class-id="${classroom.id}">Delete</button>
                </td>
              `
              : ""
          }
        </tr>
      `
    )
    .join("");
}

async function loadClasses() {
  classes = await window.apiClient.getClasses();
  renderClassSelect();
  renderClasses();
}

async function loadUsers() {
  if (currentUser?.role !== "admin") {
    return;
  }

  const users = await window.apiClient.getUsers();
  usersTableBody.innerHTML = users.length
    ? users
        .map(
          (user) => `
            <tr>
              <td>${window.appUi.escapeHtml(user.username)}</td>
              <td>${window.appUi.escapeHtml(user.role)}</td>
              <td>${window.appUi.escapeHtml(user.assigned_class_name || "None")}</td>
              <td>${new Date(user.created_at).toLocaleString()}</td>
            </tr>
          `
        )
        .join("")
    : `
        <tr>
          <td colspan="4"><div class="empty-state">No users found.</div></td>
        </tr>
      `;
}

createClassForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(createClassForm);
    await window.apiClient.createClass({ name: String(formData.get("name") || "") });
    createClassForm.reset();
    await loadClasses();
    window.appUi.showToast("Class created successfully.");
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

createUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(createUserForm);
    await window.apiClient.createUser({
      username: String(formData.get("username") || ""),
      password: String(formData.get("password") || ""),
      role: String(formData.get("role") || "teacher"),
      assigned_class_id: formData.get("assigned_class_id") ? Number(formData.get("assigned_class_id")) : null,
    });
    createUserForm.reset();
    await loadUsers();
    window.appUi.showToast("User created successfully.");
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

roleSelect?.addEventListener("change", () => {
  const needsAssignedClass = roleSelect.value === "teacher";
  assignedClassSelect.required = needsAssignedClass;
});

classesTableBody.addEventListener("click", async (event) => {
  const saveButton = event.target.closest(".save-class-button");
  const deleteButton = event.target.closest(".delete-class-button");

  try {
    if (saveButton) {
      const classId = Number(saveButton.dataset.classId);
      const input = classesTableBody.querySelector(`.class-name-input[data-class-id="${classId}"]`);
      await window.apiClient.updateClass(classId, { name: input.value });
      await loadClasses();
      window.appUi.showToast("Class updated successfully.");
      return;
    }

    if (deleteButton) {
      const classId = Number(deleteButton.dataset.classId);
      await window.apiClient.deleteClass(classId);
      await loadClasses();
      await loadUsers();
      window.appUi.showToast("Class deleted successfully.");
    }
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const app = await window.appUi.initializeApp();
    currentUser = app.user;
    await loadClasses();
    await loadUsers();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
