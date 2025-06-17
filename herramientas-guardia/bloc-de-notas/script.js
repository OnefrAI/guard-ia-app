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
    serverTimestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const noteForm = document.getElementById('noteForm');
const notesContainer = document.getElementById('notesContainer');
const generateReportButton = document.getElementById('generateReportButton');
const takePhotoButton = document.getElementById('takePhotoButton');
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
let unsubscribeFromNotes = null; // To store the unsubscribe function for onSnapshot

// --- Authentication Handling ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        currentUserId = user.uid;
        console.log("Usuario autenticado:", currentUserId);
        
        // Update UI
        authStateDiv.classList.add('hidden');
        appContentDiv.classList.remove('hidden');
        userInfoDiv.textContent = `Conectado como: ${user.email}`;

        // Start listening for notes for this user
        listenForNotes();
        
    } else {
        // User is signed out
        currentUserId = null;
        console.log("Usuario no autenticado.");
        
        // Update UI
        appContentDiv.classList.add('hidden');
        authStateDiv.classList.remove('hidden');
        authStateDiv.innerHTML = `<p>Debes iniciar sesión para usar el bloc de notas seguro. <a href="../../index.html">Volver a la página principal para iniciar sesión.</a></p>`;
        userInfoDiv.textContent = 'No conectado';

        // If there was a listener, unsubscribe
        if (unsubscribeFromNotes) {
            unsubscribeFromNotes();
        }
        notesContainer.innerHTML = "<p>Inicia sesión para ver tus notas guardadas en la nube.</p>";
    }
});

// --- Firestore Functions ---

function listenForNotes() {
    if (!currentUserId) return;

    if (unsubscribeFromNotes) {
        unsubscribeFromNotes();
    }
    
    const notesCollection = collection(db, "users", currentUserId, "notes");
    // Remove orderBy from the query to prevent indexing errors
    const q = query(notesCollection);

    notesContainer.innerHTML = "<p>Cargando notas desde la nube...</p>";

    unsubscribeFromNotes = onSnapshot(q, (querySnapshot) => {
        const notes = [];
        querySnapshot.forEach((doc) => {
            notes.push({ id: doc.id, ...doc.data() });
        });

        // Sort the notes on the client-side (in the browser)
        notes.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toDate() : 0;
            const dateB = b.createdAt ? b.createdAt.toDate() : 0;
            return dateB - dateA; // Sorts from newest to oldest
        });
        
        displayNotes(notes);
    }, (error) => {
        console.error("Error al obtener las notas: ", error);
        notesContainer.innerHTML = "<p>Error al cargar las notas. Por favor, recarga la página.</p>";
    });
}

async function saveNoteToFirestore(noteData) {
    if (!currentUserId) {
        alert("Debes estar conectado para guardar una nota.");
        return;
    }

    try {
        const notesCollection = collection(db, "users", currentUserId, "notes");
        const docRef = await addDoc(notesCollection, {
            ...noteData,
            createdAt: serverTimestamp() // Add a server-side timestamp
        });
        console.log("Nota guardada en Firestore con ID: ", docRef.id);
        return true;
    } catch (error) {
        console.error("Error al guardar la nota en Firestore: ", error);
        alert("Hubo un error al guardar la nota. Inténtalo de nuevo.");
        return false;
    }
}

async function deleteNoteFromFirestore(noteId) {
    if (!currentUserId || !noteId) return;

    if (confirm("¿Estás seguro de eliminar esta nota? Esta acción no se puede deshacer.")) {
        try {
            const noteDocRef = doc(db, "users", currentUserId, "notes", noteId);
            await deleteDoc(noteDocRef);
            console.log("Nota eliminada de Firestore.");
        } catch (error) {
            console.error("Error al eliminar la nota: ", error);
            alert("Hubo un error al eliminar la nota.");
        }
    }
}


// --- Main Application Logic ---

noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Create note data object
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
        photoUrl: capturedPhotoDataUrl || '', // Store the base64 URL directly
    };

    // Save to Firestore
    const success = await saveNoteToFirestore(noteData);

    // Reset form only on successful save
    if (success) {
        noteForm.reset();
        factsTextarea.value = '';
        capturedPhotoDataUrl = null;
        if (photoPreview) {
            photoPreview.src = '#';
            photoPreview.style.display = 'none';
        }
        alert("Nota guardada en la nube exitosamente.");
    }
});


function displayNotes(notes) {
    if (!notes || notes.length === 0) {
        notesContainer.innerHTML = "<p>No hay notas guardadas en la nube.</p>";
        return;
    }
    
    notesContainer.innerHTML = notes.map(note => {
        // Handle both server timestamp and old string timestamp for compatibility
        let displayTimestamp = 'N/A';
        if (note.createdAt && note.createdAt.toDate) {
            displayTimestamp = note.createdAt.toDate().toLocaleString('es-ES');
        } else if (note.timestamp) {
            displayTimestamp = note.timestamp;
        }

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
            ${note.photoUrl ? `<img src="${note.photoUrl}" alt="Foto del documento" class="note-photo">` : ''}
            <div class="note-actions">
                <button class="btn btn-delete" onclick="window.deleteNote('${note.id}')">Eliminar</button>
                <button class="btn btn-share" onclick='window.shareNote(${JSON.stringify(note)})'>Compartir</button>
                <button class="btn btn-copy" onclick='window.copyNoteText(${JSON.stringify(note)})'>Copiar Texto</button>
                ${note.photoUrl ? `<button class="btn btn-download" onclick="window.downloadNotePhoto('${note.photoUrl}')">Descargar Foto</button>` : ''}
            </div>
        </div>`
    }).join('');
}

// Make functions globally accessible on the window object
window.deleteNote = deleteNoteFromFirestore;

window.shareNote = async function(noteData) {
    let displayTimestamp = 'N/A';
    if (noteData.createdAt && noteData.createdAt.toDate) {
        displayTimestamp = noteData.createdAt.toDate().toLocaleString('es-ES');
    }
    let shareText = `Nota Policial:
Fecha: ${displayTimestamp}
Lugar de Intervención: ${noteData.interventionLocation || 'N/A'}
Documento: ${noteData.documentNumber || 'N/A'}
Nombre: ${noteData.fullName || 'N/A'}
Lugar de Nacimiento: ${noteData.birthPlace || 'N/A'} 
Fecha de Nacimiento: ${noteData.birthdate || 'N/A'}
Padres: ${noteData.parentsName || 'N/A'}
Dirección: ${noteData.address || 'N/A'}
Teléfono: ${noteData.phone || 'N/A'}
Hechos: ${noteData.facts || 'N/A'}`;

    const shareOptions = { title: 'Nota Policial', text: shareText };

    if (noteData.photoUrl) {
        try {
            const response = await fetch(noteData.photoUrl);
            const blob = await response.blob();
            const photoFile = new File([blob], 'foto_nota.png', { type: 'image/png' });
            shareOptions.files = [photoFile];
        } catch (error) {
            console.error('Error al procesar la foto para compartir:', error);
        }
    }

    try {
        if (navigator.share) {
            await navigator.share(shareOptions);
        } else {
            alert('La función de compartir no es compatible con este navegador.');
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Error al compartir la nota:', err);
        }
    }
}

window.copyNoteText = async function(noteData) {
    let displayTimestamp = 'N/A';
    if (noteData.createdAt && noteData.createdAt.toDate) {
        displayTimestamp = noteData.createdAt.toDate().toLocaleString('es-ES');
    }
    let noteText = `Nota Policial:
Fecha: ${displayTimestamp}
Lugar de Intervención: ${noteData.interventionLocation || 'N/A'}
Documento: ${noteData.documentNumber || 'N/A'}
Nombre: ${noteData.fullName || 'N/A'}
Lugar de Nacimiento: ${noteData.birthPlace || 'N/A'}
Fecha de Nacimiento: ${noteData.birthdate || 'N/A'}
Padres: ${noteData.parentsName || 'N/A'}
Dirección: ${noteData.address || 'N/A'}
Teléfono: ${noteData.phone || 'N/A'}
Hechos: ${noteData.facts || 'N/A'}`;
    try {
        await navigator.clipboard.writeText(noteText);
        alert('Texto de la nota copiado al portapapeles.');
    } catch (err) {
        console.error('Error al copiar el texto:', err);
        alert('No se pudo copiar el texto.');
    }
}

window.downloadNotePhoto = function(photoUrl) {
    if (photoUrl) {
        const a = document.createElement('a');
        a.href = photoUrl;
        a.download = 'foto_nota.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else {
        alert('Esta nota no tiene foto.');
    }
}

// --- Report Generation & Camera ---

generateReportButton.addEventListener('click', async () => {
    if (!currentUserId) {
        alert("Debes estar conectado para generar un informe.");
        return;
    }
    const notesToReport = [];
    const notesCollection = collection(db, "users", currentUserId, "notes");
    const q = query(notesCollection); // Remove orderBy

    try {
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            notesToReport.push({ id: doc.id, ...doc.data() });
        });
        
        // Client-side sort for the report
        notesToReport.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toDate() : 0;
            const dateB = b.createdAt ? b.createdAt.toDate() : 0;
            return dateB - dateA;
        });
        
        let reportText = 'Informe de Intervenciones\n\n';
        notesToReport.forEach((note, index) => {
            let displayTimestamp = note.createdAt ? note.createdAt.toDate().toLocaleString('es-ES') : 'N/A';
            reportText += `Intervención ${index + 1}\n`;
            reportText += '---------------------------------\n';
            reportText += `Fecha y Hora: ${displayTimestamp}\n`;
            reportText += `Lugar de Intervención: ${note.interventionLocation || 'N/A'}\n`;
            reportText += `Documento: ${note.documentNumber || 'N/A'}\n`;
            reportText += `Nombre: ${note.fullName || 'N/A'}\n`;
            reportText += `Lugar de Nacimiento: ${note.birthPlace || 'N/A'}\n`;
            reportText += `Fecha de Nacimiento: ${note.birthdate || 'N/A'}\n`;
            reportText += `Padres: ${note.parentsName || 'N/A'}\n`;
            reportText += `Dirección: ${note.address || 'N/A'}\n`;
            reportText += `Teléfono: ${note.phone || 'N/A'}\n`;
            reportText += `Hechos: ${note.facts || 'N/A'}\n`;
            reportText += '---------------------------------\n\n';
        });

        const blob = new Blob([reportText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'informe_intervenciones.txt';
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error al generar el informe: ", error);
        alert("No se pudo generar el informe.");
    }
});


takePhotoButton.addEventListener('click', () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
            .then(stream => {
                mediaStream = stream;
                video.srcObject = stream;
                video.play();
                cameraModal.style.display = 'flex';
            })
            .catch(err => {
                console.error("Error al acceder a la cámara: ", err);
                alert("No se pudo acceder a la cámara.");
            });
    } else {
        alert("Tu navegador no soporta acceso a la cámara.");
    }
});

captureButton.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
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
