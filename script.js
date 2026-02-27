// ========== GLOBAL VARIABLES ==========
let students = [];                // will be populated from localStorage or default
let currentDate = '';
let presentStates = [];
let totalStudents = 0;

// DOM elements
const dateInput = document.getElementById('attendance-date');
const saveIndicator = document.getElementById('save-indicator');
const studentGrid = document.getElementById('student-grid');
const attendancePercentageSpan = document.getElementById('attendance-percentage');
const presentCountSpan = document.getElementById('present-count');
const totalStudentsSpan = document.getElementById('total-students');
const progressCircle = document.getElementById('progress-circle');
const markAllBtn = document.getElementById('mark-all-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const resetDayBtn = document.getElementById('reset-day-btn');

// Import elements
const showImportBtn = document.getElementById('show-import-btn');
const importPanel = document.getElementById('import-panel');
const studentDataInput = document.getElementById('student-data-input');
const importBtn = document.getElementById('import-btn');
const cancelImportBtn = document.getElementById('cancel-import-btn');

// ========== HELPER FUNCTIONS ==========
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getTodayString() {
  return formatDate(new Date());
}

// ========== DEFAULT STUDENT DATA ==========
const defaultStudents = [
  { roll: 101, name: "Alice Johnson" },
  { roll: 102, name: "Bob Smith" },
  { roll: 103, name: "Carol Davis" },
  { roll: 104, name: "David Brown" },
  { roll: 105, name: "Eva Green" }
];

// ========== LOCALSTORAGE FUNCTIONS ==========
function loadAttendanceFromStorage(date) {
  const key = `attendance_${date}`;
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse stored attendance', e);
      return null;
    }
  }
  return null;
}

function saveAttendanceToStorage(date, states) {
  const key = `attendance_${date}`;
  localStorage.setItem(key, JSON.stringify(states));
  localStorage.setItem('lastDate', date);
}

// Load students from localStorage or use default
function loadStudentsFromStorage() {
  const stored = localStorage.getItem('students');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse students', e);
      return null;
    }
  }
  return null;
}

function saveStudentsToStorage(studentsArray) {
  localStorage.setItem('students', JSON.stringify(studentsArray));
}

// ========== CUMULATIVE ATTENDANCE CALCULATION ==========
function getCumulativeAttendanceUpToDate(targetDate) {
  // targetDate is a string YYYY-MM-DD
  const allKeys = Object.keys(localStorage).filter(key => key.startsWith('attendance_'));
  const relevantKeys = allKeys.filter(key => {
    const dateStr = key.replace('attendance_', '');
    return dateStr <= targetDate;
  });

  // Initialize sums for each student
  const sums = new Array(students.length).fill(0);
  let dayCount = 0;

  relevantKeys.forEach(key => {
    const states = JSON.parse(localStorage.getItem(key));
    if (states && states.length === students.length) {
      dayCount++;
      states.forEach((present, idx) => {
        if (present) sums[idx] += 1;
      });
    }
  });

  // Calculate percentages
  const percentages = sums.map(sum => dayCount > 0 ? Math.round((sum / dayCount) * 100) : 0);
  return { percentages, dayCount };
}

// ========== UI UPDATE FUNCTIONS ==========
function updateSaveIndicator(saved = true) {
  if (saved) {
    saveIndicator.textContent = '✓ Saved';
    saveIndicator.classList.add('saved');
  } else {
    saveIndicator.textContent = '⏳ Not saved';
    saveIndicator.classList.remove('saved');
  }
}

function updatePercentage() {
  const presentCount = presentStates.filter(v => v).length;
  const percentage = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  // Animate number counting
  animateNumber(attendancePercentageSpan, attendancePercentageSpan.textContent, percentage, 300);

  presentCountSpan.textContent = presentCount;

  // Update progress ring
  const angle = (percentage / 100) * 360;
  progressCircle.parentElement.style.background = `conic-gradient(#3b82f6 ${angle}deg, #e2e8f0 ${angle}deg)`;
}

// Simple counting animation
function animateNumber(element, start, end, duration) {
  start = parseInt(start) || 0;
  const range = end - start;
  const increment = range / (duration / 10);
  let current = start;

  if (range === 0) return;

  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      current = end;
      clearInterval(timer);
    }
    element.textContent = Math.round(current);
  }, 10);
}

// Render student cards with cumulative percentages
function renderStudents() {
  if (!students.length) return;

  // Get cumulative percentages up to currentDate
  const { percentages, dayCount } = getCumulativeAttendanceUpToDate(currentDate);

  let html = '';
  presentStates.forEach((isPresent, index) => {
    const student = students[index];
    const cumPercent = percentages[index];
    html += `
      <div class="student-card stagger-item" style="animation-delay: ${index * 0.05}s">
        <div class="student-info">
          <h3>${student.name}</h3>
          <p>Roll No: ${student.roll}</p>
          <div class="cumulative-ring">
            <div class="mini-ring" style="background: conic-gradient(#3b82f6 ${cumPercent * 3.6}deg, #e2e8f0 ${cumPercent * 3.6}deg);"></div>
            <span>${cumPercent}% overall</span>
          </div>
        </div>
        <label class="checkbox-container">
          <input type="checkbox" class="student-checkbox" data-index="${index}" ${isPresent ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
      </div>
    `;
  });
  studentGrid.innerHTML = html;

  // Attach event listeners to new checkboxes
  document.querySelectorAll('.student-checkbox').forEach(cb => {
    cb.addEventListener('change', handleCheckboxChange);
  });
}

// ========== EVENT HANDLERS ==========
function handleCheckboxChange(e) {
  const index = e.target.dataset.index;
  presentStates[index] = e.target.checked;
  updatePercentage();
  saveAttendanceToStorage(currentDate, presentStates);
  updateSaveIndicator(true);
  // Re-render to update cumulative percentages (they may have changed because we added a new day)
  // But cumulative percentages are based on all days up to currentDate, and we just saved this day,
  // so we need to refresh the cumulative display.
  renderStudents(); // this will recalc cumulative and show new overall percentages
}

function handleDateChange() {
  const newDate = dateInput.value;
  if (!newDate) return;

  currentDate = newDate;

  // Load attendance for this date
  const storedStates = loadAttendanceFromStorage(currentDate);
  if (storedStates && storedStates.length === totalStudents) {
    presentStates = storedStates;
    updateSaveIndicator(true);
  } else {
    // No saved data: initialize all false
    presentStates = new Array(totalStudents).fill(false);
    updateSaveIndicator(false);
  }

  renderStudents();
  updatePercentage();
}

function markAllPresent() {
  presentStates = presentStates.map(() => true);
  renderStudents();
  updatePercentage();
  saveAttendanceToStorage(currentDate, presentStates);
  updateSaveIndicator(true);
}

function clearAll() {
  presentStates = presentStates.map(() => false);
  renderStudents();
  updatePercentage();
  saveAttendanceToStorage(currentDate, presentStates);
  updateSaveIndicator(true);
}

function resetDay() {
  presentStates = new Array(totalStudents).fill(false);
  renderStudents();
  updatePercentage();
  saveAttendanceToStorage(currentDate, presentStates);
  updateSaveIndicator(true);
}

// ========== IMPORT STUDENTS ==========
function parseStudentData(input) {
  const lines = input.trim().split('\n');
  const newStudents = [];
  lines.forEach(line => {
    line = line.trim();
    if (line === '') return;
    // Expect format: roll, name
    const parts = line.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      const roll = parseInt(parts[0]);
      if (!isNaN(roll)) {
        newStudents.push({ roll, name: parts.slice(1).join(', ') });
      }
    }
  });
  return newStudents;
}

function importStudents() {
  const rawData = studentDataInput.value;
  const newStudents = parseStudentData(rawData);
  if (newStudents.length === 0) {
    alert('No valid student data found. Please use format: roll, name (one per line)');
    return;
  }

  students = newStudents;
  totalStudents = students.length;
  presentStates = new Array(totalStudents).fill(false);
  saveStudentsToStorage(students);

  // Clear all attendance data (optional, but recommended to avoid mismatches)
  // We'll remove all attendance_ keys from localStorage
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('attendance_')) {
      localStorage.removeItem(key);
    }
  });
  localStorage.removeItem('lastDate');

  // Reset date to today
  currentDate = getTodayString();
  dateInput.value = currentDate;
  updateSaveIndicator(false);

  renderStudents();
  updatePercentage();

  // Hide import panel
  importPanel.classList.add('hidden');
  studentDataInput.value = '';
}

// ========== INITIALIZATION ==========
function init() {
  // Try to load students from localStorage, else use default
  const storedStudents = loadStudentsFromStorage();
  if (storedStudents && storedStudents.length > 0) {
    students = storedStudents;
  } else {
    students = [...defaultStudents];
    saveStudentsToStorage(students);
  }
  totalStudents = students.length;
  totalStudentsSpan.textContent = totalStudents;

  // Restore last viewed date or use today
  const lastDate = localStorage.getItem('lastDate');
  const today = getTodayString();
  currentDate = lastDate || today;

  // Set date input value
  dateInput.value = currentDate;

  // Load attendance for currentDate
  const storedStates = loadAttendanceFromStorage(currentDate);
  if (storedStates && storedStates.length === totalStudents) {
    presentStates = storedStates;
    updateSaveIndicator(true);
  } else {
    presentStates = new Array(totalStudents).fill(false);
    updateSaveIndicator(false);
  }

  renderStudents();
  updatePercentage();

  // Event listeners
  dateInput.addEventListener('change', handleDateChange);
  markAllBtn.addEventListener('click', markAllPresent);
  clearAllBtn.addEventListener('click', clearAll);
  resetDayBtn.addEventListener('click', resetDay);

  // Import panel toggle
  showImportBtn.addEventListener('click', () => {
    importPanel.classList.toggle('hidden');
  });
  cancelImportBtn.addEventListener('click', () => {
    importPanel.classList.add('hidden');
    studentDataInput.value = '';
  });
  importBtn.addEventListener('click', importStudents);
}

// Start the app
init();