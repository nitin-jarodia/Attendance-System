# Attendance Management System

A Tier 2 Attendance Management System built with FastAPI, MySQL, SQLAlchemy, and a vanilla HTML/CSS/JavaScript frontend.

## Tier 2 Highlights

- Class and section management with student-to-class assignment.
- JWT login with role-based access for `admin` and `teacher`.
- Dashboard analytics for total students, total classes, today's attendance, and recent activity.
- Student and attendance search/filter flows with pagination.
- Student-wise attendance analytics and low-attendance detection.
- Class-wise attendance analytics.
- Backward-compatible Tier 1 student and attendance APIs extended with optional filters.

## Project Structure

```text
attendance system/
├── app/
│   ├── auth/
│   ├── core/
│   ├── db/
│   ├── models/
│   ├── routes/
│   ├── schemas/
│   ├── services/
│   └── main.py
├── frontend/
│   ├── assets/
│   │   ├── css/
│   │   └── js/
│   ├── attendance.html
│   ├── classes.html
│   ├── dashboard.html
│   ├── login.html
│   ├── records.html
│   └── students.html
├── sql/
│   ├── schema.sql
│   └── tier2_upgrade.sql
├── .env.example
├── README.md
└── requirements.txt
```

## Core Features

### 1. Class Management

- Create, update, and delete classes.
- Assign students to classes.
- Restrict teachers to their assigned class.

### 2. Authentication and Roles

- `POST /auth/login` for JWT authentication.
- `admin` can manage classes, users, and students.
- `teacher` can view only their assigned class and work with attendance for that class.
- A default admin user is bootstrapped automatically when the system starts with an empty `users` table.

### 3. Dashboard and Analytics

- `GET /dashboard/summary`
- `GET /analytics/students`
- `GET /analytics/classes`

### 4. Search, Filters, and Pagination

- `GET /students/search`
- `GET /attendance/search`
- Students can be searched by name or roll number.
- Attendance can be filtered by date, class, status, and search term.

## Main API Endpoints

### Auth

- `POST /auth/login`
- `GET /auth/me`
- `GET /auth/users`
- `POST /auth/users`

### Classes

- `GET /classes`
- `POST /classes`
- `PUT /classes/{class_id}`
- `DELETE /classes/{class_id}`

### Students

- `POST /students/add`
- `POST /students/bulk`
- `GET /students`
- `GET /students/search`
- `PATCH /students/{roll_number}/class`

### Attendance

- `POST /attendance/mark`
- `GET /attendance`
- `GET /attendance/search`
- `PUT /attendance/update`
- `DELETE /attendance/delete`
- `GET /attendance/export`

## Database Schema

Tier 2 introduces:

- `classes`
- `users`
- `students.class_id`
- `attendance.created_at`
- `attendance.updated_at`

Use:

- `sql/schema.sql` for a fresh setup
- `sql/tier2_upgrade.sql` to upgrade an existing Tier 1 schema manually

The application also runs a safe startup schema upgrade helper for common Tier 2 changes.

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DB=attendance_management
JWT_SECRET_KEY=change-me-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=720
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=admin12345
```

## Run Instructions

### 1. Start MySQL

```powershell
Start-Service MySQL80
```

### 2. Create the database

```sql
CREATE DATABASE IF NOT EXISTS attendance_management;
```

### 3. Apply schema

For a new database:

```sql
SOURCE sql/schema.sql;
```

For an existing Tier 1 database:

```sql
SOURCE sql/tier2_upgrade.sql;
```

### 4. Create and activate the virtual environment

```powershell
cd "C:\attendance system"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 5. Install dependencies

```powershell
pip install -r requirements.txt
```

### 6. Start the app

```powershell
uvicorn app.main:app --reload
```

If `8000` is already in use on your machine, choose another port:

```powershell
uvicorn app.main:app --reload --port 8001
```

### 7. Open the app

- App: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Login: [http://127.0.0.1:8000/login.html](http://127.0.0.1:8000/login.html)

## Notes

- Existing Tier 1 endpoints are preserved and extended with optional filters rather than being replaced.
- Attendance uniqueness is still enforced by both service logic and the unique database constraint on `(roll_number, date)`.
- The database URL is now built safely, so MySQL passwords containing special characters work correctly.
