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
const factsTextarea = document.getElementById('facts');
const photoPreview = document.getElementById('photoPreview');
const authStateDiv = document.getElementById('auth-state');
const appContentDiv = document.getElementById('app-content');
const userInfoDiv = document.getElementById('user-info');

// Camera Modal Elements
const cameraModal = document.getElementById('cameraModal');
const video = document.getElementById('video');
const captureButton = document.getElementById('captureButton');
const cancelCaptureButton = document.getElementById('cancelCaptureButton');

// Global state
let mediaStream = null;
let capturedPhotoDataUrl = null;
let currentUserId = null;
let unsubscribeFromNotes = null;

// --- Authentication Handling ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        console.log(`Usuario autenticado: ${user.email}`);
        authStateDiv.classList.add('hidden');
        appContentDiv.classList.remove('hidden');
        userInfoDiv.textContent = `Conectado como: ${user.email}`;
        listenForNotes();
    } else {
        currentUserId = null;
        console.error('Usuario no autenticado.');
        appContentDiv.classList.add('hidden');
        authStateDiv.classList.remove('hidden');
        authStateDiv.innerHTML = `<p>Debes iniciar sesión para usar el bloc de notas seguro. <a href="../../index.html">Volver a la página principal para iniciar sesión.</a></p>`;
        userInfoDiv.textContent = 'No conectado';
        if (unsubscribeFromNotes) {
            unsubscribeFromNotes();
        }
        notesContainer.innerHTML = "<p>Inicia sesión para ver tus notas guardadas en la nube.</p>";
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
    if (unsubscribeFromNotes) unsubscribeFromNotes();
    const notesCollection = collection(db, "users", currentUserId, "notes");
    const q = query(notesCollection);
    console.log("Escuchando cambios en las notas...");
    notesContainer.innerHTML = "<p>Cargando notas desde la nube...</p>";
    unsubscribeFromNotes = onSnapshot(q, (querySnapshot) => {
        const notes = [];
        querySnapshot.forEach((doc) => {
            notes.push({ id: doc.id, ...doc.data() });
        });
        notes.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
        displayNotes(notes);
        console.log(`Se han cargado ${notes.length} nota(s) desde la nube.`);
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
    if (!confirm("¿Estás seguro de eliminar esta nota? Esta acción no se puede deshacer.")) return;

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
        alert("Hubo un error al eliminar la nota.");
    }
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
        const noteData = {
            interventionLocation: document.getElementById('interventionLocation').value,
            documentNumber: document.getElementById('documentNumber').value,
            fullName: document.getElementById('fullName').value,
            birthPlace: document.getElementById('birthPlace').value,
            birthdate: document.getElementById('birthdate').value,
            parentsName: document.getElementById('parentsName').value,
            address: document.getElementById('address').value,
            phone: document.getElementById('phone').value,
            facts: factsTextarea.value,
            photoUrl: photoDownloadURL,
        };
        await saveNoteToFirestore(noteData);
        noteForm.reset();
        factsTextarea.value = '';
        capturedPhotoDataUrl = null;
        if (photoPreview) {
            photoPreview.src = '#';
            photoPreview.style.display = 'none';
        }
        alert("Nota guardada en la nube exitosamente.");
    } catch (error) {
        console.error("Error durante el proceso de guardado:", error);
        alert(`Hubo un error al guardar la nota: ${error.message}`);
    } finally {
        saveNoteButton.disabled = false;
        saveNoteButton.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg><span>Guardar Nota</span>`;
    }
});

function displayNotes(notes) {
    if (!notes || notes.length === 0) {
        notesContainer.innerHTML = "<p>No hay notas guardadas en la nube.</p>";
        return;
    }
    notesContainer.innerHTML = notes.map(note => {
        const displayTimestamp = note.createdAt?.toDate() ? note.createdAt.toDate().toLocaleString('es-ES') : 'N/A';
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
            <p><strong>Hechos:</strong> ${note.facts || 'N/A'}</p>
            ${note.photoUrl ? `<img src="${note.photoUrl}" alt="Foto del documento" class="note-photo" loading="lazy">` : ''}
            <div class="note-actions">
                <button class="btn btn-delete" onclick="window.deleteNote('${note.id}')">Eliminar</button>
                <button class="btn btn-share" onclick='window.shareNote(${JSON.stringify(note)})'>Compartir</button>
                <button class="btn btn-copy" onclick='window.copyNoteText(${JSON.stringify(note)})'>Copiar Texto</button>
                ${note.photoUrl ? `<button class="btn btn-download" onclick="window.downloadNotePhoto('${note.photoUrl}')">Descargar Foto</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

window.deleteNote = deleteNoteAndPhoto;

window.shareNote = async function(noteData) {
    const displayTimestamp = noteData.createdAt?.seconds ? new Date(noteData.createdAt.seconds * 1000).toLocaleString('es-ES') : 'N/A';
    let shareText = `Nota Policial:\nFecha: ${displayTimestamp}\nLugar de Intervención: ${noteData.interventionLocation || 'N/A'}\nDocumento: ${noteData.documentNumber || 'N/A'}\nNombre: ${noteData.fullName || 'N/A'}\nLugar de Nacimiento: ${noteData.birthPlace || 'N/A'}\nFecha de Nacimiento: ${noteData.birthdate || 'N/A'}\nPadres: ${noteData.parentsName || 'N/A'}\nDirección: ${noteData.address || 'N/A'}\nTeléfono: ${noteData.phone || 'N/A'}\nHechos: ${noteData.facts || 'N/A'}`;
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
        else alert('La función de compartir no es compatible con este navegador.');
    } catch (err) { if (err.name !== 'AbortError') console.error('Error al compartir la nota:', err); }
}

window.copyNoteText = async function(noteData) {
    const displayTimestamp = noteData.createdAt?.seconds ? new Date(noteData.createdAt.seconds * 1000).toLocaleString('es-ES') : 'N/A';
    let noteText = `Nota Policial:\nFecha: ${displayTimestamp}\nLugar de Intervención: ${noteData.interventionLocation || 'N/A'}\nDocumento: ${noteData.documentNumber || 'N/A'}\nNombre: ${noteData.fullName || 'N/A'}\nLugar de Nacimiento: ${noteData.birthPlace || 'N/A'}\nFecha de Nacimiento: ${noteData.birthdate || 'N/A'}\nPadres: ${noteData.parentsName || 'N/A'}\nDirección: ${noteData.address || 'N/A'}\nTeléfono: ${noteData.phone || 'N/A'}\nHechos: ${noteData.facts || 'N/A'}`;
    try {
        await navigator.clipboard.writeText(noteText);
        alert('Texto de la nota copiado al portapapeles.');
    } catch (err) {
        console.error('Error al copiar el texto:', err);
        alert('No se pudo copiar el texto.');
    }
}

window.downloadNotePhoto = (photoUrl) => {
    if (!photoUrl) return alert('Esta nota no tiene foto.');
    const a = document.createElement('a');
    a.href = photoUrl;
    a.download = 'foto_nota.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

generateReportButton.addEventListener('click', async () => {
    if (!currentUserId) return alert("Debes estar conectado para generar un informe.");
    console.log("Generando informe de notas...");
    const notesToReport = [];
    const q = query(collection(db, "users", currentUserId, "notes"));
    try {
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => notesToReport.push(doc.data()));
        notesToReport.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
        let reportText = 'Informe de Intervenciones\n\n';
        notesToReport.forEach((note, index) => {
            const displayTimestamp = note.createdAt?.toDate() ? note.createdAt.toDate().toLocaleString('es-ES') : 'N/A';
            reportText += `Intervención ${index + 1}\n---------------------------------\nFecha y Hora: ${displayTimestamp}\nLugar de Intervención: ${note.interventionLocation || 'N/A'}\nDocumento: ${note.documentNumber || 'N/A'}\nNombre: ${note.fullName || 'N/A'}\nLugar de Nacimiento: ${note.birthPlace || 'N/A'}\nFecha de Nacimiento: ${note.birthdate || 'N/A'}\nPadres: ${note.parentsName || 'N/A'}\nDirección: ${note.address || 'N/A'}\nTeléfono: ${note.phone || 'N/A'}\nHechos: ${note.facts || 'N/A'}\n---------------------------------\n\n`;
        });
        const blob = new Blob([reportText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'informe_intervenciones.txt';
        a.click();
        URL.revokeObjectURL(url);
        console.log("Informe generado y descargado.");
    } catch (error) {
        console.error(`Error al generar el informe: ${error.message}`);
        alert("No se pudo generar el informe.");
    }
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
                alert("No se pudo acceder a la cámara.");
            });
    } else alert("Tu navegador no soporta acceso a la cámara.");
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
