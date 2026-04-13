from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _has_index(indexes: list[dict], name: str) -> bool:
    return any(index.get("name") == name for index in indexes)


def _has_foreign_key(foreign_keys: list[dict], name: str) -> bool:
    return any(foreign_key.get("name") == name for foreign_key in foreign_keys)


def ensure_database_schema(engine: Engine) -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())

        if "classes" not in tables:
            connection.execute(
                text(
                    """
                    CREATE TABLE classes (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(100) NOT NULL UNIQUE
                    )
                    """
                )
            )

        inspector = inspect(connection)
        student_columns = {column["name"] for column in inspector.get_columns("students")}
        if "class_id" not in student_columns:
            connection.execute(text("ALTER TABLE students ADD COLUMN class_id INT NULL"))

        inspector = inspect(connection)
        student_indexes = inspector.get_indexes("students")
        if not _has_index(student_indexes, "idx_students_class_id"):
            connection.execute(text("CREATE INDEX idx_students_class_id ON students(class_id)"))

        student_foreign_keys = inspector.get_foreign_keys("students")
        if not _has_foreign_key(student_foreign_keys, "fk_students_class_id"):
            connection.execute(
                text(
                    """
                    ALTER TABLE students
                    ADD CONSTRAINT fk_students_class_id
                    FOREIGN KEY (class_id) REFERENCES classes(id)
                    ON DELETE SET NULL
                    """
                )
            )

        attendance_columns = {column["name"] for column in inspector.get_columns("attendance")}
        if "created_at" not in attendance_columns:
            connection.execute(
                text(
                    """
                    ALTER TABLE attendance
                    ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    """
                )
            )
        if "updated_at" not in attendance_columns:
            connection.execute(
                text(
                    """
                    ALTER TABLE attendance
                    ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP
                    """
                )
            )

        inspector = inspect(connection)
        attendance_indexes = inspector.get_indexes("attendance")
        if not _has_index(attendance_indexes, "idx_attendance_status"):
            connection.execute(text("CREATE INDEX idx_attendance_status ON attendance(status)"))
        if not _has_index(attendance_indexes, "idx_attendance_date_status"):
            connection.execute(text("CREATE INDEX idx_attendance_date_status ON attendance(date, status)"))

        if "users" not in set(inspector.get_table_names()):
            connection.execute(
                text(
                    """
                    CREATE TABLE users (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        username VARCHAR(100) NOT NULL UNIQUE,
                        password_hash VARCHAR(255) NOT NULL,
                        role VARCHAR(20) NOT NULL,
                        assigned_class_id INT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT fk_users_assigned_class
                            FOREIGN KEY (assigned_class_id) REFERENCES classes(id)
                            ON DELETE SET NULL
                    )
                    """
                )
            )

        inspector = inspect(connection)
        user_indexes = inspector.get_indexes("users")
        if not _has_index(user_indexes, "idx_users_role"):
            connection.execute(text("CREATE INDEX idx_users_role ON users(role)"))
        if not _has_index(user_indexes, "idx_users_assigned_class_id"):
            connection.execute(text("CREATE INDEX idx_users_assigned_class_id ON users(assigned_class_id)"))
