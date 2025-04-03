document.addEventListener('DOMContentLoaded', () => {
  const noteForm = document.getElementById('noteForm');
  const notesContainer = document.getElementById('notesContainer');
  const generateReportButton = document.getElementById('generateReportButton');
  const takePhotoButton = document.getElementById('takePhotoButton');
  const factsTextarea = document.getElementById('facts');

  // Variables para la cámara
  const cameraModal = document.getElementById('cameraModal');
  const video = document.getElementById('video');
  const captureButton = document.getElementById('captureButton');
  const cancelCaptureButton = document.getElementById('cancelCaptureButton');
  let mediaStream = null;
  let capturedPhotoDataUrl = null; // Aquí se guardará la foto capturada

  // Guardar la nota (se incluye la foto si se capturó, pero al compartir solo se usa el texto)
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
      photoUrl: capturedPhotoDataUrl || '' // Se almacena la foto, pero no se comparte
    };

    const notes = JSON.parse(localStorage.getItem('notes')) || [];
    notes.push(noteData);
    localStorage.setItem('notes', JSON.stringify(notes));
    displayNotes();

    noteForm.reset();
    factsTextarea.value = '';
    // Reiniciar la foto capturada para la siguiente nota
    capturedPhotoDataUrl = null;
    alert("Nota guardada exitosamente.");
  }

  // Función para compartir la nota: solo se comparte el texto creado manualmente
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
      await navigator.share({
        title: 'Nota Policial',
        text: shareText
      });
      console.log('Nota compartida exitosamente (solo texto).');
    } catch (err) {
      console.error('Error al compartir la nota:', err);
      alert("No se pudo compartir la nota. Inténtalo de nuevo.");
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

  window.deleteNote = function(index) {
    const notes = JSON.parse(localStorage.getItem('notes')) || [];
    if (index >= 0 && index < notes.length && confirm("¿Estás seguro de eliminar esta nota?")) {
      notes.splice(index, 1);
      localStorage.setItem('notes', JSON.stringify(notes));
      displayNotes();
    }
  };

  window.shareNoteFromIndex = function(index) {
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

  // Abrir la cámara y mostrar el modal (forzando el uso de la cámara trasera)
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
