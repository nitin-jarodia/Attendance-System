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

        attendance_columns = {col["name"] for col in inspector.get_columns("attendance")}
        if "late_arrival_time" not in attendance_columns:
            connection.execute(text("ALTER TABLE attendance ADD COLUMN late_arrival_time DATETIME NULL"))
        if "previous_status" not in attendance_columns:
            connection.execute(text("ALTER TABLE attendance ADD COLUMN previous_status VARCHAR(20) NULL"))
        if "edited_by" not in attendance_columns:
            connection.execute(text("ALTER TABLE attendance ADD COLUMN edited_by VARCHAR(100) NULL"))
        if "edited_at" not in attendance_columns:
            connection.execute(text("ALTER TABLE attendance ADD COLUMN edited_at DATETIME NULL"))

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

        if "activity_logs" not in set(inspector.get_table_names()):
            connection.execute(
                text(
                    """
                    CREATE TABLE activity_logs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        action_type VARCHAR(50) NOT NULL DEFAULT '',
                        performed_by INT NOT NULL DEFAULT 0,
                        performer_name VARCHAR(100) NOT NULL DEFAULT '',
                        performer_role VARCHAR(20) NULL,
                        target_type VARCHAR(50) NULL,
                        target_id INT NULL,
                        target_name VARCHAR(100) NULL,
                        details TEXT NOT NULL,
                        previous_value VARCHAR(100) NULL,
                        new_value VARCHAR(100) NULL,
                        actor_username VARCHAR(100) NOT NULL DEFAULT '',
                        action VARCHAR(100) NOT NULL DEFAULT '',
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )

        inspector = inspect(connection)
        al_columns = {col["name"] for col in inspector.get_columns("activity_logs")}
        for col_name, col_def in [
            ("action_type", "VARCHAR(50) NOT NULL DEFAULT ''"),
            ("performed_by", "INT NOT NULL DEFAULT 0"),
            ("performer_name", "VARCHAR(100) NOT NULL DEFAULT ''"),
            ("performer_role", "VARCHAR(20) NULL"),
            ("target_type", "VARCHAR(50) NULL"),
            ("target_id", "INT NULL"),
            ("target_name", "VARCHAR(100) NULL"),
            ("previous_value", "VARCHAR(100) NULL"),
            ("new_value", "VARCHAR(100) NULL"),
        ]:
            if col_name not in al_columns:
                connection.execute(text(f"ALTER TABLE activity_logs ADD COLUMN {col_name} {col_def}"))

        inspector = inspect(connection)
        activity_indexes = inspector.get_indexes("activity_logs")
        if not _has_index(activity_indexes, "idx_activity_logs_actor"):
            connection.execute(text("CREATE INDEX idx_activity_logs_actor ON activity_logs(actor_username)"))
        if not _has_index(activity_indexes, "idx_activity_logs_action"):
            connection.execute(text("CREATE INDEX idx_activity_logs_action ON activity_logs(action)"))
        if not _has_index(activity_indexes, "idx_activity_logs_action_type"):
            connection.execute(text("CREATE INDEX idx_activity_logs_action_type ON activity_logs(action_type)"))
        if not _has_index(activity_indexes, "idx_activity_logs_created_at"):
            connection.execute(text("CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at)"))

        if "holidays" not in set(inspector.get_table_names()):
            connection.execute(
                text(
                    """
                    CREATE TABLE holidays (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        date DATE NOT NULL,
                        name VARCHAR(100) NOT NULL,
                        type VARCHAR(30) NOT NULL DEFAULT 'national',
                        is_recurring BOOLEAN DEFAULT FALSE,
                        academic_year VARCHAR(10) NULL,
                        created_by INT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )

        inspector = inspect(connection)
        if "holidays" in set(inspector.get_table_names()):
            holiday_indexes = inspector.get_indexes("holidays")
            if not _has_index(holiday_indexes, "idx_holidays_date"):
                connection.execute(text("CREATE INDEX idx_holidays_date ON holidays(date)"))

        if "academic_year_settings" not in set(inspector.get_table_names()):
            connection.execute(
                text(
                    """
                    CREATE TABLE academic_year_settings (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        year_label VARCHAR(10) NOT NULL,
                        start_date DATE NOT NULL,
                        end_date DATE NOT NULL,
                        is_active BOOLEAN DEFAULT TRUE,
                        weekends VARCHAR(20) DEFAULT 'saturday,sunday'
                    )
                    """
                )
            )

        if "reset_snapshots" not in set(inspector.get_table_names()):
            connection.execute(
                text(
                    """
                    CREATE TABLE reset_snapshots (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        actor_username VARCHAR(100) NOT NULL,
                        scope VARCHAR(50) NOT NULL,
                        target_date VARCHAR(20) NULL,
                        snapshot_data LONGTEXT NOT NULL,
                        expires_at DATETIME NOT NULL,
                        restored_at DATETIME NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )

        inspector = inspect(connection)
        snapshot_indexes = inspector.get_indexes("reset_snapshots")
        if not _has_index(snapshot_indexes, "idx_reset_snapshots_actor"):
            connection.execute(text("CREATE INDEX idx_reset_snapshots_actor ON reset_snapshots(actor_username)"))
        if not _has_index(snapshot_indexes, "idx_reset_snapshots_expires_at"):
            connection.execute(text("CREATE INDEX idx_reset_snapshots_expires_at ON reset_snapshots(expires_at)"))
