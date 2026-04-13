CREATE DATABASE IF NOT EXISTS attendance_management;
USE attendance_management;

CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roll_number INT NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roll_number INT NOT NULL,
    date DATE NOT NULL,
    status ENUM('present', 'absent', 'late') NOT NULL,
    CONSTRAINT fk_attendance_student_roll
        FOREIGN KEY (roll_number) REFERENCES students(roll_number)
        ON DELETE CASCADE,
    CONSTRAINT uq_attendance_roll_date UNIQUE (roll_number, date)
);

CREATE INDEX idx_attendance_date ON attendance(date);
