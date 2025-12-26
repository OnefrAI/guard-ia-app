document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('app-loader').style.display = 'none';
    document.getElementById('app-content').classList.remove('hidden');
    document.getElementById('mainCalendarArea').classList.remove('hidden');
    initCalendar();
});

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DEFAULT_SHIFT_TYPES = { 'M': { label: 'Mañana', color: '#00ff88', hours: 8 }, 'T': { label: 'Tarde', color: '#ff9500', hours: 8 }, 'N': { label: 'Noche', color: '#5e5ce6', hours: 8 }, 'L': { label: 'Libre', color: '#64d2ff', hours: 0 } };
let SHIFT_TYPES = { ...DEFAULT_SHIFT_TYPES };

// Estado global limpio (Sin tareas antiguas)
const state = {
    currentDate: new Date(),
    selectedShiftType: null,
    shiftData: {},
    notes: {},
    cycles: [],
    calendars: {
        default: {
            name: 'Mi Calendario',
            shifts: {},
            notes: {},
            extraHours: {}
        }
    },
    activeCalendar: 'default',
    isEditMode: false,
    isBuildingCycle: false,
    cycleBuilder: [],
    touchStartX: 0,
    touchStartY: 0,
    customShifts: {}
};

function initCalendar() {
    loadActiveCalendar();
    loadCustomShifts();
    renderCalendar();
    setupEvents();
    loadData();
    setupNotifications();
}

function setupNotifications() {
    if ('serviceWorker' in navigator) {
        const swPath = window.location.pathname.includes('calendario-del-GUARD-IA')
            ? '../../sw.js'
            : '/sw.js';

        navigator.serviceWorker.register(swPath)
            .then(() => {
                console.log('[GUARDIA] Service Worker registrado');
                if ('Notification' in window && Notification.permission === 'default') {
                    setTimeout(() => {
                        Notification.requestPermission();
                    }, 3000);
                }
            })
            .catch((err) => {
                console.warn('[GUARDIA] SW error:', err);
            });
    }
}

function loadActiveCalendar() {
    if (state.calendars[state.activeCalendar]) {
        state.shiftData = state.calendars[state.activeCalendar].shifts || {};
        state.notes = state.calendars[state.activeCalendar].notes || {};
    }
}

function loadCustomShifts() {
    try {
        const saved = localStorage.getItem('guardia_custom_shifts');
        if (saved) {
            state.customShifts = JSON.parse(saved);
            SHIFT_TYPES = { ...DEFAULT_SHIFT_TYPES, ...state.customShifts };
        }
    } catch (e) { }
}

function saveCustomShifts() {
    localStorage.setItem('guardia_custom_shifts', JSON.stringify(state.customShifts));
    SHIFT_TYPES = { ...DEFAULT_SHIFT_TYPES, ...state.customShifts };
}

function renderCalendar() {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    document.getElementById('calendarTitle').textContent = MONTH_NAMES[month] + ' ' + year;

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDayOfWeek = firstDay.getDay();
    firstDayOfWeek = firstDayOfWeek === 0 ? 7 : firstDayOfWeek;

    const prevMonthDays = firstDayOfWeek - 1;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevMonthYear = month === 0 ? year - 1 : year;
    const prevMonthLastDay = new Date(prevMonthYear, prevMonth + 1, 0).getDate();

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dayCounter = 1 - prevMonthDays;

    for (let w = 0; w < 6; w++) {
        for (let d = 0; d < 7; d++) {
            let cellDate, dayNum, isCurrent = true;

            if (dayCounter < 1) {
                dayNum = prevMonthLastDay + dayCounter;
                cellDate = new Date(prevMonthYear, prevMonth, dayNum);
                isCurrent = false;
            } else if (dayCounter > daysInMonth) {
                dayNum = dayCounter - daysInMonth;
                const nm = month === 11 ? 0 : month + 1;
                const ny = month === 11 ? year + 1 : year;
                cellDate = new Date(ny, nm, dayNum);
                isCurrent = false;
            } else {
                dayNum = dayCounter;
                cellDate = new Date(year, month, dayNum);
            }

            const cell = createCell(cellDate, dayNum, isCurrent, today);
            grid.appendChild(cell);
            dayCounter++;
        }
    }
    renderNotesHistory();
}

function renderNotesHistory() {
    const container = document.getElementById('notesHistory');
    const fabTasksBtn = document.getElementById('fabTasksBtn');
    const tasksCountBadge = document.getElementById('tasksCountBadge');
    if (!container) return;

    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const monthNotes = [];
    let totalTasks = 0;

    Object.entries(state.notes).forEach(function (entry) {
        const dateStr = entry[0];
        const note = entry[1];
        const d = new Date(dateStr);
        if (d.getFullYear() === year && d.getMonth() === month) {
            const tasks = Array.isArray(note) ? note : [note];
            totalTasks += tasks.length;
            monthNotes.push({
                date: d,
                dateStr: dateStr,
                data: note
            });
        }
    });

    // Actualizar badge del FAB
    if (tasksCountBadge) {
        if (totalTasks > 0) {
            tasksCountBadge.textContent = totalTasks;
            tasksCountBadge.classList.remove('hidden');
            if (fabTasksBtn) fabTasksBtn.classList.add('has-tasks');
        } else {
            tasksCountBadge.classList.add('hidden');
            if (fabTasksBtn) fabTasksBtn.classList.remove('has-tasks');
        }
    }

    // Generar contenido del panel
    const monthName = MONTH_NAMES[month];
    let html = '<div class="notes-header">' +
        '<span><i class="fas fa-clipboard-list"></i> Tareas de ' + monthName + '</span>' +
        '<button class="notes-header-close" onclick="toggleTasksPanel()"><i class="fas fa-times"></i></button>' +
        '</div>';

    html += '<div class="notes-list">';

    if (monthNotes.length === 0) {
        html += '<div style="text-align:center;padding:3rem 1rem;color:var(--text-secondary)">' +
            '<i class="fas fa-calendar-check" style="font-size:3rem;opacity:0.3;margin-bottom:1rem;display:block"></i>' +
            '<p style="font-size:1rem;margin-bottom:0.5rem">Sin tareas este mes</p>' +
            '<p style="font-size:0.85rem;opacity:0.7">Pulsa en un día del calendario para añadir una tarea</p>' +
            '</div>';
    } else {
        monthNotes.sort(function (a, b) { return a.date - b.date; });

        monthNotes.forEach(function (item) {
            const dayNum = item.date.getDate();
            const dayName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][item.date.getDay()];
            const shift = state.shiftData[item.dateStr];

            // Soportar arrays de tareas
            const tasks = Array.isArray(item.data) ? item.data : [item.data];

            tasks.forEach(function (note, taskIdx) {
                // Determinar color de borde basado en etiqueta
                let borderColor = 'var(--accent-primary)';
                if (note.tag && note.tag.color) borderColor = note.tag.color;

                html += '<div class="note-item" style="border-left-color:' + borderColor + '" onclick="openTaskFromPanel(\'' + item.dateStr + '\', ' + taskIdx + ')">';

                // FECHA
                html += '<div class="note-date">';
                html += '<div class="note-day-badge" style="color:' + borderColor + '">' + dayNum + '</div>';
                html += '<div class="note-day-name">' + dayName + '</div>';
                if (shift && SHIFT_TYPES[shift]) {
                    html += '<span class="note-shift-badge" style="background:' + SHIFT_TYPES[shift].color + ';color:#000">' + shift + '</span>';
                }
                html += '</div>';

                // CONTENIDO EXPANDIDO
                html += '<div class="note-text-container">';

                if (note.tag) {
                    let tagText = note.tag.text;
                    if (note.tag.text === "HORAS EXTRA" && note.tag.hours) {
                        tagText = "EXTRA (" + note.tag.hours + "h)";
                    }
                    else if (note.tag.text === "JUICIO" && note.tag.details && note.tag.details.hora) {
                        tagText = "JUICIO " + note.tag.details.hora;
                    }
                    html += '<span style="font-size:0.7rem;font-weight:bold;color:#fff;background:' + note.tag.color + ';padding:2px 6px;border-radius:4px;margin-right:5px;display:inline-block;margin-bottom:4px">' + tagText + '</span>';
                }

                let displayTitle = note.title || '';
                if (displayTitle) html += '<div class="note-title">' + displayTitle + '</div>';

                // MOSTRAR TODOS LOS DETALLES DE LA TAREA
                if (note.tag && note.tag.text === 'JUICIO' && note.tag.details) {
                    const d = note.tag.details;
                    html += '<div class="note-details">';
                    if (d.juzgado) html += '<div class="note-detail-row"><i class="fas fa-gavel"></i> <strong>Juzgado:</strong> ' + d.juzgado + (d.sala ? ' - Sala ' + d.sala : '') + '</div>';
                    if (d.atestadoPol) html += '<div class="note-detail-row"><i class="fas fa-file-alt"></i> <strong>At. Policial:</strong> ' + d.atestadoPol + '</div>';
                    if (d.atestadoJud) html += '<div class="note-detail-row"><i class="fas fa-file-contract"></i> <strong>At. Judicial:</strong> ' + d.atestadoJud + '</div>';
                    if (d.notas) html += '<div class="note-detail-row note-detail-notes">' + d.notas + '</div>';
                    html += '</div>';
                } else if (note.description && note.description !== note.title) {
                    html += '<div class="note-preview-full">' + note.description + '</div>';
                }

                html += '</div>'; // Cierre note-text-container
                html += '</div>'; // Cierre note-item
            });
        });
    }

    html += '</div>'; // Cierre notes-list
    container.innerHTML = html;
}

// Función para abrir/cerrar el panel de tareas
function toggleTasksPanel() {
    const panel = document.getElementById('notesHistory');
    const overlay = document.getElementById('tasksPanelOverlay');
    if (panel && overlay) {
        panel.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

function showNoteFromHistory(dateStr) {
    // Cerrar panel de tareas antes de abrir la nota
    toggleTasksPanel();
    const d = new Date(dateStr);
    showNote(dateStr, d);
}

// Abrir tarea específica desde el panel lateral (directo al editor)
function openTaskFromPanel(dateStr, taskIdx) {
    toggleTasksPanel();
    const d = new Date(dateStr);
    const tasks = migrateNotesToArray(dateStr);
    const task = tasks[taskIdx] || null;
    showTaskEditor(dateStr, d, task, taskIdx);
}

function createCell(date, num, isCurr, today) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (!isCurr) cell.classList.add('other-month');
    if (date.getTime() === today.getTime()) cell.classList.add('current-day');

    const isPast = date < today;
    if (isPast && isCurr) cell.classList.add('past-day');

    const dateStr = formatDate(date);
    const shift = state.shiftData[dateStr];

    // Si hay turno, mostrar badge coloreado (sin colorear toda la casilla)
    if (shift && SHIFT_TYPES[shift]) {
        cell.classList.add('has-shift');

        const shiftBadge = document.createElement('div');
        shiftBadge.className = 'shift-type-badge';
        shiftBadge.textContent = shift;
        // Aplicar color del turno directamente al badge
        shiftBadge.style.backgroundColor = SHIFT_TYPES[shift].color;
        cell.appendChild(shiftBadge);
    }

    const dayDiv = document.createElement('div');
    dayDiv.className = 'day-number';
    dayDiv.textContent = num;
    cell.appendChild(dayDiv);

    // RENDERIZADO DE NOTAS Y ETIQUETAS (SOPORTE MULTI-TAREA)
    const noteData = state.notes[dateStr];
    const tasks = noteData ? (Array.isArray(noteData) ? noteData : [noteData]) : [];

    if (tasks.length > 0) {
        // Contenedor de píldoras múltiples
        const pillsContainer = document.createElement('div');
        pillsContainer.className = 'multi-pills-container';

        // Determinar cuántas mostrar (máximo 3)
        const maxPills = Math.min(tasks.length, 3);
        pillsContainer.classList.add('pills-' + maxPills);

        for (let i = 0; i < maxPills; i++) {
            const task = tasks[i];
            if (task.tag && task.tag.text) {
                const tagDiv = document.createElement('div');
                tagDiv.className = 'note-tag-pill';

                // Texto corto para píldoras pequeñas
                if (maxPills === 1) {
                    if (task.tag.text === "HORAS EXTRA" && task.tag.hours) {
                        tagDiv.textContent = "EXTRA (" + task.tag.hours + "h)";
                    }
                    else if (task.tag.text === "JUICIO" && task.tag.details && task.tag.details.hora) {
                        tagDiv.textContent = "JUICIO " + task.tag.details.hora;
                    }
                    else {
                        tagDiv.textContent = task.tag.text;
                    }
                } else {
                    // Texto más corto para cuando hay múltiples
                    if (task.tag.text === "HORAS EXTRA") {
                        tagDiv.textContent = task.tag.hours ? task.tag.hours + "h" : "EXTRA";
                    }
                    else if (task.tag.text === "JUICIO") {
                        tagDiv.textContent = task.tag.details && task.tag.details.hora ? task.tag.details.hora : "JUICIO";
                    }
                    else {
                        // Acortar texto largo
                        tagDiv.textContent = task.tag.text.length > 6 ? task.tag.text.substring(0, 5) + '…' : task.tag.text;
                    }
                }

                tagDiv.style.backgroundColor = task.tag.color || '#ef4444';
                pillsContainer.appendChild(tagDiv);
            }
        }

        // Si hay más de 3, mostrar indicador pequeño
        if (tasks.length > 3) {
            const moreDiv = document.createElement('div');
            moreDiv.className = 'pills-more-indicator';
            moreDiv.textContent = '+' + (tasks.length - 3);
            pillsContainer.appendChild(moreDiv);
        }

        cell.appendChild(pillsContainer);
    }

    // LÓGICA DE CLICK UNIFICADA (ESTO ES LO NUEVO)
    if (isCurr) {
        cell.onclick = function () {
            // Si estamos en modo EDICIÓN (botón lápiz activo) -> PINTAMOS
            if (state.isEditMode) {
                if (state.selectedShiftType) {
                    setShift(dateStr, state.selectedShiftType);
                } else {
                    showToast('Selecciona un turno primero');
                }
            }
            // Si estamos en modo NORMAL (sin lápiz) -> ABRIMOS NOTA CON 1 CLIC
            else {
                showNote(dateStr, date);
            }
        };
    }

    return cell;
}

function formatDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function setShift(dateStr, type) {
    if (type === 'erase') delete state.shiftData[dateStr]; else state.shiftData[dateStr] = type;
    saveData();
    renderCalendar();
}

// Helper para obtener label del dropdown personalizado
function getDropdownLabel(value) {
    switch (value) {
        case 'JUICIO': return '⚖️ JUICIO';
        case 'CURSO': return '📚 CURSO';
        case 'EXTRA': return '⏱️ HORAS EXTRA';
        case 'CUSTOM': return '✏️ Crear MI tarea...';
        default: return '-- Nota simple --';
    }
}

// Helper para migrar datos antiguos (objeto único) a nuevo formato (array)
function migrateNotesToArray(dateStr) {
    const existing = state.notes[dateStr];
    if (!existing) return [];
    if (Array.isArray(existing)) return existing;
    return [existing]; // Migrar objeto antiguo a array
}

// SISTEMA MULTI-TAREA: Mostrar lista de tareas del día
function showNote(dateStr, date) {
    const tasks = migrateNotesToArray(dateStr);

    const m = document.createElement('div');
    m.className = 'modal-overlay visible';
    m.id = 'dayTasksModal';

    let html = '<div class="modal-content" style="max-width:500px">' +
        '<h3 class="text-lg font-bold mb-3">📅 Día ' + date.getDate() + ' - Tareas</h3>';

    if (tasks.length > 0) {
        html += '<div class="mb-4" style="max-height:250px;overflow-y:auto">';
        tasks.forEach(function (task, idx) {
            const tagText = task.tag ? task.tag.text : 'Nota';
            const tagColor = task.tag ? task.tag.color : '#888';
            let displayText = task.title || tagText;

            if (task.tag && task.tag.text === 'HORAS EXTRA' && task.tag.hours) {
                displayText = 'EXTRA (' + task.tag.hours + 'h)';
            } else if (task.tag && task.tag.text === 'JUICIO' && task.tag.details && task.tag.details.hora) {
                displayText = 'JUICIO ' + task.tag.details.hora;
            }

            html += '<div class="flex items-center gap-2 p-3 mb-2 rounded-lg" style="background:var(--bg-tertiary);border-left:4px solid ' + tagColor + '">' +
                '<div class="flex-1">' +
                '<span style="color:' + tagColor + ';font-weight:bold">' + displayText + '</span>' +
                (task.description ? '<div class="text-xs text-gray-400 mt-1">' + task.description.substring(0, 50) + (task.description.length > 50 ? '...' : '') + '</div>' : '') +
                '</div>' +
                '<button class="btn-icon btn-secondary edit-task-btn" data-idx="' + idx + '" style="width:2rem;height:2rem"><i class="fas fa-edit"></i></button>' +
                '<button class="btn-icon btn-danger del-task-btn" data-idx="' + idx + '" style="width:2rem;height:2rem"><i class="fas fa-trash"></i></button>' +
                '</div>';
        });
        html += '</div>';
    } else {
        html += '<p class="text-center text-gray-400 mb-4 py-6">No hay tareas para este día<br><small>Pulsa el botón para añadir una</small></p>';
    }

    html += '<div class="modal-actions">' +
        '<button id="addNewTask" class="btn btn-primary"><i class="fas fa-plus"></i> Nueva Tarea</button>' +
        '<button id="closeTasksModal" class="btn btn-secondary">Cerrar</button>' +
        '</div></div>';

    m.innerHTML = html;
    document.body.appendChild(m);

    document.getElementById('closeTasksModal').onclick = function () { document.body.removeChild(m); };
    m.onclick = function (e) { if (e.target === m) document.body.removeChild(m); };

    document.getElementById('addNewTask').onclick = function () {
        document.body.removeChild(m);
        showTaskEditor(dateStr, date, null, -1);
    };

    document.querySelectorAll('.edit-task-btn').forEach(function (btn) {
        btn.onclick = function (e) {
            e.stopPropagation();
            const idx = parseInt(this.dataset.idx);
            document.body.removeChild(m);
            showTaskEditor(dateStr, date, tasks[idx], idx);
        };
    });

    document.querySelectorAll('.del-task-btn').forEach(function (btn) {
        btn.onclick = function (e) {
            e.stopPropagation();
            const idx = parseInt(this.dataset.idx);
            if (confirm('¿Borrar esta tarea?')) {
                tasks.splice(idx, 1);
                if (tasks.length > 0) {
                    state.notes[dateStr] = tasks;
                } else {
                    delete state.notes[dateStr];
                }
                saveData();
                renderCalendar();
                document.body.removeChild(m);
                if (tasks.length > 0) showNote(dateStr, date);
            }
        };
    });
}

// Editor de tarea individual
function showTaskEditor(dateStr, date, existingTask, editIdx) {
    const existing = existingTask || {};
    const existingTitle = (typeof existing.title === 'string') ? existing.title : '';
    // FIX: Ensure existingDesc is always a string, not an object
    const existingDesc = (typeof existing.description === 'string') ? existing.description :
        ((typeof existing.text === 'string') ? existing.text : '');
    const existingReminder = existing.reminder || 'none';
    const existingReminderTime = existing.reminderTime || '09:00';

    // Recuperar datos de etiqueta y detalles
    const tag = (existing && existing.tag) ? existing.tag : null;
    const savedTagText = tag ? tag.text : '';
    const savedTagColor = tag ? tag.color : '';
    const savedHours = (tag && tag.hours) ? tag.hours : '';
    const d = (tag && tag.details) ? tag.details : { juzgado: '', sala: '', atestadoPol: '', atestadoJud: '', hora: '', notas: '' };

    // Determinar selección
    let selectedOption = "";
    if (savedTagText === "JUICIO") selectedOption = "JUICIO";
    else if (savedTagText === "CURSO") selectedOption = "CURSO";
    else if (savedTagText === "HORAS EXTRA") selectedOption = "EXTRA";
    else if (savedTagText !== "") selectedOption = "CUSTOM";

    const m = document.createElement('div');
    m.className = 'modal-overlay visible';

    let html = '<div class="modal-content" style="max-width:500px">' +
        '<h3 class="text-lg font-bold mb-3">Nota del día ' + date.getDate() + '</h3>' +

        '<div class="mb-4 p-3 rounded-lg" style="background:var(--bg-tertiary);border:1px solid var(--border-primary)">' +
        '<label class="block mb-2 text-sm font-bold">🏷️ Etiqueta rápida:</label>' +
        '<input type="hidden" id="tagSelector" value="' + selectedOption + '">' +
        '<div class="custom-dropdown mb-2" id="tagDropdown">' +
        '<div class="custom-dropdown-trigger" id="tagDropdownTrigger">' +
        '<span id="tagDropdownText">' + getDropdownLabel(selectedOption) + '</span>' +
        '<i class="fas fa-chevron-down"></i>' +
        '</div>' +
        '<div class="custom-dropdown-menu" id="tagDropdownMenu">' +
        '<div class="custom-dropdown-item' + (selectedOption === '' ? ' selected' : '') + '" data-value="" style="color:#888">-- Nota simple --</div>' +
        '<div class="custom-dropdown-item' + (selectedOption === 'JUICIO' ? ' selected' : '') + '" data-value="JUICIO" style="background:#ef4444;color:#fff;border-radius:0">⚖️ JUICIO</div>' +
        '<div class="custom-dropdown-item' + (selectedOption === 'CURSO' ? ' selected' : '') + '" data-value="CURSO" style="background:#f97316;color:#fff;border-radius:0">📚 CURSO</div>' +
        '<div class="custom-dropdown-item' + (selectedOption === 'EXTRA' ? ' selected' : '') + '" data-value="EXTRA" style="background:#8b5cf6;color:#fff;border-radius:0">⏱️ HORAS EXTRA</div>' +
        '<div class="custom-dropdown-item' + (selectedOption === 'CUSTOM' ? ' selected' : '') + '" data-value="CUSTOM" style="background:#22c55e;color:#fff">✏️ Crear MI tarea...</div>' +
        '</div>' +
        '</div>' +

        // 1. ÁREA JUICIO
        '<div id="juicioArea" class="' + (selectedOption === 'JUICIO' ? '' : 'hidden') + ' mt-2 p-2 border-t border-gray-600 bg-gray-800 rounded">' +
        '<div class="grid grid-cols-2 gap-2 mb-2">' +
        '<input type="text" id="juzgado" class="form-input text-sm" placeholder="Juzgado" value="' + (d.juzgado || '') + '">' +
        '<input type="text" id="sala" class="form-input text-sm" placeholder="Sala" value="' + (d.sala || '') + '">' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-2 mb-2">' +
        '<input type="text" id="atestadoPol" class="form-input text-sm" placeholder="At. Policial" value="' + (d.atestadoPol || '') + '">' +
        '<input type="text" id="atestadoJud" class="form-input text-sm" placeholder="At. Judicial" value="' + (d.atestadoJud || '') + '">' +
        '</div>' +
        '<div class="mb-2">' +
        '<label class="text-xs font-bold text-gray-400">Hora:</label>' +
        '<input type="time" id="horaJuicio" class="form-input w-full" value="' + (d.hora || '09:00') + '">' +
        '</div>' +
        '<textarea id="notasJuicio" class="form-input w-full text-sm" rows="2" placeholder="Notas del juicio...">' + (d.notas || '') + '</textarea>' +
        '</div>' +

        // 2. ÁREA HORAS EXTRA
        '<div id="extraHoursArea" class="' + (selectedOption === 'EXTRA' ? '' : 'hidden') + ' mt-2 p-2 border-t border-gray-600 bg-gray-800 rounded">' +
        '<label class="text-sm font-bold block mb-1" style="color:#a78bfa">¿Cuántas horas?</label>' +
        '<input type="number" id="extraHoursInput" class="form-input" placeholder="Ej: 2.5" step="0.5" min="0" value="' + savedHours + '">' +
        '</div>' +

        // 3. ÁREA PERSONALIZADA
        '<div id="customTagArea" class="' + (selectedOption === 'CUSTOM' ? '' : 'hidden') + ' mt-2 p-2 border-t border-gray-600">' +
        '<label class="text-xs mb-1 block">Nombre y Color:</label>' +
        '<div class="flex gap-2">' +
        '<input type="text" id="customTagText" class="form-input flex-1" placeholder="Ej: Médico" value="' + (selectedOption === 'CUSTOM' ? savedTagText : '') + '">' +
        '<input type="color" id="customTagColor" class="form-input" style="width:50px;padding:2px" value="' + (savedTagColor || '#22c55e') + '">' +
        '</div>' +
        '</div>' +
        '</div>' +

        // --- CAMPOS GENERALES (TÍTULO Y DESCRIPCIÓN) ---
        // Se ocultan si es JUICIO
        '<div id="generalFields" class="' + (selectedOption === 'JUICIO' ? 'hidden' : '') + '">' +
        '<label class="block mb-2 text-sm font-bold">Título / Nota General:</label>' +
        '<input type="text" id="noteTitle" class="form-input w-full mb-3" placeholder="Resumen..." value="' + existingTitle.replace(/"/g, '&quot;') + '">' +

        '<label class="block mb-2 text-sm font-bold">Descripción:</label>' +
        '<textarea id="noteDescription" class="form-input w-full mb-3" rows="3">' + existingDesc.replace(/</g, '&lt;') + '</textarea>' +
        '</div>' +

        '<div class="mb-3 p-2 rounded-lg" style="border:1px solid var(--border-primary)">' +
        '<label class="text-sm font-bold flex items-center gap-2 mb-2"><i class="fas fa-bell text-yellow-500"></i> Recordatorio</label>' +
        '<div class="flex gap-2">' +
        '<select id="reminderType" class="form-select flex-1">' +
        '<option value="none" ' + (existingReminder === 'none' ? 'selected' : '') + '>No</option>' +
        '<option value="sameday" ' + (existingReminder === 'sameday' ? 'selected' : '') + '>El mismo día</option>' +
        '<option value="1day" ' + (existingReminder === '1day' ? 'selected' : '') + '>1 día antes</option>' +
        '</select>' +
        '<input type="time" id="reminderTime" class="form-input" style="width:100px" value="' + existingReminderTime + '" ' + (existingReminder === 'none' ? 'disabled' : '') + '>' +
        '</div>' +
        '</div>' +

        '<div class="modal-actions-triple">' +
        '<button id="saveNote" class="btn btn-primary"><i class="fas fa-save"></i> Guardar</button>' +
        '<button id="delNote" class="btn-icon btn-danger"><i class="fas fa-trash"></i></button>' +
        '<button id="cancelNote" class="btn btn-secondary">Cancelar</button>' +
        '</div></div>';

    m.innerHTML = html;
    document.body.appendChild(m);

    // Referencias DOM
    const selector = document.getElementById('tagSelector');
    const customArea = document.getElementById('customTagArea');
    const extraArea = document.getElementById('extraHoursArea');
    const juicioArea = document.getElementById('juicioArea');
    const generalFields = document.getElementById('generalFields');

    // Dropdown personalizado handlers
    const dropdownTrigger = document.getElementById('tagDropdownTrigger');
    const dropdownMenu = document.getElementById('tagDropdownMenu');
    const dropdownText = document.getElementById('tagDropdownText');
    const dropdownItems = document.querySelectorAll('.custom-dropdown-item');

    dropdownTrigger.onclick = function (e) {
        e.stopPropagation();
        dropdownTrigger.classList.toggle('open');
        dropdownMenu.classList.toggle('open');
    };

    // Cerrar dropdown al hacer clic fuera
    m.addEventListener('click', function (e) {
        if (!e.target.closest('.custom-dropdown')) {
            dropdownTrigger.classList.remove('open');
            dropdownMenu.classList.remove('open');
        }
    });

    dropdownItems.forEach(function (item) {
        item.onclick = function (e) {
            e.stopPropagation();
            const value = this.dataset.value;

            // Actualizar valor y texto
            selector.value = value;
            dropdownText.textContent = getDropdownLabel(value);

            // Actualizar selección visual
            dropdownItems.forEach(function (i) { i.classList.remove('selected'); });
            this.classList.add('selected');

            // Cerrar dropdown
            dropdownTrigger.classList.remove('open');
            dropdownMenu.classList.remove('open');

            // Actualizar visibilidad de áreas (misma lógica que antes)
            customArea.classList.add('hidden');
            extraArea.classList.add('hidden');
            juicioArea.classList.add('hidden');
            generalFields.classList.remove('hidden');

            if (value === 'CUSTOM') {
                customArea.classList.remove('hidden');
                document.getElementById('customTagText').focus();
            } else if (value === 'EXTRA') {
                extraArea.classList.remove('hidden');
                document.getElementById('extraHoursInput').focus();
            } else if (value === 'JUICIO') {
                juicioArea.classList.remove('hidden');
                generalFields.classList.add('hidden');
            }
        };
    });

    document.getElementById('reminderType').onchange = function () {
        document.getElementById('reminderTime').disabled = this.value === 'none';
    };

    document.getElementById('saveNote').onclick = function () {
        // Capturamos los generales (aunque estén ocultos)
        let title = document.getElementById('noteTitle').value.trim();
        const desc = document.getElementById('noteDescription').value.trim();
        const remType = document.getElementById('reminderType').value;
        const remTime = document.getElementById('reminderTime').value;
        const selValue = selector.value;

        let finalTag = null;

        if (selValue === "JUICIO") {
            // Si es juicio, ignoramos el título manual y usamos "Juicio" internamente
            title = "Juicio";
            finalTag = {
                text: "JUICIO",
                color: "#ef4444",
                details: {
                    juzgado: document.getElementById('juzgado').value,
                    sala: document.getElementById('sala').value,
                    atestadoPol: document.getElementById('atestadoPol').value,
                    atestadoJud: document.getElementById('atestadoJud').value,
                    hora: document.getElementById('horaJuicio').value,
                    notas: document.getElementById('notasJuicio').value
                }
            };
        }
        else if (selValue === "CURSO") finalTag = { text: "CURSO", color: "#f97316" };
        else if (selValue === "EXTRA") {
            const hoursVal = document.getElementById('extraHoursInput').value;
            const finalHours = hoursVal ? parseFloat(hoursVal) : 0;
            finalTag = { text: "HORAS EXTRA", color: "#8b5cf6", hours: finalHours };
        }
        else if (selValue === "CUSTOM") {
            const cText = document.getElementById('customTagText').value.trim();
            const cColor = document.getElementById('customTagColor').value;
            if (cText) finalTag = { text: cText, color: cColor };
        }

        // Guardamos como parte del array de tareas
        if (title || desc || finalTag) {
            const newTask = {
                id: editIdx >= 0 ? (existing.id || Date.now()) : Date.now(),
                title: title,
                description: desc,
                text: title,
                reminder: remType,
                reminderTime: remTime,
                tag: finalTag
            };

            let tasks = migrateNotesToArray(dateStr);
            if (editIdx >= 0) {
                tasks[editIdx] = newTask; // Actualizar existente
            } else {
                tasks.push(newTask); // Añadir nueva
            }
            state.notes[dateStr] = tasks;

            if (remType !== 'none') scheduleNotification(dateStr + '_' + newTask.id, date, title, desc, remType, remTime);
            else cancelNotification(dateStr + '_' + newTask.id);
        }

        saveData();
        renderCalendar();
        document.body.removeChild(m);
        showToast('✅ Tarea guardada');
        // Ya NO volver al modal de lista, ir directamente al calendario
    };

    document.getElementById('delNote').onclick = function () {
        document.body.removeChild(m);
        showNote(dateStr, date); // Volver a lista (borrar desde allí)
    };

    document.getElementById('cancelNote').onclick = function () {
        document.body.removeChild(m);
        // Ya NO volver al modal, ir al calendario
    };
    m.onclick = function (e) {
        if (e.target === m) {
            document.body.removeChild(m);
            // Ya NO volver al modal, ir al calendario
        }
    };
}

function setupShiftBtns() {
    const sel = document.getElementById('shiftSelector');
    sel.innerHTML = '';
    const panel = document.getElementById('floatingEditPanel');

    // Botones de Turnos
    Object.entries(SHIFT_TYPES).forEach(function (e) {
        const btn = document.createElement('button');
        btn.className = 'shift-button';
        btn.textContent = e[0]; // Solo la letra
        btn.style.backgroundColor = e[1].color;
        btn.style.color = '#000';
        btn.style.minWidth = '40px';
        btn.dataset.shiftType = e[0];

        btn.onclick = function () {
            state.selectedShiftType = e[0];
            updateBtns();
            // RETRAER MENÚ AUTOMÁTICAMENTE
            panel.classList.remove('active');
            showToast('Seleccionado: ' + e[1].label);
        };
        sel.appendChild(btn);
    });

    // Botón Borrar
    const eBtn = document.querySelector('[data-shift-type="erase"]');
    if (eBtn) {
        eBtn.onclick = function () {
            state.selectedShiftType = 'erase';
            updateBtns();
            panel.classList.remove('active');
            showToast('Modo Borrar');
        };
    }
}

function saveData() {
    state.calendars[state.activeCalendar].shifts = state.shiftData;
    state.calendars[state.activeCalendar].notes = state.notes;
    localStorage.setItem('guardia_calendars', JSON.stringify(state.calendars));
    localStorage.setItem('guardia_active', state.activeCalendar);
    localStorage.setItem('guardia_cycles', JSON.stringify(state.cycles));
}

function loadData() {
    try {
        const cals = localStorage.getItem('guardia_calendars');
        if (cals) state.calendars = JSON.parse(cals);
        const active = localStorage.getItem('guardia_active');
        if (active) state.activeCalendar = active;
        const c = localStorage.getItem('guardia_cycles');
        if (c) state.cycles = JSON.parse(c);
        loadActiveCalendar();
        updateCalendarSelector();
        renderCalendar();
    } catch (e) { }
}

function setupEvents() {
    document.getElementById('prevMonth').onclick = function () {
        state.currentDate.setMonth(state.currentDate.getMonth() - 1);
        renderCalendar();
    };
    document.getElementById('nextMonth').onclick = function () {
        state.currentDate.setMonth(state.currentDate.getMonth() + 1);
        renderCalendar();
    };
    document.getElementById('todayBtn').onclick = function () {
        state.currentDate = new Date();
        renderCalendar();
    };

    document.getElementById('datePickerBtn').onclick = showDatePicker;

    const themeBtn = document.getElementById('themeToggleBtn');
    updateThemeIcon();
    themeBtn.onclick = function () {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        updateThemeIcon();
    };

    const fab = document.getElementById('fabEditBtn');
    const panel = document.getElementById('floatingEditPanel');
    fab.classList.remove('hidden');

    fab.onclick = function () {
        state.isEditMode = !state.isEditMode;
        if (state.isEditMode) {
            fab.classList.add('edit-active');
            panel.classList.add('active');
        } else {
            fab.classList.remove('edit-active');
            panel.classList.remove('active');
            state.selectedShiftType = null;
            updateBtns();
        }
        renderCalendar();
    };

    document.getElementById('closeEditPanelBtn').onclick = function () {
        state.isEditMode = false;
        fab.classList.remove('edit-active');
        panel.classList.remove('active');
        state.selectedShiftType = null;
        updateBtns();
        renderCalendar();
    };

    setupShiftBtns();
    setupSidebar();
    setupSwipeGestures();

    // Configurar botón FAB de tareas
    const fabTasksBtn = document.getElementById('fabTasksBtn');
    const tasksPanelOverlay = document.getElementById('tasksPanelOverlay');

    if (fabTasksBtn) {
        fabTasksBtn.onclick = function () {
            toggleTasksPanel();
        };
    }

    if (tasksPanelOverlay) {
        tasksPanelOverlay.onclick = function () {
            toggleTasksPanel();
        };
    }
}

function showDatePicker() {
    const m = document.createElement('div');
    m.className = 'modal-overlay visible';

    const currentYear = state.currentDate.getFullYear();
    const currentMonth = state.currentDate.getMonth();

    let html = '<div class="modal-content" style="max-width:400px">';
    html += '<h3 class="text-lg font-bold mb-4 text-center">Ir a fecha</h3>';

    html += '<div class="flex items-center justify-center gap-3 mb-4">';
    html += '<button class="btn-icon btn-secondary" onclick="changeYear(-1)"><i class="fas fa-minus"></i></button>';
    html += '<span id="yearDisplay" class="text-2xl font-bold" style="min-width:100px;text-align:center">' + currentYear + '</span>';
    html += '<button class="btn-icon btn-secondary" onclick="changeYear(1)"><i class="fas fa-plus"></i></button>';
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-bottom:1rem">';
    MONTH_NAMES.forEach(function (monthName, idx) {
        const isSelected = idx === currentMonth && currentYear === parseInt(document.getElementById('yearDisplay')?.textContent || currentYear);
        html += '<button class="btn ' + (isSelected ? 'btn-primary' : 'btn-secondary') + '" onclick="selectMonth(' + idx + ')" style="padding:0.75rem">' + monthName.substring(0, 3) + '</button>';
    });
    html += '</div>';

    html += '<button class="btn btn-secondary w-full" onclick="closeModal(\'datePickerModal\')">Cerrar</button>';
    html += '</div>';

    m.id = 'datePickerModal';
    m.innerHTML = html;
    document.body.appendChild(m);
    m.onclick = function (e) { if (e.target === m) closeModal('datePickerModal'); };
}

function changeYear(delta) {
    const yearDisplay = document.getElementById('yearDisplay');
    const newYear = parseInt(yearDisplay.textContent) + delta;
    yearDisplay.textContent = newYear;
}

function selectMonth(monthIndex) {
    const yearDisplay = document.getElementById('yearDisplay');
    const year = parseInt(yearDisplay.textContent);
    state.currentDate = new Date(year, monthIndex, 1);
    renderCalendar();
    closeModal('datePickerModal');
}

function updateThemeIcon() {
    const btn = document.getElementById('themeToggleBtn');
    const isLight = document.body.classList.contains('light-mode');
    btn.innerHTML = isLight ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
}

function updateBtns() {
    document.querySelectorAll('.shift-button, .turno-btn').forEach(function (b) {
        const isShiftSelected = b.dataset.shiftType === state.selectedShiftType;
        if (isShiftSelected) b.classList.add('selected');
        else b.classList.remove('selected');
    });
}

function setupSidebar() {
    const ham = document.getElementById('hamburgerBtn');
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebarOverlay');
    const close = document.getElementById('closeSidebarBtn');

    function open() { sb.classList.add('active'); ov.classList.add('active'); }
    function closeSb() { sb.classList.remove('active'); ov.classList.remove('active'); }

    ham.onclick = open;
    close.onclick = closeSb;
    ov.onclick = closeSb;

    document.getElementById('manageCyclesBtn').onclick = function () {
        closeSb();
        showCyclesManager();
    };

    document.getElementById('manageCustomShiftsBtn').onclick = function () {
        closeSb();
        showCustomShiftsManager();
    };

    document.getElementById('btnStats').onclick = function () {
        closeSb();
        showStatistics();
    };

    document.getElementById('btnExportIcs').onclick = function () {
        closeSb();
        exportToICS();
    };

    document.getElementById('btnImportIcs').onclick = function () {
        closeSb();
        importFromICS();
    };

    document.getElementById('calendarSelector').onchange = function () {
        state.activeCalendar = this.value;
        loadActiveCalendar();
        renderCalendar();
    };

    document.getElementById('addCalendarBtn').onclick = function () {
        const name = document.getElementById('newCalendarName').value.trim();
        if (!name) { alert('Escribe un nombre'); return; }
        const id = 'cal_' + Date.now();
        state.calendars[id] = { name: name, shifts: {}, notes: {}, extraHours: {} };
        state.activeCalendar = id;
        loadActiveCalendar();
        updateCalendarSelector();
        saveData();
        renderCalendar();
        document.getElementById('newCalendarName').value = '';
        showToast('Calendario creado');
    };

    document.getElementById('deleteCalendarBtn').onclick = function () {
        if (state.activeCalendar === 'default') {
            alert('No puedes borrar el calendario principal');
            return;
        }
        if (confirm('¿Borrar este calendario?')) {
            delete state.calendars[state.activeCalendar];
            state.activeCalendar = 'default';
            loadActiveCalendar();
            updateCalendarSelector();
            saveData();
            renderCalendar();
            showToast('Calendario borrado');
        }
    };

    document.getElementById('clearAllShiftsBtn').onclick = function () {
        if (confirm('¿Borrar TODOS los turnos y notas del calendario actual?')) {
            state.shiftData = {};
            state.notes = {};
            saveData();
            renderCalendar();
            showToast('Calendario limpiado');
        }
    };

    document.getElementById('helpBtn').onclick = function () {
        closeSb();
        showHelp();
    };
}

function showCustomShiftsManager() {
    const m = document.createElement('div');
    m.id = 'customShiftsModal';
    m.className = 'modal-overlay visible';

    let html = '<div class="modal-content" style="max-width:600px;max-height:80vh;overflow-y:auto;">';
    html += '<h3 class="text-xl font-bold mb-4"><i class="fas fa-palette"></i> Mis Turnos Personalizados</h3>';

    html += '<div class="mb-4 p-3 rounded-lg" style="background:var(--bg-tertiary);border:1px solid var(--border-primary)">';
    html += '<h4 class="font-bold mb-2 text-sm">Turnos por Defecto</h4>';
    html += '<div class="flex gap-2 flex-wrap">';
    Object.entries(DEFAULT_SHIFT_TYPES).forEach(function (e) {
        html += '<span class="px-3 py-1 rounded text-sm font-bold" style="background:' + e[1].color + ';color:#000">';
        html += e[0] + ' - ' + e[1].label + ' (' + e[1].hours + 'h)</span>';
    });
    html += '</div></div>';

    if (Object.keys(state.customShifts).length === 0) {
        html += '<p class="text-center mb-4" style="color:var(--text-secondary)">No tienes turnos personalizados</p>';
    } else {
        html += '<div class="mb-4">';
        html += '<h4 class="font-bold mb-2 text-sm">Tus Turnos Personalizados</h4>';
        Object.entries(state.customShifts).forEach(function (e) {
            html += '<div class="mb-2 p-2 rounded-lg flex justify-between items-center" style="background:var(--bg-tertiary);border:1px solid var(--border-primary)">';
            html += '<span class="px-3 py-1 rounded font-bold" style="background:' + e[1].color + ';color:#000">';
            html += e[0] + ' - ' + e[1].label + ' (' + e[1].hours + 'h)</span>';
            html += '<div class="flex gap-1">';
            html += '<button class="btn-icon btn-secondary" onclick="editCustomShift(\'' + e[0] + '\')"><i class="fas fa-edit"></i></button>';
            html += '<button class="btn-icon btn-danger" onclick="deleteCustomShift(\'' + e[0] + '\')"><i class="fas fa-trash"></i></button>';
            html += '</div></div>';
        });
        html += '</div>';
    }

    html += '<button class="btn btn-primary w-full mt-3" onclick="createCustomShift()"><i class="fas fa-plus"></i> Crear Nuevo Turno</button>';
    html += '<button class="btn btn-secondary w-full mt-2" onclick="closeModal(\'customShiftsModal\')">Cerrar</button>';
    html += '</div>';

    m.innerHTML = html;
    document.body.appendChild(m);
    m.onclick = function (e) { if (e.target === m) closeModal('customShiftsModal'); };
}

function createCustomShift() {
    closeModal('customShiftsModal');
    const m = document.createElement('div');
    m.id = 'createShiftModal';
    m.className = 'modal-overlay visible';

    let html = '<div class="modal-content" style="max-width:500px">';
    html += '<h3 class="text-lg font-bold mb-3"><i class="fas fa-plus"></i> Crear Turno Personalizado</h3>';

    html += '<label class="block mb-2 text-sm font-bold">Letra/Código (1-3 caracteres):</label>';
    html += '<input type="text" id="shiftCode" class="form-input w-full mb-3" placeholder="Ej: G, F, M12" maxlength="3">';

    html += '<label class="block mb-2 text-sm font-bold">Nombre del turno:</label>';
    html += '<input type="text" id="shiftLabel" class="form-input w-full mb-3" placeholder="Ej: Guardia 24h">';

    html += '<label class="block mb-2 text-sm font-bold">Duración (horas):</label>';
    html += '<input type="number" id="shiftHours" class="form-input w-full mb-3" min="0" max="24" value="8">';

    html += '<label class="block mb-2 text-sm font-bold">Color:</label>';
    html += '<div class="flex gap-2 mb-3 flex-wrap">';
    const colors = ['#00ff88', '#ff9500', '#5e5ce6', '#64d2ff', '#f43f5e', '#ec4899', '#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#84cc16'];
    colors.forEach(function (c) {
        html += '<button class="color-picker-btn" style="background:' + c + '" data-color="' + c + '" onclick="selectColor(\'' + c + '\')"></button>';
    });
    html += '</div>';
    html += '<input type="color" id="shiftColor" class="form-input w-full mb-3" value="#00ff88">';

    html += '<div id="shiftPreview" class="p-3 rounded-lg mb-3 text-center" style="background:var(--bg-tertiary)">';
    html += '<span id="previewBadge" class="px-4 py-2 rounded font-bold text-lg" style="background:#00ff88;color:#000">?</span>';
    html += '</div>';

    html += '<div class="modal-actions">';
    html += '<button class="btn btn-primary" onclick="saveNewCustomShift()"><i class="fas fa-save"></i> Guardar</button>';
    html += '<button class="btn btn-secondary" onclick="closeModal(\'createShiftModal\');showCustomShiftsManager()">Cancelar</button>';
    html += '</div></div>';

    m.innerHTML = html;
    document.body.appendChild(m);

    document.getElementById('shiftCode').oninput = updateShiftPreview;
    document.getElementById('shiftColor').oninput = updateShiftPreview;
    updateShiftPreview();
}

function selectColor(color) {
    document.getElementById('shiftColor').value = color;
    updateShiftPreview();
    document.querySelectorAll('.color-picker-btn').forEach(function (btn) {
        if (btn.dataset.color === color) btn.classList.add('selected');
        else btn.classList.remove('selected');
    });
}

function updateShiftPreview() {
    const code = document.getElementById('shiftCode').value.toUpperCase() || '?';
    const color = document.getElementById('shiftColor').value;
    const preview = document.getElementById('previewBadge');
    if (preview) {
        preview.textContent = code;
        preview.style.background = color;
    }
}

function saveNewCustomShift() {
    const code = document.getElementById('shiftCode').value.toUpperCase().trim();
    const label = document.getElementById('shiftLabel').value.trim();
    const hours = parseInt(document.getElementById('shiftHours').value) || 8;
    const color = document.getElementById('shiftColor').value;

    if (!code || code.length > 3) { alert('El código debe tener 1-3 caracteres'); return; }
    if (!label) { alert('Pon un nombre al turno'); return; }
    if (DEFAULT_SHIFT_TYPES[code]) { alert('Este código está reservado'); return; }

    state.customShifts[code] = { label: label, color: color, hours: hours };
    saveCustomShifts();
    setupShiftBtns();
    closeModal('createShiftModal');
    showCustomShiftsManager();
    showToast('Turno creado: ' + code);
}

function editCustomShift(code) {
    const shift = state.customShifts[code];
    closeModal('customShiftsModal');

    const m = document.createElement('div');
    m.id = 'editShiftModal';
    m.className = 'modal-overlay visible';

    let html = '<div class="modal-content" style="max-width:500px">';
    html += '<h3 class="text-lg font-bold mb-3"><i class="fas fa-edit"></i> Editar: ' + code + '</h3>';

    html += '<label class="block mb-2 text-sm font-bold">Nombre:</label>';
    html += '<input type="text" id="shiftLabel" class="form-input w-full mb-3" value="' + shift.label + '">';

    html += '<label class="block mb-2 text-sm font-bold">Horas:</label>';
    html += '<input type="number" id="shiftHours" class="form-input w-full mb-3" min="0" max="24" value="' + shift.hours + '">';

    html += '<label class="block mb-2 text-sm font-bold">Color:</label>';
    html += '<input type="color" id="shiftColor" class="form-input w-full mb-3" value="' + shift.color + '">';

    html += '<div class="modal-actions">';
    html += '<button class="btn btn-primary" onclick="updateCustomShift(\'' + code + '\')"><i class="fas fa-save"></i> Guardar</button>';
    html += '<button class="btn btn-secondary" onclick="closeModal(\'editShiftModal\');showCustomShiftsManager()">Cancelar</button>';
    html += '</div></div>';

    m.innerHTML = html;
    document.body.appendChild(m);
}

function updateCustomShift(code) {
    const label = document.getElementById('shiftLabel').value.trim();
    const hours = parseInt(document.getElementById('shiftHours').value) || 8;
    const color = document.getElementById('shiftColor').value;

    if (!label) { alert('El nombre no puede estar vacío'); return; }

    state.customShifts[code] = { label: label, color: color, hours: hours };
    saveCustomShifts();
    setupShiftBtns();
    renderCalendar();
    closeModal('editShiftModal');
    showCustomShiftsManager();
    showToast('Turno actualizado');
}

function deleteCustomShift(code) {
    if (confirm('¿Borrar el turno "' + code + '"?')) {
        delete state.customShifts[code];
        saveCustomShifts();
        setupShiftBtns();
        renderCalendar();
        closeModal('customShiftsModal');
        showCustomShiftsManager();
        showToast('Turno eliminado');
    }
}

function updateCalendarSelector() {
    const sel = document.getElementById('calendarSelector');
    sel.innerHTML = '';
    Object.entries(state.calendars).forEach(function (e) {
        const opt = document.createElement('option');
        opt.value = e[0];
        opt.textContent = e[1].name;
        if (e[0] === state.activeCalendar) opt.selected = true;
        sel.appendChild(opt);
    });
}

function importFromICS() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics';

    input.onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const icsContent = event.target.result;
                parseICSAndImport(icsContent);
            } catch (error) {
                showToast('Error al leer el archivo');
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

function parseICSAndImport(icsContent) {
    const lines = icsContent.split('\n');
    let eventsImported = 0;
    let notesImported = 0;
    let currentEvent = null;

    lines.forEach(function (line) {
        line = line.trim();

        if (line === 'BEGIN:VEVENT') {
            currentEvent = {};
        } else if (line === 'END:VEVENT' && currentEvent) {
            if (currentEvent.date && currentEvent.summary) {
                const summary = currentEvent.summary.toUpperCase();
                let shiftCode = null;

                if (summary.includes('MAÑANA') || summary.includes('MANANA')) {
                    shiftCode = 'M';
                } else if (summary.includes('TARDE')) {
                    shiftCode = 'T';
                } else if (summary.includes('NOCHE')) {
                    shiftCode = 'N';
                } else if (summary.includes('LIBRE')) {
                    shiftCode = 'L';
                }

                if (shiftCode && SHIFT_TYPES[shiftCode]) {
                    state.shiftData[currentEvent.date] = shiftCode;
                    eventsImported++;
                }

                if (currentEvent.description || !shiftCode) {
                    state.notes[currentEvent.date] = {
                        title: currentEvent.summary.substring(0, 50),
                        description: currentEvent.description || '',
                        text: currentEvent.summary
                    };
                    notesImported++;
                }
            }
            currentEvent = null;
        } else if (currentEvent) {
            if (line.startsWith('DTSTART')) {
                const dateMatch = line.match(/(\d{4})(\d{2})(\d{2})/);
                if (dateMatch) {
                    currentEvent.date = dateMatch[1] + '-' + dateMatch[2] + '-' + dateMatch[3];
                }
            } else if (line.startsWith('SUMMARY:')) {
                currentEvent.summary = line.substring(8).trim();
            } else if (line.startsWith('DESCRIPTION:')) {
                currentEvent.description = line.substring(12).trim();
            }
        }
    });

    saveData();
    renderCalendar();

    let message = '';
    if (eventsImported > 0) message += eventsImported + ' turnos';
    if (notesImported > 0) {
        if (message) message += ' y ';
        message += notesImported + ' notas';
    }

    if (eventsImported > 0 || notesImported > 0) {
        showToast('¡Importados: ' + message + '!');
    } else {
        showToast('No se encontraron eventos');
    }
}

const saved = localStorage.getItem('theme');
if (saved === 'light') document.body.classList.add('light-mode');

function setupSwipeGestures() {
    const calendarArea = document.getElementById('mainCalendarArea');
    const calendarGrid = document.getElementById('calendarGrid');
    let startX = 0;
    let isDragging = false;

    calendarArea.addEventListener('touchstart', function (e) {
        if (state.isEditMode) return;
        startX = e.touches[0].clientX;
        isDragging = true;
    }, { passive: true });

    calendarArea.addEventListener('touchmove', function (e) {
        if (!isDragging || state.isEditMode) return;
        const diffX = startX - e.touches[0].clientX;
        if (Math.abs(diffX) > 20) {
            calendarGrid.classList.add('swipe-transition');
        }
    }, { passive: true });

    calendarArea.addEventListener('touchend', function (e) {
        if (!isDragging || state.isEditMode) return;
        isDragging = false;

        const endX = e.changedTouches[0].clientX;
        const diffX = startX - endX;

        calendarGrid.classList.remove('swipe-transition');

        if (Math.abs(diffX) > 60) {
            if (diffX > 0) {
                state.currentDate.setMonth(state.currentDate.getMonth() + 1);
            } else {
                state.currentDate.setMonth(state.currentDate.getMonth() - 1);
            }
            renderCalendar();
        }
    }, { passive: true });
}

function showCyclesManager() {
    const m = document.createElement('div');
    m.id = 'cyclesModal';
    m.className = 'modal-overlay visible';

    let html = '<div class="modal-content" style="max-width:600px;max-height:80vh;overflow-y:auto;">';
    html += '<h3 class="text-xl font-bold mb-4"><i class="fas fa-sync"></i> Mis Ciclos de Turno</h3>';

    if (state.cycles.length === 0) {
        html += '<p class="text-center mb-4" style="color:var(--text-secondary)">No tienes ciclos guardados</p>';
    } else {
        state.cycles.forEach(function (cycle, idx) {
            html += '<div class="mb-3 p-3 rounded-lg" style="background:var(--bg-tertiary);border:1px solid var(--border-primary)">';
            html += '<div class="flex justify-between items-start mb-2">';
            html += '<div><strong>' + cycle.name + '</strong><br><span class="text-xs" style="color:var(--text-secondary)">' + cycle.pattern.length + ' dias</span></div>';
            html += '<div class="flex gap-1">';
            html += '<button class="btn-icon btn-primary" onclick="applyCycle(' + idx + ')"><i class="fas fa-play"></i></button>';
            html += '<button class="btn-icon btn-secondary" onclick="editCycle(' + idx + ')"><i class="fas fa-edit"></i></button>';
            html += '<button class="btn-icon btn-danger" onclick="deleteCycle(' + idx + ')"><i class="fas fa-trash"></i></button>';
            html += '</div></div>';
            html += '<div class="flex gap-1 flex-wrap">';
            cycle.pattern.forEach(function (s) {
                if (SHIFT_TYPES[s]) {
                    html += '<span class="px-2 py-1 rounded text-xs font-bold" style="background:' + SHIFT_TYPES[s].color + ';color:#000">' + s + '</span>';
                }
            });
            html += '</div></div>';
        });
    }

    html += '<button class="btn btn-primary w-full mt-3" onclick="createNewCycle()"><i class="fas fa-plus"></i> Crear Nuevo Ciclo</button>';
    html += '<button class="btn btn-secondary w-full mt-2" onclick="closeModal(\'cyclesModal\')">Cerrar</button>';
    html += '</div>';

    m.innerHTML = html;
    document.body.appendChild(m);
    m.onclick = function (e) { if (e.target === m) closeModal('cyclesModal'); };
}

function createNewCycle() {
    closeModal('cyclesModal');
    const m = document.createElement('div');
    m.id = 'createCycleModal';
    m.className = 'modal-overlay visible';

    let html = '<div class="modal-content" style="max-width:500px">';
    html += '<h3 class="text-lg font-bold mb-3">Crear Ciclo</h3>';
    html += '<label class="block mb-2 text-sm font-bold">Nombre del ciclo:</label>';
    html += '<input type="text" id="cycleName" class="form-input w-full mb-3" placeholder="Ej: Turno 6x6">';
    html += '<label class="block mb-2 text-sm font-bold">Secuencia:</label>';
    html += '<div class="flex gap-2 mb-3 flex-wrap">';
    Object.entries(SHIFT_TYPES).forEach(function (e) {
        html += '<button class="btn" style="background:' + e[1].color + ';color:#000" onclick="addToCycle(\'' + e[0] + '\')">' + e[0] + '</button>';
    });
    html += '<button class="btn btn-danger" onclick="removeLastFromCycle()"><i class="fas fa-backspace"></i></button>';
    html += '</div>';
    html += '<div id="cyclePreview" class="p-3 rounded-lg mb-3" style="background:var(--bg-tertiary)">';
    html += '<div class="text-xs mb-1" style="color:var(--text-secondary)">Secuencia (0 dias):</div>';
    html += '<div id="cyclePatternDisplay" class="flex gap-1 flex-wrap"></div>';
    html += '</div>';
    html += '<div class="modal-actions">';
    html += '<button class="btn btn-primary" onclick="saveCycle()"><i class="fas fa-save"></i> Guardar</button>';
    html += '<button class="btn btn-secondary" onclick="cancelCycleCreation()">Cancelar</button>';
    html += '</div></div>';

    m.innerHTML = html;
    document.body.appendChild(m);
    state.cycleBuilder = [];
}

function addToCycle(shiftType) {
    state.cycleBuilder.push(shiftType);
    updateCyclePreview();
}

function removeLastFromCycle() {
    state.cycleBuilder.pop();
    updateCyclePreview();
}

function updateCyclePreview() {
    const display = document.getElementById('cyclePatternDisplay');
    const preview = document.getElementById('cyclePreview');
    if (!display) return;

    display.innerHTML = '';
    state.cycleBuilder.forEach(function (s) {
        if (SHIFT_TYPES[s]) {
            const span = document.createElement('span');
            span.className = 'px-2 py-1 rounded text-xs font-bold';
            span.style.background = SHIFT_TYPES[s].color;
            span.style.color = '#000';
            span.textContent = s;
            display.appendChild(span);
        }
    });

    preview.querySelector('.text-xs').textContent = 'Secuencia (' + state.cycleBuilder.length + ' dias):';
}

function saveCycle() {
    const name = document.getElementById('cycleName').value.trim();
    if (!name) { alert('Pon un nombre al ciclo'); return; }
    if (state.cycleBuilder.length === 0) { alert('Añade turnos'); return; }

    state.cycles.push({
        name: name,
        pattern: [...state.cycleBuilder]
    });

    saveData();
    closeModal('createCycleModal');
    showCyclesManager();
}

function cancelCycleCreation() {
    state.cycleBuilder = [];
    closeModal('createCycleModal');
    showCyclesManager();
}

function editCycle(idx) {
    const cycle = state.cycles[idx];
    closeModal('cyclesModal');

    const m = document.createElement('div');
    m.id = 'editCycleModal';
    m.className = 'modal-overlay visible';

    let html = '<div class="modal-content" style="max-width:500px">';
    html += '<h3 class="text-lg font-bold mb-3">Editar Ciclo</h3>';
    html += '<label class="block mb-2 text-sm font-bold">Nombre:</label>';
    html += '<input type="text" id="cycleName" class="form-input w-full mb-3" value="' + cycle.name + '">';
    html += '<label class="block mb-2 text-sm font-bold">Secuencia:</label>';
    html += '<div class="flex gap-2 mb-3 flex-wrap">';
    Object.entries(SHIFT_TYPES).forEach(function (e) {
        html += '<button class="btn" style="background:' + e[1].color + ';color:#000" onclick="addToCycle(\'' + e[0] + '\')">' + e[0] + '</button>';
    });
    html += '<button class="btn btn-danger" onclick="removeLastFromCycle()"><i class="fas fa-backspace"></i></button>';
    html += '</div>';
    html += '<div id="cyclePreview" class="p-3 rounded-lg mb-3" style="background:var(--bg-tertiary)">';
    html += '<div class="text-xs mb-1" style="color:var(--text-secondary)">Secuencia:</div>';
    html += '<div id="cyclePatternDisplay" class="flex gap-1 flex-wrap"></div></div>';
    html += '<div class="modal-actions">';
    html += '<button class="btn btn-primary" onclick="updateCycle(' + idx + ')"><i class="fas fa-save"></i> Guardar</button>';
    html += '<button class="btn btn-secondary" onclick="closeModal(\'editCycleModal\');showCyclesManager()">Cancelar</button>';
    html += '</div></div>';

    m.innerHTML = html;
    document.body.appendChild(m);

    state.cycleBuilder = [...cycle.pattern];
    updateCyclePreview();
}

function updateCycle(idx) {
    const name = document.getElementById('cycleName').value.trim();
    if (!name || state.cycleBuilder.length === 0) { alert('Completa los datos'); return; }

    state.cycles[idx] = {
        name: name,
        pattern: [...state.cycleBuilder]
    };

    saveData();
    closeModal('editCycleModal');
    showCyclesManager();
}

function deleteCycle(idx) {
    if (confirm('¿Borrar este ciclo?')) {
        state.cycles.splice(idx, 1);
        saveData();
        closeModal('cyclesModal');
        showCyclesManager();
    }
}

function applyCycle(idx) {
    const cycle = state.cycles[idx];
    closeModal('cyclesModal');

    const m = document.createElement('div');
    m.id = 'applyCycleModal';
    m.className = 'modal-overlay visible';

    const today = new Date();
    const todayStr = formatDate(today);

    let html = '<div class="modal-content" style="max-width:500px">';
    html += '<h3 class="text-lg font-bold mb-3">Aplicar: ' + cycle.name + '</h3>';
    html += '<div class="mb-3 p-3 rounded-lg" style="background:var(--bg-tertiary)">';
    html += '<div class="flex gap-1 flex-wrap">';
    cycle.pattern.forEach(function (s) {
        if (SHIFT_TYPES[s]) {
            html += '<span class="px-2 py-1 rounded text-xs font-bold" style="background:' + SHIFT_TYPES[s].color + ';color:#000">' + s + '</span>';
        }
    });
    html += '</div></div>';
    html += '<label class="block mb-2 text-sm font-bold">Día de inicio:</label>';
    html += '<input type="date" id="cycleStartDate" class="form-input w-full mb-3" value="' + todayStr + '">';
    html += '<label class="block mb-2 text-sm font-bold">Aplicar hasta:</label>';
    html += '<select id="cycleEndType" class="form-select w-full mb-3">';
    html += '<option value="3">3 meses</option>';
    html += '<option value="6">6 meses</option>';
    html += '<option value="12">12 meses</option>';
    html += '<option value="custom">Fecha personalizada</option>';
    html += '</select>';
    html += '<input type="date" id="cycleEndDate" class="form-input w-full mb-3 hidden">';
    html += '<div class="modal-actions">';
    html += '<button class="btn btn-primary" onclick="confirmApplyCycle(' + idx + ')"><i class="fas fa-check"></i> Aplicar</button>';
    html += '<button class="btn btn-secondary" onclick="closeModal(\'applyCycleModal\');showCyclesManager()">Cancelar</button>';
    html += '</div></div>';

    m.innerHTML = html;
    document.body.appendChild(m);

    document.getElementById('cycleEndType').onchange = function () {
        const custom = document.getElementById('cycleEndDate');
        if (this.value === 'custom') custom.classList.remove('hidden');
        else custom.classList.add('hidden');
    };
}

function confirmApplyCycle(idx) {
    const cycle = state.cycles[idx];
    const startDateStr = document.getElementById('cycleStartDate').value;
    if (!startDateStr) { alert('Selecciona fecha de inicio'); return; }

    const startDate = new Date(startDateStr + 'T00:00:00');
    let endDate;

    const endType = document.getElementById('cycleEndType').value;
    if (endType === 'custom') {
        const endDateStr = document.getElementById('cycleEndDate').value;
        if (!endDateStr) { alert('Selecciona fecha final'); return; }
        endDate = new Date(endDateStr + 'T00:00:00');
    } else {
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + parseInt(endType));
    }

    let currentDate = new Date(startDate);
    let patternIdx = 0;

    while (currentDate <= endDate) {
        const dateStr = formatDate(currentDate);
        state.shiftData[dateStr] = cycle.pattern[patternIdx];

        patternIdx = (patternIdx + 1) % cycle.pattern.length;
        currentDate.setDate(currentDate.getDate() + 1);
    }

    saveData();
    renderCalendar();
    closeModal('applyCycleModal');
    showToast('Ciclo aplicado');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) document.body.removeChild(m);
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () {
        if (toast.parentNode) document.body.removeChild(toast);
    }, 2500);
}

function showHelp() {
    const m = document.createElement('div');
    m.id = 'helpModal';
    m.className = 'modal-overlay visible';

    let html = '<div class="modal-content" style="max-width:600px;max-height:85vh;overflow-y:auto">';
    html += '<h3 class="text-xl font-bold mb-4 text-center">📘 Guía de Uso</h3>';

    // BLOQUE 1: PINTAR TURNOS
    html += '<div class="mb-4 p-3 rounded-lg" style="background:var(--bg-tertiary); border-left: 4px solid var(--accent-primary)">';
    html += '<h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-paint-roller"></i> 1. Asignar Turnos</h4>';
    html += '<ul class="text-sm ml-4 space-y-2" style="list-style:none">';
    html += '<li>🔵 Pulsa el botón flotante <i class="fas fa-edit mx-1" style="background:var(--accent-primary);color:black;padding:2px 5px;border-radius:50%"></i> abajo derecha.</li>';
    html += '<li>🔵 Selecciona un turno (ej: <b>M</b>, <b>T</b>, <b>N</b>).</li>';
    html += '<li>🔵 Toca los días en el calendario para pintarlos.</li>';
    html += '<li>🔵 <i>El menú se cierra solo para dejarte ver todo el mes.</i></li>';
    html += '</ul>';
    html += '</div>';

    // BLOQUE 2: NOTAS Y ETIQUETAS
    html += '<div class="mb-4 p-3 rounded-lg" style="background:var(--bg-tertiary); border-left: 4px solid #f59e0b">';
    html += '<h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-tags"></i> 2. Notas y Etiquetas</h4>';
    html += '<p class="text-sm mb-2">Haz <b>DOBLE CLICK</b> en cualquier día para abrir el menú detallado.</p>';
    html += '<div class="flex gap-2 mb-2">';
    html += '<span class="text-xs font-bold px-2 py-1 rounded bg-red-500 text-white">JUICIO</span>';
    html += '<span class="text-xs font-bold px-2 py-1 rounded bg-orange-500 text-white">CURSO</span>';
    html += '<span class="text-xs font-bold px-2 py-1 rounded bg-green-500 text-white">PERSONALIZADA</span>';
    html += '</div>';
    html += '<p class="text-sm text-gray-400">Elige una etiqueta rápida del desplegable para verla visualmente en el calendario.</p>';
    html += '</div>';

    // BLOQUE 3: HORAS EXTRA (DESTACADO)
    html += '<div class="mb-4 p-3 rounded-lg" style="background:rgba(139, 92, 246, 0.15); border: 1px solid #8b5cf6">';
    html += '<h4 class="font-bold mb-2 flex items-center gap-2" style="color:#a78bfa"><i class="fas fa-stopwatch"></i> 3. Control de Horas Extra</h4>';
    html += '<p class="text-sm mb-2">¿Has hecho horas de más? Regístralas así:</p>';
    html += '<ol class="text-sm ml-5 list-decimal space-y-1">';
    html += '<li>Haz doble click en el día.</li>';
    html += '<li>En "Etiqueta rápida", selecciona <b>HORAS EXTRA</b>.</li>';
    html += '<li>Escribe la cantidad (ej: 2.5).</li>';
    html += '<li>Dale a Guardar.</li>';
    html += '</ol>';
    html += '<p class="text-xs mt-2 text-center font-bold" style="color:#a78bfa">¡Se sumarán automáticamente en el panel de Estadísticas!</p>';
    html += '</div>';

    // BLOQUE 4: MENÚ LATERAL
    html += '<div class="mb-4 p-3 rounded-lg" style="background:var(--bg-tertiary); border-left: 4px solid var(--text-secondary)">';
    html += '<h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-bars"></i> 4. Más Opciones</h4>';
    html += '<p class="text-sm">Abre el menú lateral (arriba izquierda) para ver <b>Estadísticas</b>, crear <b>Ciclos</b> automáticos o hacer copias de seguridad.</p>';
    html += '</div>';

    html += '<button class="btn btn-primary w-full py-3 text-lg" onclick="closeModal(\'helpModal\')">¡Entendido, gracias!</button>';
    html += '</div>';

    m.innerHTML = html;
    document.body.appendChild(m);
    m.onclick = function (e) { if (e.target === m) closeModal('helpModal'); };
}
function showStatistics() {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();

    const stats = {};
    Object.keys(SHIFT_TYPES).forEach(function (key) {
        stats[key] = 0;
    });

    // 1. Contar turnos normales del mes
    Object.entries(state.shiftData).forEach(function (entry) {
        const d = new Date(entry[0]);
        if (d.getFullYear() === year && d.getMonth() === month) {
            if (stats[entry[1]] !== undefined) {
                stats[entry[1]]++;
            }
        }
    });

    // 2. Calcular horas de turnos normales
    let totalHours = 0;
    Object.entries(stats).forEach(function (entry) {
        if (SHIFT_TYPES[entry[0]]) {
            totalHours += entry[1] * SHIFT_TYPES[entry[0]].hours;
        }
    });

    // 3. CALCULAR HORAS EXTRA (NUEVO - Desde las notas)
    // Soporta tanto formato legacy (objeto único) como nuevo formato (array de tareas)
    let extraHoursTotal = 0;

    Object.entries(state.notes).forEach(function (entry) {
        const d = new Date(entry[0]);
        // Verificar si la nota es de este mes
        if (d.getFullYear() === year && d.getMonth() === month) {
            const noteData = entry[1];
            // Soportar arrays de tareas (nuevo formato) y objetos únicos (legacy)
            const tasks = Array.isArray(noteData) ? noteData : [noteData];

            tasks.forEach(function (task) {
                // Verificar si tiene la etiqueta correcta y horas guardadas
                if (task.tag && task.tag.text === "HORAS EXTRA" && task.tag.hours) {
                    extraHoursTotal += parseFloat(task.tag.hours);
                }
            });
        }
    });

    const m = document.createElement('div');
    m.id = 'statsModal';
    m.className = 'modal-overlay visible';

    let html = '<div class="modal-content" style="max-width:600px;max-height:85vh;overflow-y:auto">';
    html += '<h3 class="text-xl font-bold mb-4"><i class="fas fa-chart-pie"></i> Estadísticas</h3>';
    html += '<p class="text-sm mb-4" style="color:var(--text-secondary)">' + MONTH_NAMES[month] + ' ' + year + '</p>';

    // TARJETA DE TURNOS ORDINARIOS
    html += '<div class="mb-4 p-3 rounded-lg" style="background:var(--bg-tertiary)">';
    html += '<div class="text-2xl font-bold text-center mb-2">' + totalHours + ' horas</div>';
    html += '<div class="text-xs text-center" style="color:var(--text-secondary)">Turnos ordinarios</div>';
    html += '</div>';

    // TARJETA DE HORAS EXTRA (SOLO SI HAY)
    if (extraHoursTotal > 0) {
        html += '<div class="mb-4 p-4 rounded-lg flex items-center justify-between" style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4);">';
        html += '<div>';
        html += '<div class="text-3xl font-bold">+ ' + extraHoursTotal + ' h</div>';
        html += '<div class="text-sm opacity-90">Horas Extra Realizadas</div>';
        html += '</div>';
        html += '<i class="fas fa-stopwatch text-4xl opacity-50"></i>';
        html += '</div>';

        // Total Combinado
        html += '<div class="mb-4 p-2 text-center rounded border border-gray-700" style="background:rgba(0,255,0,0.05)">';
        html += '<span class="text-sm text-gray-400">TOTAL MENSUAL: </span>';
        html += '<span class="font-bold text-xl text-green-400 ml-2">' + (totalHours + extraHoursTotal) + ' h</span>';
        html += '</div>';
    }

    // LISTA DETALLADA
    html += '<div class="mb-4">';
    Object.entries(stats).forEach(function (entry) {
        if (SHIFT_TYPES[entry[0]] && entry[1] > 0) {
            const hours = entry[1] * SHIFT_TYPES[entry[0]].hours;
            html += '<div class="flex items-center justify-between mb-2 p-2 rounded" style="background:var(--bg-tertiary)">';
            html += '<div class="flex items-center gap-2">';
            html += '<span class="px-2 py-1 rounded font-bold text-sm" style="background:' + SHIFT_TYPES[entry[0]].color + ';color:#000">' + entry[0] + '</span>';
            html += '<span class="text-sm">' + SHIFT_TYPES[entry[0]].label + '</span>';
            html += '</div>';
            html += '<div class="text-right">';
            html += '<div class="font-bold">' + entry[1] + ' días</div>';
            html += '<div class="text-xs" style="color:var(--text-secondary)">' + hours + ' h</div>';
            html += '</div></div>';
        }
    });
    html += '</div>';

    html += '<canvas id="statsChart" width="400" height="300" class="mb-4"></canvas>';
    html += '<button class="btn btn-secondary w-full" onclick="closeModal(\'statsModal\')">Cerrar</button>';
    html += '</div>';

    m.innerHTML = html;
    document.body.appendChild(m);

    // GRÁFICO
    const ctx = document.getElementById('statsChart').getContext('2d');
    const labels = [];
    const data = [];
    const colors = [];

    Object.entries(stats).forEach(function (entry) {
        if (SHIFT_TYPES[entry[0]] && entry[1] > 0) {
            labels.push(SHIFT_TYPES[entry[0]].label);
            data.push(entry[1]);
            colors.push(SHIFT_TYPES[entry[0]].color);
        }
    });

    // Añadir quesito morado al gráfico si hay extras
    if (extraHoursTotal > 0) {
        labels.push('Extras (aprox)');
        // Representación visual aproximada (1 unidad por cada 8h extra)
        data.push(Math.max(1, Math.round(extraHoursTotal / 8)));
        colors.push('#8b5cf6');
    }

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#1a1a1a'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#ffffff', font: { size: 12 } }
                }
            }
        }
    });

    m.onclick = function (e) { if (e.target === m) closeModal('statsModal'); };
}

function exportToICS() {
    let icsContent = 'BEGIN:VCALENDAR\n';
    icsContent += 'VERSION:2.0\n';
    icsContent += 'PRODID:-//GUARD-IA//Calendario//ES\n';
    icsContent += 'X-WR-CALNAME:Turnos GUARD-IA\n';

    Object.entries(state.shiftData).forEach(function (entry) {
        if (SHIFT_TYPES[entry[1]]) {
            const date = new Date(entry[0] + 'T00:00:00');
            const dateFormatted = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');

            icsContent += 'BEGIN:VEVENT\n';
            icsContent += 'UID:' + entry[0] + '@guardia\n';
            icsContent += 'DTSTART;VALUE=DATE:' + dateFormatted + '\n';
            icsContent += 'SUMMARY:Turno ' + SHIFT_TYPES[entry[1]].label + '\n';
            icsContent += 'END:VEVENT\n';
        }
    });

    icsContent += 'END:VCALENDAR';

    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'turnos-guardia.ics';
    link.click();

    showToast('Archivo .ICS descargado');
}

function scheduleNotification(dateStr, date, title, description, reminderType, reminderTime) {
    if (!('Notification' in window)) return;

    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
        return;
    }

    try {
        const targetDate = new Date(date);
        const [hours, minutes] = reminderTime.split(':');
        targetDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        switch (reminderType) {
            case '1day':
                targetDate.setDate(targetDate.getDate() - 1);
                break;
            case '2days':
                targetDate.setDate(targetDate.getDate() - 2);
                break;
            case '1week':
                targetDate.setDate(targetDate.getDate() - 7);
                break;
        }

        const triggerTime = targetDate.getTime();

        if (triggerTime <= Date.now()) {
            showToast('La hora del recordatorio ya pasó');
            return;
        }

        const notificationData = {
            id: 'notif-' + dateStr,
            dateStr: dateStr,
            title: title || 'Recordatorio',
            description: description || '',
            triggerTime: triggerTime,
            sent: false,
            url: window.location.href
        };

        saveNotificationToIndexedDB(notificationData);

        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'CHECK_NOTIFICATIONS'
            });
        }

        showToast('¡Recordatorio programado!');
    } catch (error) {
        console.error('Error:', error);
    }
}

function cancelNotification(dateStr) {
    try {
        const notifId = 'notif-' + dateStr;
        const request = indexedDB.open('GuardiaNotifications', 1);

        request.onsuccess = (event) => {
            const db = event.target.result;
            if (db.objectStoreNames.contains('notifications')) {
                const transaction = db.transaction(['notifications'], 'readwrite');
                const store = transaction.objectStore('notifications');
                store.delete(notifId);
            }
        };
    } catch (error) { }
}

function saveNotificationToIndexedDB(notificationData) {
    try {
        const request = indexedDB.open('GuardiaNotifications', 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('notifications')) {
                db.createObjectStore('notifications', { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(['notifications'], 'readwrite');
            const store = transaction.objectStore('notifications');
            store.put(notificationData);
        };
    } catch (error) { }
}
