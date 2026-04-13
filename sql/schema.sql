CREATE DATABASE IF NOT EXISTS attendance_management;
USE attendance_management;

CREATE TABLE IF NOT EXISTS classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roll_number INT NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    class_id INT NULL,
    CONSTRAINT fk_students_class_id
        FOREIGN KEY (class_id) REFERENCES classes(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roll_number INT NOT NULL,
    date DATE NOT NULL,
    status ENUM('present', 'absent', 'late') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_attendance_student_roll
        FOREIGN KEY (roll_number) REFERENCES students(roll_number)
        ON DELETE CASCADE,
    CONSTRAINT uq_attendance_roll_date UNIQUE (roll_number, date)
);

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

CREATE INDEX idx_students_class_id ON students(class_id);
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_attendance_status ON attendance(status);
CREATE INDEX idx_attendance_date_status ON attendance(date, status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_assigned_class_id ON users(assigned_class_id);
