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
    updateDoc, 
    serverTimestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadString, 
    getDownloadURL,
    deleteObject 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// Your web app's Firebase configuration
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
const takePhotoButton = document.getElementById('takePhotoButton');
const saveNoteButton = document.getElementById('saveNoteButton');
const photoPreview = document.getElementById('photoPreview');
const authStateDiv = document.getElementById('auth-state');
const appContentDiv = document.getElementById('app-content');
const userInfoDiv = document.getElementById('user-info');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const generateReportButton = document.getElementById('generateReportButton');

// NUEVOS elementos para edición y búsqueda
const formTitle = document.getElementById('formTitle');
const cancelEditButton = document.getElementById('cancelEditButton');
const searchInput = document.getElementById('searchInput');
const tagFilter = document.getElementById('tagFilter');

// Elementos para etiquetas
const tagsDropdownInput = document.getElementById('tagsDropdownInput');
const tagsDropdownOptions = document.getElementById('tagsDropdownOptions');
const selectedTagsDisplay = document.getElementById('selectedTagsDisplay');

// Camera Modal Elements
const cameraModal = document.getElementById('cameraModal');
const video = document.getElementById('video');
const captureButton = document.getElementById('captureButton');
const cancelCaptureButton = document.getElementById('cancelCaptureButton');

// Quill Editor initialization
const quill = new Quill('#editor-container', {
    modules: { toolbar: [
        ['bold', 'italic', 'underline', 'strike'], ['blockquote', 'code-block'],
        [{ 'header': 1 }, { 'header': 2 }], [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'script': 'sub'}, { 'script': 'super' }], [{ 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        [{ 'color': [] }, { 'background': [] }], [{ 'align': [] }],
        ['link', 'image'], ['clean']
    ]},
    theme: 'snow',
    placeholder: 'Escribe aquí los hechos y detalles de la intervención...',
});

// Mapa de colores para etiquetas
const tagColorMap = {
    "Servicio de Sala": "tag-servicio-de-sala", "A requerimiento": "tag-a-requerimiento",
    "Por superioridad": "tag-por-superioridad", "Otros": "tag-otros"
};
let selectedTags = [];

// Global state
let mediaStream = null;
let capturedPhotoDataUrl = null;
let currentUserId = null;
let unsubscribeFromNotes = null;
let allNotes = []; // Almacenamiento local de todas las notas para búsqueda/filtrado
let isEditing = false;
let currentEditingNoteId = null;

// --- Authentication ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        authStateDiv.classList.add('hidden');
        appContentDiv.classList.remove('hidden');
        userInfoDiv.textContent = `Conectado como: ${user.email}`;
        listenForNotes();
    } else {
        currentUserId = null;
        appContentDiv.classList.add('hidden');
        authStateDiv.classList.remove('hidden');
        authStateDiv.innerHTML = `<p>Debes iniciar sesión para usar el bloc de notas. <a href="../../index.html">Volver para iniciar sesión.</a></p>`;
        userInfoDiv.textContent = 'No conectado';
        if (unsubscribeFromNotes) unsubscribeFromNotes();
        notesContainer.innerHTML = "<p>Inicia sesión para ver tus notas.</p>";
        allNotes = [];
    }
});

// --- Photo Upload ---
async function uploadPhoto(base64String) {
    if (!currentUserId) throw new Error("Usuario no autenticado para subir la foto.");
    const photoId = `note_photo_${Date.now()}`;
    const storageRef = ref(storage, `users/${currentUserId}/notes_photos/${photoId}.png`);
    const snapshot = await uploadString(storageRef, base64String, 'data_url');
    return await getDownloadURL(snapshot.ref);
}

// --- Firestore and Storage ---
function listenForNotes() {
    if (!currentUserId) return;
    if (unsubscribeFromNotes) unsubscribeFromNotes();
    const notesCollection = collection(db, "users", currentUserId, "notes");
    const q = query(notesCollection);
    notesContainer.innerHTML = "<p>Cargando notas desde la nube...</p>";
    unsubscribeFromNotes = onSnapshot(q, (querySnapshot) => {
        allNotes = [];
        querySnapshot.forEach((doc) => {
            allNotes.push({ id: doc.id, ...doc.data() });
        });
        allNotes.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
        
        populateTagFilter(); 
        applyFilters(); 
        console.log(`Se han cargado/actualizado ${allNotes.length} nota(s).`);
    }, (error) => {
        console.error(`Error al cargar las notas: ${error.message}`);
        notesContainer.innerHTML = "<p>Error al cargar las notas. Por favor, recarga la página.</p>";
    });
}

// --- Note Creation and UPDATE ---
noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveNoteButton.disabled = true;
    saveNoteButton.querySelector('span').textContent = 'Guardando...';

    let photoDownloadURL = '';
    try {
        if (capturedPhotoDataUrl) {
            photoDownloadURL = await uploadPhoto(capturedPhotoDataUrl);
        }

        const noteData = {
            interventionLocation: document.getElementById('interventionLocation').value,
            documentNumber: document.getElementById('documentNumber').value,
            fullName: document.getElementById('fullName').value,
            birthPlace: document.getElementById('birthPlace').value,
            birthdate: document.getElementById('birthdate').value,
            parentsName: document.getElementById('parentsName').value,
            address: document.getElementById('address').value,
            phone: document.getElementById('phone').value,
            factsHtml: quill.root.innerHTML,
            factsText: quill.getText(),
            tags: selectedTags,
            ...(photoDownloadURL && { photoUrl: photoDownloadURL }),
        };

        if (isEditing) {
            const noteDocRef = doc(db, "users", currentUserId, "notes", currentEditingNoteId);
            await updateDoc(noteDocRef, noteData);
            createAlertDialog("Nota actualizada exitosamente.").present();
        } else {
            noteData.createdAt = serverTimestamp();
            const notesCollection = collection(db, "users", currentUserId, "notes");
            await addDoc(notesCollection, noteData);
            createAlertDialog("Nota guardada en la nube exitosamente.").present();
        }
        
        resetForm();
    } catch (error) {
        console.error("Error durante el proceso de guardado/actualización:", error);
        createAlertDialog(`Hubo un error.`, `Mensaje: ${error.message}`).present();
    } finally {
        saveNoteButton.disabled = false;
        if (!isEditing) {
            saveNoteButton.querySelector('span').textContent = 'Guardar Nota';
        }
    }
});

// --- Edit Logic ---
window.startEditNote = (noteId) => {
    const noteToEdit = allNotes.find(note => note.id === noteId);
    if (!noteToEdit) {
        console.error("Nota no encontrada para editar");
        return;
    }

    isEditing = true;
    currentEditingNoteId = noteId;

    document.getElementById('interventionLocation').value = noteToEdit.interventionLocation || '';
    document.getElementById('documentNumber').value = noteToEdit.documentNumber || '';
    document.getElementById('fullName').value = noteToEdit.fullName || '';
    document.getElementById('birthPlace').value = noteToEdit.birthPlace || '';
    document.getElementById('birthdate').value = noteToEdit.birthdate || '';
    document.getElementById('parentsName').value = noteToEdit.parentsName || '';
    document.getElementById('address').value = noteToEdit.address || '';
    document.getElementById('phone').value = noteToEdit.phone || '';
    quill.root.innerHTML = noteToEdit.factsHtml || '';
    selectedTags = noteToEdit.tags || [];
    renderSelectedTags();

    if (noteToEdit.photoUrl) {
        photoPreview.src = noteToEdit.photoUrl;
        photoPreview.style.display = 'block';
    } else {
        photoPreview.style.display = 'none';
    }
    capturedPhotoDataUrl = null;

    formTitle.textContent = "Editando Nota";
    saveNoteButton.querySelector('span').textContent = "Actualizar Nota";
    cancelEditButton.classList.remove('hidden');
    takePhotoButton.classList.add('hidden');

    noteForm.scrollIntoView({ behavior: 'smooth' });
};

function resetForm() {
    noteForm.reset();
    quill.setText('');
    selectedTags = [];
    renderSelectedTags();
    capturedPhotoDataUrl = null;
    photoPreview.style.display = 'none';

    isEditing = false;
    currentEditingNoteId = null;

    formTitle.textContent = "Crear Nueva Nota";
    saveNoteButton.querySelector('span').textContent = 'Guardar Nota';
    cancelEditButton.classList.add('hidden');
    takePhotoButton.classList.remove('hidden');
}

cancelEditButton.addEventListener('click', resetForm);


// --- Search and Filter Logic ---
function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const tagToFilter = tagFilter.value;

    let filteredNotes = allNotes;

    if (searchTerm) {
        filteredNotes = filteredNotes.filter(note => {
            const searchCorpus = `
                ${note.fullName || ''} 
                ${note.documentNumber || ''} 
                ${note.interventionLocation || ''} 
                ${note.factsText || ''}
            `.toLowerCase();
            return searchCorpus.includes(searchTerm);
        });
    }

    if (tagToFilter) {
        filteredNotes = filteredNotes.filter(note => note.tags && note.tags.includes(tagToFilter));
    }
    
    displayNotes(filteredNotes);
}

function populateTagFilter() {
    const allTags = new Set();
    allNotes.forEach(note => {
        if (note.tags) {
            note.tags.forEach(tag => allTags.add(tag));
        }
    });

    const currentFilterValue = tagFilter.value;

    tagFilter.innerHTML = '<option value="">Todas las etiquetas</option>';
    allTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagFilter.appendChild(option);
    });

    tagFilter.value = currentFilterValue;
}

searchInput.addEventListener('input', applyFilters);
tagFilter.addEventListener('change', applyFilters);


// --- Display and Interaction ---
function displayNotes(notesToShow) { 
    if (!notesToShow || notesToShow.length === 0) {
        notesContainer.innerHTML = "<p>No hay notas que coincidan con tu búsqueda.</p>";
        return;
    }
    notesContainer.innerHTML = notesToShow.map(note => {
        const displayTimestamp = note.createdAt?.toDate() ? note.createdAt.toDate().toLocaleString('es-ES') : 'N/A';
        const tagsHtml = (note.tags && note.tags.length > 0) 
            ? `<div class="note-tags">${note.tags.map(tag => `<span class="note-tag ${tagColorMap[tag] || ''}">${tag}</span>`).join('')}</div>`
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
            ${note.photoUrl ? `<img src="${note.photoUrl}" alt="Foto de la nota" class="note-photo" loading="lazy">` : ''}
            <div class="note-actions">
                <button class="btn btn-edit" onclick="window.startEditNote('${note.id}')">Editar</button>
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

window.deleteNote = async function(noteId) {
    if (!currentUserId || !noteId) return;
    const confirmed = await createConfirmationModal("¿Estás seguro de eliminar esta nota? Esta acción no se puede deshacer.").present();
    if (!confirmed) return;
    try {
        const noteDocRef = doc(db, "users", currentUserId, "notes", noteId);
        const noteDoc = await getDoc(noteDocRef);
        if (noteDoc.exists() && noteDoc.data().photoUrl) {
            const photoRef = ref(storage, noteDoc.data().photoUrl);
            await deleteObject(photoRef);
        }
        await deleteDoc(noteDocRef);
    } catch (error) {
        console.error(`Error al eliminar la nota: ${error.message}`);
        createAlertDialog("Hubo un error al eliminar la nota.", `Mensaje: ${error.message}`).present();
    }
};

window.shareNote = async function(noteData) {
    const displayTimestamp = noteData.createdAt?.seconds ? new Date(noteData.createdAt.seconds * 1000).toLocaleString('es-ES') : 'N/A';
    let shareText = `Nota Policial:\nFecha: ${displayTimestamp}\nLugar: ${noteData.interventionLocation || 'N/A'}\nDocumento: ${noteData.documentNumber || 'N/A'}\nNombre: ${noteData.fullName || 'N/A'}\nHechos: ${noteData.factsText || 'N/A'}\nEtiquetas: ${(noteData.tags || []).join(', ')}`;
    const shareOptions = { title: 'Nota Policial', text: shareText };
    if (noteData.photoUrl) {
        try {
            const response = await fetch(noteData.photoUrl);
            const blob = await response.blob();
            shareOptions.files = [new File([blob], 'foto_nota.png', { type: blob.type })];
        } catch (error) { console.error('Error al procesar foto para compartir:', error); }
    }
    if (navigator.share) await navigator.share(shareOptions).catch(err => { if (err.name !== 'AbortError') console.error(err); });
    else createAlertDialog('La función de compartir no es compatible con este navegador.').present();
}
window.copyNoteText = async function(noteData) {
    const displayTimestamp = noteData.createdAt?.seconds ? new Date(noteData.createdAt.seconds * 1000).toLocaleString('es-ES') : 'N/A';
    let noteText = `Nota Policial:\nFecha: ${displayTimestamp}\nLugar: ${noteData.interventionLocation || 'N/A'}\nDocumento: ${noteData.documentNumber || 'N/A'}\nNombre: ${noteData.fullName || 'N/A'}\nHechos: ${noteData.factsText || 'N/A'}\nEtiquetas: ${(noteData.tags || []).join(', ')}`;
    try {
        await navigator.clipboard.writeText(noteText);
        createAlertDialog('Texto de la nota copiado.').present();
    } catch (err) { createAlertDialog('No se pudo copiar el texto.').present(); }
}
window.downloadNotePhoto = (photoUrl) => {
    if (!photoUrl) return;
    const a = document.createElement('a');
    a.href = photoUrl; a.download = 'foto_nota.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

generateReportButton.addEventListener('click', async () => {
    if (!currentUserId) return createAlertDialog("Debes estar conectado para generar un informe.").present();
    const notesToReport = allNotes;
    if (notesToReport.length === 0) return createAlertDialog("No hay notas para generar un informe.").present();
    
    let reportText = 'Informe de Intervenciones\n\n';
    notesToReport.forEach((note, index) => {
        const displayTimestamp = note.createdAt?.toDate() ? note.createdAt.toDate().toLocaleString('es-ES') : 'N/A';
        reportText += `Intervención ${index + 1}\n---------------------------------\nFecha y Hora: ${displayTimestamp}\nLugar de Intervención: ${note.interventionLocation || 'N/A'}\nDocumento: ${note.documentNumber || 'N/A'}\nNombre: ${note.fullName || 'N/A'}\nHechos: ${note.factsText || 'N/A'}\n---------------------------------\n\n`;
    });
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'informe_intervenciones.txt';
    a.click();
    URL.revokeObjectURL(url);
});

// --- Lógica de etiquetas ---
tagsDropdownInput.addEventListener('click', (e) => {
    e.stopPropagation();
    tagsDropdownOptions.classList.toggle('active');
});

// *** CAMBIO REALIZADO AQUÍ ***
tagsDropdownOptions.addEventListener('click', (e) => {
    if (e.target.classList.contains('dropdown-option')) {
        const tagValue = e.target.dataset.value;
        if (!selectedTags.includes(tagValue)) {
            selectedTags.push(tagValue);
            renderSelectedTags();
        }
        // Oculta el menú desplegable después de seleccionar una opción
        tagsDropdownOptions.classList.remove('active'); 
    }
});

document.addEventListener('click', (e) => {
    if (!tagsDropdownInput.contains(e.target) && !tagsDropdownOptions.contains(e.target)) {
        tagsDropdownOptions.classList.remove('active');
    }
});

function renderSelectedTags() {
    selectedTagsDisplay.innerHTML = '';
    selectedTags.forEach(tag => {
        const tagItem = document.createElement('span');
        tagItem.className = `selected-tag-item ${tagColorMap[tag] || ''}`;
        tagItem.innerHTML = `${tag} <i class="fas fa-times-circle remove-tag-icon" data-tag="${tag}"></i>`;
        tagItem.querySelector('.remove-tag-icon').addEventListener('click', (e) => {
            e.stopPropagation(); removeTag(e.target.dataset.tag);
        });
        selectedTagsDisplay.appendChild(tagItem);
    });
}
function removeTag(tagToRemove) {
    selectedTags = selectedTags.filter(tag => tag !== tagToRemove);
    renderSelectedTags();
}


// --- Resto de funciones (Cámara, Exportación, Modales) sin cambios ---
// ... (el código existente para estas funciones va aquí)
exportPdfBtn.addEventListener('click', async () => { /* ... código existente ... */ });
exportCsvBtn.addEventListener('click', async () => { /* ... código existente ... */ });
takePhotoButton.addEventListener('click', () => { /* ... código existente ... */ });
captureButton.addEventListener('click', () => { /* ... código existente ... */ });
cancelCaptureButton.addEventListener('click', closeCameraModal);

function closeCameraModal() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    video.srcObject = null;
    cameraModal.style.display = 'none';
}

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
