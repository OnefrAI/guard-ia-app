// Import necessary functions from the Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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
    serverTimestamp
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
const saveNoteButton = document.getElementById('saveNoteButton');
const photoPreview = document.getElementById('photoPreview');
const authStateDiv = document.getElementById('auth-state');
const appContentDiv = document.getElementById('app-content');
const userInfoDiv = document.getElementById('user-info');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const takePhotoButton = document.getElementById('takePhotoButton');

// Edit and Search Elements
const formTitle = document.getElementById('formTitle');
const cancelEditButton = document.getElementById('cancelEditButton');
const searchInput = document.getElementById('searchInput');
const tagFilter = document.getElementById('tagFilter');

// Tag Elements
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

// Tag color map
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
let allNotes = [];
let isEditing = false;
let currentEditingNoteId = null;

// --- Authentication ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        authStateDiv.classList.add('hidden');
        appContentDiv.classList.remove('hidden');
        
        userInfoDiv.innerHTML = `
            <div class="user-info-container">
                 <span class="user-email">${user.email}</span>
                 <button id="logoutButton" title="Cerrar sesión" class="logout-btn"><i class="fas fa-sign-out-alt"></i></button>
            </div>
        `;
        document.getElementById('logoutButton').addEventListener('click', () => {
             signOut(auth).catch(error => console.error("Error al cerrar sesión:", error));
        });
        listenForNotes();
    } else {
        currentUserId = null;
        appContentDiv.classList.add('hidden');
        authStateDiv.classList.remove('hidden');
        authStateDiv.innerHTML = `<p>Debes iniciar sesión para usar el bloc de notas. <a href="../../index.html">Volver para iniciar sesión.</a></p>`;
        userInfoDiv.innerHTML = '';
        if (unsubscribeFromNotes) unsubscribeFromNotes();
        notesContainer.innerHTML = "<p>Inicia sesión para ver tus notas.</p>";
        allNotes = [];
    }
});

// --- Photo & Camera Logic ---
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
                showToast("No se pudo acceder a la cámara.", 'error');
            });
    } else {
        showToast("Tu navegador no soporta acceso a la cámara.", 'error');
    }
});

captureButton.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedPhotoDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    photoPreview.src = capturedPhotoDataUrl;
    photoPreview.classList.remove('hidden');
    
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

async function uploadPhoto(base64String) {
    if (!currentUserId || !base64String) return null;
    const photoId = `note_photo_${Date.now()}`;
    const storageRef = ref(storage, `users/${currentUserId}/notes_photos/${photoId}.jpg`);
    const snapshot = await uploadString(storageRef, base64String, 'data_url');
    return await getDownloadURL(snapshot.ref);
}

// --- Firestore and Notes Logic ---
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
    }, (error) => {
        console.error(`Error al cargar las notas: ${error.message}`);
        notesContainer.innerHTML = "<p>Error al cargar las notas. Por favor, recarga la página.</p>";
    });
}

noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveNoteButton.disabled = true;
    saveNoteButton.querySelector('span').textContent = 'Guardando...';

    try {
        const photoDownloadURL = await uploadPhoto(capturedPhotoDataUrl);
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
        };
        
        if (photoDownloadURL) {
            noteData.photoUrl = photoDownloadURL;
        }

        if (isEditing) {
            const noteDocRef = doc(db, "users", currentUserId, "notes", currentEditingNoteId);
            await updateDoc(noteDocRef, noteData);
            showToast("Nota actualizada exitosamente.");
        } else {
            noteData.createdAt = serverTimestamp();
            const notesCollection = collection(db, "users", currentUserId, "notes");
            await addDoc(notesCollection, noteData);
            showToast("Nota guardada en la nube exitosamente.");
        }
        resetForm();
    } catch (error) {
        console.error("Error durante el guardado/actualización:", error);
        showToast(`Hubo un error.`, 'error');
    } finally {
        saveNoteButton.disabled = false;
        saveNoteButton.querySelector('span').textContent = isEditing ? 'Actualizar Nota' : 'Guardar Nota';
    }
});

// --- Edit Logic ---
window.startEditNote = (noteId) => {
    const noteToEdit = allNotes.find(note => note.id === noteId);
    if (!noteToEdit) return;

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
        photoPreview.classList.remove('hidden');
    } else {
        photoPreview.classList.add('hidden');
    }
    capturedPhotoDataUrl = null;

    formTitle.textContent = "Editando Nota";
    saveNoteButton.querySelector('span').textContent = "Actualizar Nota";
    cancelEditButton.classList.remove('hidden');
    takePhotoButton.classList.remove('hidden');

    noteForm.scrollIntoView({ behavior: 'smooth' });
};

function resetForm() {
    noteForm.reset();
    quill.setText('');
    selectedTags = [];
    renderSelectedTags();
    capturedPhotoDataUrl = null;
    photoPreview.classList.add('hidden');
    photoPreview.removeAttribute('src'); 
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
        filteredNotes = filteredNotes.filter(note =>
            Object.values(note).some(value => 
                String(value).toLowerCase().includes(searchTerm)
            )
        );
    }
    if (tagToFilter) {
        filteredNotes = filteredNotes.filter(note => note.tags && note.tags.includes(tagToFilter));
    }
    displayNotes(filteredNotes);
}

function populateTagFilter() {
    const allTags = new Set(allNotes.flatMap(note => note.tags || []));
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
            <p><strong>Lugar de Nacimiento:</strong> ${note.birthPlace || 'N/A'}</p>
            <p><strong>Fecha de Nacimiento:</strong> ${note.birthdate || 'N/A'}</p>
            <p><strong>Teléfono:</strong> ${note.phone || 'N/A'}</p>
            <p><strong>Padres:</strong> ${note.parentsName || 'N/A'}</p>
            <p><strong>Dirección:</strong> ${note.address || 'N/A'}</p>
            <p><strong>Hechos:</strong> <div class="ql-editor-readonly">${note.factsHtml || 'N/A'}</div></p>
            ${tagsHtml}
            ${note.photoUrl ? `<img src="${note.photoUrl}" alt="Foto de la nota" class="note-photo" loading="lazy">` : ''}
            <div class="note-actions">
                <button class="btn btn-edit" onclick="window.startEditNote('${note.id}')">Editar</button>
                <button class="btn btn-delete" onclick="window.deleteNote('${note.id}')">Eliminar</button>
                ${note.photoUrl ? `<a href="${note.photoUrl}" target="_blank" download="foto_nota_${note.id}.jpg"><button class="btn btn-download">Descargar Foto</button></a>` : ''}
            </div>
        </div>`;
    }).join('');

    notesContainer.querySelectorAll('.ql-editor-readonly').forEach(el => {
        el.innerHTML = el.innerHTML;
    });
}

window.deleteNote = async function(noteId) {
    if (!currentUserId || !noteId) return;
    const confirmed = await createConfirmationModal("¿Estás seguro de eliminar esta nota? Esta acción no se puede deshacer.");
    if (!confirmed) return;
    try {
        const noteDocRef = doc(db, "users", currentUserId, "notes", noteId);
        const noteDoc = await getDoc(noteDocRef);
        if (noteDoc.exists() && noteDoc.data().photoUrl) {
            const photoRef = ref(storage, noteDoc.data().photoUrl);
            await deleteObject(photoRef);
        }
        await deleteDoc(noteDocRef);
        showToast("Nota eliminada.");
    } catch (error) {
        showToast("Hubo un error al eliminar la nota.", 'error');
    }
};

// --- Tags Dropdown Logic ---
tagsDropdownInput.addEventListener('click', (e) => {
    e.stopPropagation();
    tagsDropdownOptions.classList.toggle('active');
});
tagsDropdownOptions.addEventListener('click', (e) => {
    if (e.target.classList.contains('dropdown-option')) {
        const tagValue = e.target.dataset.value;
        if (!selectedTags.includes(tagValue)) {
            selectedTags.push(tagValue);
            renderSelectedTags();
        }
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

// --- Utility functions ---
exportPdfBtn.addEventListener('click', () => {
    if (allNotes.length === 0) {
        return showToast("No hay notas para exportar.", "error");
    }
    showToast('Función de exportar a PDF en desarrollo.');
});

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    if (type === 'error') {
        toast.style.backgroundColor = 'var(--color-danger)';
        toast.style.color = 'white';
    }
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 500);
    }, 3000);
}

function createConfirmationModal(message) {
    if (document.querySelector('.custom-modal-overlay')) {
       document.querySelector('.custom-modal-overlay').remove();
    }

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

    const promise = new Promise(resolve => {
        overlay.querySelector('.custom-modal-btn.confirm').onclick = () => {
            if(document.body.contains(overlay)) document.body.removeChild(overlay);
            resolve(true);
        };
        overlay.querySelector('.custom-modal-btn.cancel').onclick = () => {
            if(document.body.contains(overlay)) document.body.removeChild(overlay);
            resolve(false);
        };
    });
    
    return { present: () => promise };
}
