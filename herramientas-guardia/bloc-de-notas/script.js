document.addEventListener('DOMContentLoaded', () => {
    const noteForm = document.getElementById('noteForm');
    const notesContainer = document.getElementById('notesContainer');
    const generateReportButton = document.getElementById('generateReportButton');
    const takePhotoButton = document.getElementById('takePhotoButton');
    const factsTextarea = document.getElementById('facts');
    const startDictationButton = document.getElementById('startDictation');
    const dictationTextElement = document.getElementById('dictationText');

    // Variables para la cámara
    const cameraModal = document.getElementById('cameraModal');
    const video = document.getElementById('video');
    const captureButton = document.getElementById('captureButton');
    const cancelCaptureButton = document.getElementById('cancelCaptureButton');
    let mediaStream = null;
    let capturedPhotoDataUrl = null; // Guardará la foto capturada
    let recognizing = false;
    let speechRecognition;

    // Función para convertir dataURL a Blob
    function dataURLtoBlob(dataurl) {
        const arr = dataurl.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        if (!mimeMatch) {
            throw new Error('No se pudo obtener el tipo MIME de la imagen');
        }
        const mime = mimeMatch[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }

    if ('webkitSpeechRecognition' in window) {
        speechRecognition = new webkitSpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'es-ES';

        speechRecognition.onstart = () => {
            recognizing = true;
            startDictationButton.classList.add('recording');
            dictationTextElement.textContent = 'Escuchando...';
        };

        speechRecognition.onerror = (event) => {
            console.error('Error de reconocimiento de voz:', event.error);
            recognizing = false;
            startDictationButton.classList.remove('recording');
            dictationTextElement.textContent = 'Comenzar a Dictar';
            if (event.error === 'no-speech') {
                alert('No se detectó habla. Por favor, habla de nuevo.');
            } else if (event.error === 'audio-capture') {
                alert('No se pudo acceder al micrófono. Asegúrate de que esté conectado y permitido.');
            } else if (event.error === 'network') {
                alert('Problema de red: verifica tu conexión a Internet.');
            } else if (event.error === 'aborted') {
                alert('El reconocimiento de voz se ha detenido.');
            } else {
                alert('Ocurrió un error durante el reconocimiento de voz. Inténtalo de nuevo.');
            }
        };

        speechRecognition.onend = () => {
            recognizing = false;
            startDictationButton.classList.remove('recording');
            dictationTextElement.textContent = 'Comenzar a Dictar';
        };

        speechRecognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            factsTextarea.value = finalTranscript + interimTranscript;
        };

        startDictationButton.addEventListener('click', () => {
            if (recognizing) {
                speechRecognition.stop();
            } else {
                speechRecognition.start();
            }
        });
    } else {
        startDictationButton.style.display = 'none';
        alert("El reconocimiento de voz no es compatible con este navegador.");
    }

    // Guardar la nota (incluye foto si fue tomada)
    noteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveNote();
    });

    async function saveNote() {
        const noteData = {
            interventionLocation: document.getElementById('interventionLocation').value,
            documentNumber: document.getElementById('documentNumber').value,
            fullName: document.getElementById('fullName').value,
            birthdate: document.getElementById('birthdate').value,
            parentsName: document.getElementById('parentsName').value,
            address: document.getElementById('address').value,
            phone: document.getElementById('phone').value,
            facts: factsTextarea.value,
            photoUrl: capturedPhotoDataUrl || '' // Incluye la foto si existe
        };

        const notes = JSON.parse(localStorage.getItem('notes')) || [];
        notes.push(noteData);
        localStorage.setItem('notes', JSON.stringify(notes));
        displayNotes();

        noteForm.reset();
        factsTextarea.value = '';
        // Reiniciar foto capturada para la siguiente nota
        capturedPhotoDataUrl = null;
        alert("Nota guardada exitosamente.");
    }

    // Función para compartir la nota (incluyendo la foto si está presente)
    async function shareNote(noteData) {
        let shareText = `Nota Policial:
Documento: ${noteData.documentNumber || 'N/A'}
Nombre: ${noteData.fullName || 'N/A'}
Fecha de Nacimiento: ${noteData.birthdate || 'N/A'}
Padres: ${noteData.parentsName || 'N/A'}
Dirección: ${noteData.address || 'N/A'}
Teléfono: ${noteData.phone || 'N/A'}
Lugar de Intervención: ${noteData.interventionLocation || 'N/A'}
Hechos: ${noteData.facts || 'N/A'}`;

        try {
            if (noteData.photoUrl) {
                // Convertir la dataURL a Blob mediante la función personalizada
                const blob = dataURLtoBlob(noteData.photoUrl);
                const file = new File([blob], 'foto_documento.png', { type: blob.type });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: 'Nota Policial',
                        text: shareText,
                        files: [file]
                    });
                    console.log('Nota compartida exitosamente con foto.');
                } else {
                    await navigator.share({
                        title: 'Nota Policial',
                        text: shareText + '\n\n[Foto no incluida, tu navegador no soporta compartir archivos]'
                    });
                    console.log('Nota compartida sin foto (limitación del navegador).');
                }
            } else {
                await navigator.share({
                    title: 'Nota Policial',
                    text: shareText
                });
                console.log('Nota compartida exitosamente.');
            }
        } catch (err) {
            console.error('Error al compartir:', err);
        }
    }

    // Mostrar las notas guardadas
    function displayNotes() {
        const notes = JSON.parse(localStorage.getItem('notes')) || [];
        if (notes.length === 0) {
            notesContainer.innerHTML = "<p>No hay notas guardadas.</p>";
            return;
        }
        notesContainer.innerHTML = notes.map((note, index) => `
            <div class="note">
                <p><strong>Lugar de Intervención:</strong> ${note.interventionLocation || 'N/A'}</p>
                <p><strong>Documento:</strong> ${note.documentNumber || 'N/A'}</p>
                <p><strong>Nombre:</strong> ${note.fullName || 'N/A'}</p>
                <p><strong>Fecha de nacimiento:</strong> ${note.birthdate || 'N/A'}</p>
                <p><strong>Padres:</strong> ${note.parentsName || 'N/A'}</p>
                <p><strong>Dirección:</strong> ${note.address || 'N/A'}</p>
                <p><strong>Teléfono:</strong> ${note.phone || 'N/A'}</p>
                <p><strong>Hechos:</strong> ${note.facts || 'N/A'}</p>
                ${note.photoUrl ? `<img src="${note.photoUrl}" alt="Foto del documento" class="note-photo">` : ''}
                <button class="btn delete-note-btn" onclick="deleteNote(${index})">Eliminar</button>
                <button class="btn" onclick="shareNoteFromIndex(${index})">Compartir</button>
            </div>
        `).join('');
    }

    window.deleteNote = function (index) {
        const notes = JSON.parse(localStorage.getItem('notes')) || [];
        if (index >= 0 && index < notes.length && confirm("¿Estás seguro de eliminar esta nota?")) {
            notes.splice(index, 1);
            localStorage.setItem('notes', JSON.stringify(notes));
            displayNotes();
        }
    };

    window.shareNoteFromIndex = function (index) {
        const notes = JSON.parse(localStorage.getItem('notes')) || [];
        if (index >= 0 && index < notes.length) {
            shareNote(notes[index]);
        }
    };

    // Generar informe en formato de texto
    generateReportButton.addEventListener('click', generateReport);

    function generateReport() {
        const notes = JSON.parse(localStorage.getItem('notes')) || [];
        let reportText = 'Informe de Intervenciones\n\n';

        notes.forEach((note, index) => {
            reportText += `Intervención ${index + 1}\n`;
            reportText += '---------------------------------\n';
            reportText += `Lugar de Intervención: ${note.interventionLocation || 'N/A'}\n`;
            reportText += `Documento: ${note.documentNumber || 'N/A'}\n`;
            reportText += `Nombre: ${note.fullName || 'N/A'}\n`;
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
    }

    // Abrir la cámara y mostrar el modal, forzando la cámara trasera
    takePhotoButton.addEventListener('click', openCameraModal);

    function openCameraModal() {
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
    }

    // Capturar la foto del video y guardarla
    captureButton.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        capturedPhotoDataUrl = canvas.toDataURL('image/png');
        closeCameraModal();
    });

    // Cancelar captura y cerrar el modal
    cancelCaptureButton.addEventListener('click', closeCameraModal);

    function closeCameraModal() {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
        video.srcObject = null;
        cameraModal.style.display = 'none';
    }

    displayNotes();
});
