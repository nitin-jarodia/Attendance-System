USE attendance_management;

CREATE TABLE IF NOT EXISTS classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

ALTER TABLE students
    ADD COLUMN class_id INT NULL;

ALTER TABLE students
    ADD CONSTRAINT fk_students_class_id
    FOREIGN KEY (class_id) REFERENCES classes(id)
    ON DELETE SET NULL;

CREATE INDEX idx_students_class_id ON students(class_id);

ALTER TABLE attendance
    ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX idx_attendance_status ON attendance(status);
CREATE INDEX idx_attendance_date_status ON attendance(date, status);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    assigned_class_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_assigned_class
        FOREIGN KEY (assigned_class_id) REFERENCES classes(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_assigned_class_id ON users(assigned_class_id);
