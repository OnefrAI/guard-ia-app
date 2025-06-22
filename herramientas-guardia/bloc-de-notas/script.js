// Import necessary functions from the Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    query, 
    onSnapshot,
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// Import Firebase Storage for photo uploads AND deletion
import { 
    getStorage, 
    ref, 
    uploadString, 
    getDownloadURL,
    deleteObject 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// Your web app's Firebase configuration (same as the main app)
const firebaseConfig = {
    apiKey: "AIzaSyAf3I3_aW__lBtTVlEJ9xesIWkEJ6lMJp8",
    authDomain: "guard-ia-a36da.firebaseapp.com",
    projectId: "guard-ia-a36da",
    storageBucket: "guard-ia-a36da.appspot.com",
    messagingSenderId: "914018061004",
    appId: "1:914018061004:web:6ab6c6ca728199033bd069",
    measurementId: "G-W45Z1BH3T4"
};

// Initialize Firebase Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// DOM Elements
const noteForm = document.getElementById('noteForm');
const notesContainer = document.getElementById('notesContainer');
const generateReportButton = document.getElementById('generateReportButton');
const takePhotoButton = document.getElementById('takePhotoButton');
const saveNoteButton = document.getElementById('saveNoteButton');
const photoPreview = document.getElementById('photoPreview');
const authStateDiv = document.getElementById('auth-state');
const appContentDiv = document.getElementById('app-content');
const userInfoDiv = document.getElementById('user-info');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');

// NUEVAS REFERENCIAS PARA EL DESPLEGABLE DE ETIQUETAS
const tagsDropdownInput = document.getElementById('tagsDropdownInput');
const tagsDropdownOptions = document.getElementById('tagsDropdownOptions');
const selectedTagsDisplay = document.getElementById('selectedTagsDisplay');

// Camera Modal Elements
const cameraModal = document.getElementById('cameraModal');
const video = document.getElementById('video');
const captureButton = document.getElementById('captureButton');
const cancelCaptureButton = document.getElementById('cancelCaptureButton');

// Quill Editor initialization
const toolbarOptions = [
    ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
    ['blockquote', 'code-block'],
    [{ 'header': 1 }, { 'header': 2 }],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'script': 'sub'}, { 'script': 'super' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }],
    [{ 'direction': 'rtl' }],
    [{ 'size': ['small', false, 'large', 'huge'] }],
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'font': [] }],
    [{ 'align': [] }],
    ['link', 'image'],
    ['clean']
];

const quill = new Quill('#editor-container', {
    modules: {
        toolbar: toolbarOptions
    },
    theme: 'snow',
    placeholder: 'Escribe aquí los hechos y detalles de la intervención...',
});

// MAPA DE ETIQUETAS Y CLASES DE COLOR
const tagColorMap = {
    "Servicio de Sala": "tag-servicio-de-sala",
    "A requerimiento": "tag-a-requerimiento",
    "Por superioridad": "tag-por-superioridad",
    "Otros": "tag-otros"
};
let selectedTags = []; // Array para almacenar las etiquetas seleccionadas

// Global state
let mediaStream = null;
let capturedPhotoDataUrl = null;
let currentUserId = null;
let unsubscribeFromNotes = null;
let allNotes = []; // Variable global para almacenar todas las notas

// --- Authentication Handling ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        console.log(`Usuario autenticado: ${user.email}`);
        authStateDiv.classList.add('hidden');
        appContentDiv.classList.remove('hidden');
        userInfoDiv.textContent = `Conectado como: ${user.email}`;
        listenForNotes(); // Empieza a escuchar las notas una vez autenticado
    } else {
        currentUserId = null;
        console.error('Usuario no autenticado.');
        appContentDiv.classList.add('hidden');
        authStateDiv.classList.remove('hidden');
        authStateDiv.innerHTML = `<p>Debes iniciar sesión para usar el bloc de notas seguro. <a href="../../index.html">Volver a la página principal para iniciar sesión.</a></p>`;
        userInfoDiv.textContent = 'No conectado';
        if (unsubscribeFromNotes) {
            unsubscribeFromNotes(); // Deja de escuchar si el usuario se desautentica
        }
        notesContainer.innerHTML = "<p>Inicia sesión para ver tus notas guardadas en la nube.</p>";
        allNotes = []; // Limpiar notas si no hay usuario
    }
});

// --- Photo Upload Function ---
async function uploadPhoto(base64String) {
    if (!currentUserId) throw new Error("Usuario no autenticado para subir la foto.");
    const photoId = `note_photo_${Date.now()}`;
    const storageRef = ref(storage, `users/${currentUserId}/notes_photos/${photoId}.png`);
    console.log("Subiendo foto a Firebase Storage...");
    const snapshot = await uploadString(storageRef, base64String, 'data_url');
    console.log("Foto subida exitosamente.");
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log("URL de descarga obtenida.");
    return downloadURL;
}

// --- Firestore and Storage Functions ---

function listenForNotes() {
    if (!currentUserId) return;
    if (unsubscribeFromNotes) unsubscribeFromNotes(); // Asegurarse de que solo haya un listener activo
    const notesCollection = collection(db, "users", currentUserId, "notes");
    const q = query(notesCollection); 
    console.log("Escuchando cambios en las notas...");
    notesContainer.innerHTML = "<p>Cargando notas desde la nube...</p>"; // Mensaje de carga inicial
    unsubscribeFromNotes = onSnapshot(q, (querySnapshot) => {
        allNotes = []; // Limpiar el array de todas las notas
        querySnapshot.forEach((doc) => {
            allNotes.push({ id: doc.id, ...doc.data() });
        });
        // Ordenar todas las notas por fecha de creación (más reciente primero)
        allNotes.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
        
        displayNotes(allNotes); 
        console.log(`Se han cargado ${allNotes.length} nota(s) desde la nube.`);
    }, (error) => {
        console.error(`Error crítico al cargar las notas: ${error.message}`);
        notesContainer.innerHTML = "<p>Error al cargar las notas. Por favor, recarga la página.</p>";
    });
}

async function saveNoteToFirestore(noteData) {
    if (!currentUserId) throw new Error("Usuario no autenticado para guardar.");
    console.log("Guardando datos de la nota en Firestore...");
    const notesCollection = collection(db, "users", currentUserId, "notes");
    await addDoc(notesCollection, { ...noteData, createdAt: serverTimestamp() });
    console.log("Datos de la nota guardados exitosamente.");
}

async function deleteNoteAndPhoto(noteId) {
    if (!currentUserId || !noteId) return;
    const confirmationModal = createConfirmationModal("¿Estás seguro de eliminar esta nota? Esta acción no se puede deshacer.");
    const confirmed = await confirmationModal.present();

    if (!confirmed) return;

    console.log(`Iniciando eliminación de la nota ID: ${noteId}...`);
    try {
        const noteDocRef = doc(db, "users", currentUserId, "notes", noteId);
        const noteDoc = await getDoc(noteDocRef);

        if (noteDoc.exists()) {
            const noteData = noteDoc.data();
            if (noteData.photoUrl) {
                console.log("La nota tiene una foto, intentando eliminarla de Storage...");
                const photoRef = ref(storage, noteData.photoUrl);
                await deleteObject(photoRef);
                console.log("Foto eliminada de Firebase Storage.");
            } else {
                console.log("La nota no tiene foto asociada.");
            }
        }
        
        console.log("Eliminando la nota de Firestore...");
        await deleteDoc(noteDocRef);
        console.log("Nota eliminada exitosamente de Firestore.");
    } catch (error) {
        console.error(`Error al eliminar la nota: ${error.message}`);
        createAlertDialog("Hubo un error al eliminar la nota.", `Mensaje: ${error.message}`).present();
    }
}

// --- Lógica del desplegable de Etiquetas ---
tagsDropdownInput.addEventListener('click', (e) => {
    e.stopPropagation(); // Evita que el clic se propague al document y cierre inmediatamente
    tagsDropdownOptions.classList.toggle('active');
});

tagsDropdownOptions.addEventListener('click', (e) => {
    if (e.target.classList.contains('dropdown-option')) {
        const tagValue = e.target.dataset.value;
        if (!selectedTags.includes(tagValue)) {
            selectedTags.push(tagValue);
            renderSelectedTags();
        }
    }
});

// Cerrar el dropdown si se hace clic fuera
document.addEventListener('click', (e) => {
    if (!tagsDropdownInput.contains(e.target) && !tagsDropdownOptions.contains(e.target)) {
        tagsDropdownOptions.classList.remove('active');
    }
});

function renderSelectedTags() {
    selectedTagsDisplay.innerHTML = '';
    selectedTags.forEach(tag => {
        const tagItem = document.createElement('span');
        const tagClass = tagColorMap[tag] || ''; // Obtener clase de color
        tagItem.className = `selected-tag-item ${tagClass}`;
        tagItem.innerHTML = `${tag} <i class="fas fa-times-circle remove-tag-icon" data-tag="${tag}"></i>`;
        tagItem.querySelector('.remove-tag-icon').addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que se cierre el dropdown
            removeTag(e.target.dataset.tag);
        });
        selectedTagsDisplay.appendChild(tagItem);
    });
}

function removeTag(tagToRemove) {
    selectedTags = selectedTags.filter(tag => tag !== tagToRemove);
    renderSelectedTags();
}

// --- Main Application Logic ---
noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveNoteButton.disabled = true;
    saveNoteButton.innerHTML = `<span><i class="fas fa-spinner fa-spin"></i> Guardando...</span>`;

    let photoDownloadURL = '';
    try {
        if (capturedPhotoDataUrl) {
            photoDownloadURL = await uploadPhoto(capturedPhotoDataUrl);
        }

        const factsHtml = quill.root.innerHTML;
        const factsText = quill.getText(); 

        const noteData = {
            interventionLocation: document.getElementById('interventionLocation').value,
            documentNumber: document.getElementById('documentNumber').value,
            fullName: document.getElementById('fullName').value,
            birthPlace: document.getElementById('birthPlace').value,
            birthdate: document.getElementById('birthdate').value,
            parentsName: document.getElementById('parentsName').value,
            address: document.getElementById('address').value,
            phone: document.getElementById('phone').value,
            factsHtml: factsHtml,
            factsText: factsText,
            tags: selectedTags, // Usar las etiquetas del array
            photoUrl: photoDownloadURL,
        };
        await saveNoteToFirestore(noteData);
        noteForm.reset(); // Limpiar el formulario
        quill.setText(''); // Limpiar el editor Quill
        selectedTags = []; // Resetear etiquetas seleccionadas
        renderSelectedTags(); // Actualizar la visualización de etiquetas
        capturedPhotoDataUrl = null;
        if (photoPreview) {
            photoPreview.src = '#';
            photoPreview.style.display = 'none';
        }
        createAlertDialog("Nota guardada en la nube exitosamente.").present();
    } catch (error) {
        console.error("Error durante el proceso de guardado:", error);
        createAlertDialog(`Hubo un error al guardar la nota.`, `Mensaje: ${error.message}`).present();
    } finally {
        saveNoteButton.disabled = false;
        saveNoteButton.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg><span>Guardar Nota</span>`;
    }
});

function displayNotes(notesToShow) { 
    if (!notesToShow || notesToShow.length === 0) {
        notesContainer.innerHTML = "<p>No hay notas guardadas en la nube.</p>";
        return;
    }
    notesContainer.innerHTML = notesToShow.map(note => {
        const displayTimestamp = note.createdAt?.toDate() ? note.createdAt.toDate().toLocaleString('es-ES') : 'N/A';
        const tagsHtml = (note.tags && note.tags.length > 0) 
            ? `<div class="note-tags">${note.tags.map(tag => {
                const tagClass = tagColorMap[tag] || ''; // Obtener clase de color para el tag
                return `<span class="note-tag ${tagClass}">${tag}</span>`;
            }).join('')}</div>`
            : '';

        return `
        <div class="note">
            <p><strong>Fecha y Hora:</strong> ${displayTimestamp}</p>
            <p><strong>Lugar de Intervención:</strong> ${note.interventionLocation || 'N/A'}</p>
            <p><strong>Documento:</strong> ${note.documentNumber || 'N/A'}</p>
            <p><strong>Nombre:</strong> ${note.fullName || 'N/A'}</p>
            <p><strong>Lugar de nacimiento:</strong> ${note.birthPlace || 'N/A'}</p>
            <p><strong>Fecha de nacimiento:</strong> ${note.birthdate || 'N/A'}</p>
            <p><strong>Padres:</strong> ${note.parentsName || 'N/A'}</p>
            <p><strong>Dirección:</strong> ${note.address || 'N/A'}</p>
            <p><strong>Teléfono:</strong> ${note.phone || 'N/A'}</p>
            <p><strong>Hechos:</strong> <div class="ql-editor-readonly">${note.factsHtml || 'N/A'}</div></p>
            ${tagsHtml}
            ${note.photoUrl ? `<img src="${note.photoUrl}" alt="Foto del documento" class="note-photo" loading="lazy">` : ''}
            <div class="note-actions">
                <button class="btn btn-delete" onclick="window.deleteNote('${note.id}')">Eliminar</button>
                <button class="btn btn-share" onclick='window.shareNote(${JSON.stringify(note)})'>Compartir</button>
                <button class="btn btn-copy" onclick='window.copyNoteText(${JSON.stringify(note)})'>Copiar Texto</button>
                ${note.photoUrl ? `<button class="btn btn-download" onclick="window.downloadNotePhoto('${note.photoUrl}')">Descargar Foto</button>` : ''}
            </div>
        </div>`;
    }).join('');

    notesContainer.querySelectorAll('.ql-editor-readonly').forEach(el => {
        el.innerHTML = el.innerHTML;
    });
}

window.deleteNote = deleteNoteAndPhoto;

window.shareNote = async function(noteData) {
    const displayTimestamp = noteData.createdAt?.seconds ? new Date(noteData.createdAt.seconds * 1000).toLocaleString('es-ES') : 'N/A';
    let shareText = `Nota Policial:\nFecha: ${displayTimestamp}\nLugar de Intervención: ${noteData.interventionLocation || 'N/A'}\nDocumento: ${noteData.documentNumber || 'N/A'}\nNombre: ${noteData.fullName || 'N/A'}\nLugar de Nacimiento: ${noteData.birthPlace || 'N/A'}\nFecha de Nacimiento: ${noteData.birthdate || 'N/A'}\nPadres: ${noteData.parentsName || 'N/A'}\nDirección: ${noteData.address || 'N/A'}\nTeléfono: ${noteData.phone || 'N/A'}\nHechos: ${noteData.factsText || 'N/A'}\nEtiquetas: ${(noteData.tags || []).join(', ')}`;
    const shareOptions = { title: 'Nota Policial', text: shareText };
    if (noteData.photoUrl) {
        try {
            const response = await fetch(noteData.photoUrl);
            const blob = await response.blob();
            shareOptions.files = [new File([blob], 'foto_nota.png', { type: blob.type })];
        } catch (error) { console.error('Error al procesar la foto para compartir:', error); }
    }
    try {
        if (navigator.share) await navigator.share(shareOptions);
        else createAlertDialog('La función de compartir no es compatible con este navegador.').present();
    } catch (err) { if (err.name !== 'AbortError') console.error('Error al compartir la nota:', err); }
}

window.copyNoteText = async function(noteData) {
    const displayTimestamp = noteData.createdAt?.seconds ? new Date(noteData.createdAt.seconds * 1000).toLocaleString('es-ES') : 'N/A';
    let noteText = `Nota Policial:\nFecha: ${displayTimestamp}\nLugar de Intervención: ${noteData.interventionLocation || 'N/A'}\nDocumento: ${noteData.documentNumber || 'N/A'}\nNombre: ${noteData.fullName || 'N/A'}\nLugar de Nacimiento: ${noteData.birthPlace || 'N/A'}\nFecha de Nacimiento: ${noteData.birthdate || 'N/A'}\nPadres: ${noteData.parentsName || 'N/A'}\nDirección: ${noteData.address || 'N/A'}\nTeléfono: ${noteData.phone || 'N/A'}\nHechos: ${noteData.factsText || 'N/A'}\nEtiquetas: ${(noteData.tags || []).join(', ')}`;
    try {
        await navigator.clipboard.writeText(noteText);
        createAlertDialog('Texto de la nota copiado al portapapeles.').present();
    } catch (err) {
        console.error('Error al copiar el texto:', err);
        createAlertDialog('No se pudo copiar el texto.').present();
    }
}

window.downloadNotePhoto = (photoUrl) => {
    if (!photoUrl) return createAlertDialog('Esta nota no tiene foto.').present();
    const a = document.createElement('a');
    a.href = photoUrl;
    a.download = 'foto_nota.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

generateReportButton.addEventListener('click', async () => {
    if (!currentUserId) return createAlertDialog("Debes estar conectado para generar un informe.").present();
    console.log("Generando informe de notas...");
    const notesToReport = [...allNotes];
    
    let reportText = 'Informe de Intervenciones\n\n';
    notesToReport.forEach((note, index) => {
        const displayTimestamp = note.createdAt?.toDate() ? note.createdAt.toDate().toLocaleString('es-ES') : 'N/A';
        reportText += `Intervención ${index + 1}\n---------------------------------\nFecha y Hora: ${displayTimestamp}\nLugar de Intervención: ${note.interventionLocation || 'N/A'}\nDocumento: ${note.documentNumber || 'N/A'}\nNombre: ${note.fullName || 'N/A'}\nLugar de Nacimiento: ${note.birthPlace || 'N/A'}\nFecha de Nacimiento: ${note.birthdate || 'N/A'}\nPadres: ${note.parentsName || 'N/A'}\nDirección: ${note.address || 'N/A'}\nTeléfono: ${note.phone || 'N/A'}\nHechos: ${note.factsText || 'N/A'}\nEtiquetas: ${(note.tags || []).join(', ')}\n---------------------------------\n\n`;
    });
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'informe_intervenciones.txt';
    a.click();
    URL.revokeObjectURL(url);
    console.log("Informe generado y descargado.");
});

exportPdfBtn.addEventListener('click', async () => {
    if (!currentUserId) return createAlertDialog("Debes estar conectado para exportar a PDF.").present();
    if (allNotes.length === 0) return createAlertDialog("No hay notas para exportar a PDF.").present();

    createAlertDialog("Generando PDF... por favor espera.").present();

    const doc = new window.jspdf.jsPDF();
    let yPos = 10;
    const margin = 10;
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;

    doc.setFontSize(22);
    doc.text("Informe de Notas GUARD-IA", pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    for (const note of allNotes) {
        if (yPos + 50 > pageHeight) {
            doc.addPage();
            yPos = margin;
        }

        doc.setFontSize(14);
        doc.setTextColor(57, 255, 20);
        doc.text(`Nota: ${note.id}`, margin, yPos);
        yPos += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);

        const fields = [
            { label: "Fecha y Hora", value: note.createdAt?.toDate() ? note.createdAt.toDate().toLocaleString('es-ES') : 'N/A' },
            { label: "Lugar de Intervención", value: note.interventionLocation || 'N/A' },
            { label: "Documento", value: note.documentNumber || 'N/A' },
            { label: "Nombre", value: note.fullName || 'N/A' },
            { label: "Lugar de nacimiento", value: note.birthPlace || 'N/A' },
            { label: "Fecha de nacimiento", value: note.birthdate || 'N/A' },
            { label: "Padres", value: note.parentsName || 'N/A' },
            { label: "Dirección", value: note.address || 'N/A' },
            { label: "Teléfono", value: note.phone || 'N/A' },
            { label: "Etiquetas", value: (note.tags || []).join(', ') || 'N/A' }
        ];

        fields.forEach(field => {
            doc.text(`${field.label}: ${field.value}`, margin, yPos);
            yPos += 6;
        });
        
        doc.text("Hechos:", margin, yPos);
        yPos += 6;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.factsHtml || 'N/A';
        tempDiv.style.width = `${pageWidth - 2 * margin}px`;
        tempDiv.style.fontSize = '10px';
        tempDiv.style.color = 'black';
        tempDiv.style.fontFamily = 'sans-serif';
        document.body.appendChild(tempDiv);

        try {
            const canvas = await html2canvas(tempDiv, { scale: 2, logging: false });
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = pageWidth - 2 * margin;
            const imgHeight = canvas.height * imgWidth / canvas.width;

            if (yPos + imgHeight > pageHeight) {
                doc.addPage();
                yPos = margin;
            }
            doc.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
            yPos += imgHeight + 5;
        } catch (error) {
            console.error("Error al renderizar hechos HTML para PDF:", error);
            doc.text("Error al cargar el contenido de 'Hechos'.", margin, yPos);
            yPos += 10;
        } finally {
            document.body.removeChild(tempDiv);
        }
        
        if (note.photoUrl) {
            if (yPos + 50 > pageHeight) {
                doc.addPage();
                yPos = margin;
            }
            try {
                const img = new Image();
                img.src = note.photoUrl;
                await new Promise(resolve => img.onload = resolve);
                const imgWidth = 80;
                const imgHeight = (img.height * imgWidth) / img.width;
                if (yPos + imgHeight > pageHeight) {
                    doc.addPage();
                    yPos = margin;
                }
                doc.addImage(img, 'PNG', margin, yPos, imgWidth, imgHeight);
                yPos += imgHeight + 5;
            } catch (error) {
                console.error("Error al cargar la foto para PDF:", error);
                doc.text("Error al cargar la foto.", margin, yPos);
                yPos += 10;
            }
        }
        yPos += 10;
    }

    doc.save('informe_notas_GUARDIA.pdf');
    createAlertDialog("PDF generado exitosamente.").present();
});


exportCsvBtn.addEventListener('click', async () => {
    if (!currentUserId) return createAlertDialog("Debes estar conectado para exportar a CSV.").present();
    if (allNotes.length === 0) return createAlertDialog("No hay notas para exportar a CSV.").present();

    let csvContent = "";
    const headers = [
        "ID", "Fecha y Hora", "Lugar de Intervención", "Número de Documento", 
        "Nombre Completo", "Lugar de Nacimiento", "Fecha de Nacimiento", "Teléfono",
        "Nombre del Padre/Madre", "Dirección", "Hechos (Texto Plano)", "Etiquetas", "URL de Foto"
    ];
    csvContent += headers.join(",") + "\n";

    allNotes.forEach(note => {
        const escapeCsv = (text) => {
            if (text === null || text === undefined) return '';
            text = String(text);
            if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
                return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        };

        const displayTimestamp = note.createdAt?.toDate() ? note.createdAt.toDate().toLocaleString('es-ES') : 'N/A';
        const row = [
            escapeCsv(note.id),
            escapeCsv(displayTimestamp),
            escapeCsv(note.interventionLocation),
            escapeCsv(note.documentNumber),
            escapeCsv(note.fullName),
            escapeCsv(note.birthPlace),
            escapeCsv(note.birthdate),
            escapeCsv(note.phone),
            escapeCsv(note.parentsName),
            escapeCsv(note.address),
            escapeCsv(note.factsText),
            escapeCsv((note.tags || []).join('; ')),
            escapeCsv(note.photoUrl)
        ];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "notas_GUARDIA.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    createAlertDialog("CSV generado y descargado exitosamente.").present();
});


takePhotoButton.addEventListener('click', () => {
    if (navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
            .then(stream => {
                mediaStream = stream;
                video.srcObject = stream;
                video.play();
                cameraModal.style.display = 'flex';
            })
            .catch(err => {
                console.error(`Error al acceder a la cámara: ${err.message}`);
                createAlertDialog("No se pudo acceder a la cámara.").present();
            });
    } else createAlertDialog("Tu navegador no soporta acceso a la cámara.").present();
});

captureButton.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    capturedPhotoDataUrl = canvas.toDataURL('image/png');
    if (photoPreview) {
        photoPreview.src = capturedPhotoDataUrl;
        photoPreview.style.display = 'block';
    }
    closeCameraModal();
});

cancelCaptureButton.addEventListener('click', closeCameraModal);

function closeCameraModal() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    video.srcObject = null;
    cameraModal.style.display = 'none';
}


// --- FUNCIONES DE MODAL PERSONALIZADAS (REEMPLAZO DE ALERT/CONFIRM) ---
function createAlertDialog(message, details = '') {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
        <div class="custom-modal-content">
            <h3>Aviso</h3>
            <p>${message}</p>
            ${details ? `<p style="font-size:0.85rem; color: var(--text-medium-color); margin-top: -10px;">${details}</p>` : ''}
            <div class="custom-modal-buttons">
                <button class="custom-modal-btn alert">Aceptar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    return {
        present: () => {
            return new Promise(resolve => {
                overlay.querySelector('.custom-modal-btn.alert').onclick = () => {
                    document.body.removeChild(overlay);
                    resolve(true);
                };
            });
        }
    };
}

function createConfirmationModal(message) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
        <div class="custom-modal-content">
            <h3>Confirmación</h3>
            <p>${message}</p>
            <div class="custom-modal-buttons">
                <button class="custom-modal-btn confirm">Confirmar</button>
                <button class="custom-modal-btn cancel">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    return {
        present: () => {
            return new Promise(resolve => {
                overlay.querySelector('.custom-modal-btn.confirm').onclick = () => {
                    document.body.removeChild(overlay);
                    resolve(true);
                };
                overlay.querySelector('.custom-modal-btn.cancel').onclick = () => {
                    document.body.removeChild(overlay);
                    resolve(false);
                };
            });
        }
    };
}
