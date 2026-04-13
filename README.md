# Attendance Management System

A production-style Tier 1 Attendance Management System built with FastAPI, MySQL, and a clean vanilla HTML/CSS/JavaScript frontend.

## Project Structure

```text
attendance system/
├── app/
│   ├── core/
│   │   └── config.py
│   ├── db/
│   │   └── database.py
│   ├── models/
│   │   ├── attendance.py
│   │   └── student.py
│   ├── routes/
│   │   ├── attendance_routes.py
│   │   └── student_routes.py
│   ├── schemas/
│   │   ├── attendance.py
│   │   └── student.py
│   ├── services/
│   │   ├── attendance_service.py
│   │   └── student_service.py
│   └── main.py
├── frontend/
│   ├── assets/
│   │   ├── css/
│   │   │   └── styles.css
│   │   └── js/
│   │       ├── api.js
│   │       ├── attendance.js
│   │       ├── common.js
│   │       ├── records.js
│   │       └── students.js
│   ├── attendance.html
│   ├── index.html
│   ├── records.html
│   └── students.html
├── sql/
│   └── schema.sql
├── .env.example
├── .gitignore
├── README.md
└── requirements.txt
```

## Features

- Student management with single add and bulk upload.
- Bulk parsing with trim support, duplicate protection, and invalid-line skipping.
- Attendance marking for `present`, `absent`, and `late`.
- One attendance record per student per date using update-on-conflict logic at the API layer and a unique constraint at the database layer.
- Date-based attendance records table with inline edit and safe delete.
- CSV export in `roll,name,status,date` format.
- Responsive frontend with instant success and error feedback.

## API Endpoints

- `POST /students/add`
- `POST /students/bulk`
- `GET /students`
- `POST /attendance/mark`
- `GET /attendance?date=YYYY-MM-DD`
- `PUT /attendance/update`
- `DELETE /attendance/delete`
- `GET /attendance/export?date=YYYY-MM-DD`

## Step-by-Step Run Guide

### 1. Open the project folder

Run:

```powershell
cd "C:\attendance system"
```

### 2. Start the MySQL service

On this machine the MySQL Windows service is `MySQL80`. Start it using an Administrator PowerShell:

```powershell
Start-Service MySQL80
```

To check that it is running:

```powershell
Get-Service MySQL80
```

If it shows `Running`, continue to the next step.

### 3. Create the MySQL database and tables

Open MySQL and run:

```sql
CREATE DATABASE IF NOT EXISTS attendance_management;
USE attendance_management;
SOURCE sql/schema.sql;
```

If `SOURCE sql/schema.sql;` does not work in your MySQL client, open `sql/schema.sql` and run its SQL statements manually.

### 4. Create the environment file

Run:

```powershell
Copy-Item .env.example .env
```

Then edit `.env` and set your real MySQL values, for example:

```env
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DB=attendance_management
```

### 5. Create a Python virtual environment

Run:

```powershell
python -m venv .venv
```

### 6. Activate the virtual environment

Run:

```powershell
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks script execution, run this once in the same terminal and then activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### 7. Install project dependencies

Run:

```powershell
pip install -r requirements.txt
```

### 8. Start the FastAPI server

Run:

```powershell
uvicorn app.main:app --reload
```

### 9. Open the application

Use these URLs in your browser:

- Main app: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

## Quick Commands Summary

Run these in order from PowerShell:

```powershell
cd "C:\attendance system"
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Run this first in an Administrator PowerShell if MySQL is not running:

```powershell
Start-Service MySQL80
```

## Frontend Run

The frontend is served directly by FastAPI from the `frontend/` folder, so no separate frontend server is needed.

## Notes

- The backend creates SQLAlchemy-managed tables on startup as a convenience, but `sql/schema.sql` is the explicit MySQL schema reference requested for the project.
- If startup fails with `Can't connect to MySQL server on '127.0.0.1'`, the MySQL service is usually stopped or the `.env` credentials are incorrect.
- Attendance uniqueness is enforced twice:
  - At the API/service layer by updating existing records for the same `roll_number` and `date`
  - At the database layer by the unique constraint on `(roll_number, date)`
