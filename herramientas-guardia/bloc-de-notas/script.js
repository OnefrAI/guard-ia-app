document.addEventListener('DOMContentLoaded', () => {
  const noteForm = document.getElementById('noteForm');
  const notesContainer = document.getElementById('notesContainer');
  const generateReportButton = document.getElementById('generateReportButton');
  const takePhotoButton = document.getElementById('takePhotoButton');
  const factsTextarea = document.getElementById('facts');
  const photoPreview = document.getElementById('photoPreview'); // Referencia para la vista previa

  // Variables para la cámara
  const cameraModal = document.getElementById('cameraModal');
  const video = document.getElementById('video');
  const captureButton = document.getElementById('captureButton');
  const cancelCaptureButton = document.getElementById('cancelCaptureButton');
  let mediaStream = null;
  let capturedPhotoDataUrl = null; 

  noteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveNote();
  });

  async function saveNote() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const formattedTimestamp = `${day}/${month}/${year} ${hours}:${minutes}`;

    const noteData = {
      interventionLocation: document.getElementById('interventionLocation').value,
      documentNumber: document.getElementById('documentNumber').value,
      fullName: document.getElementById('fullName').value,
      birthPlace: document.getElementById('birthPlace').value, // NUEVO CAMPO
      birthdate: document.getElementById('birthdate').value,
      parentsName: document.getElementById('parentsName').value,
      address: document.getElementById('address').value,
      phone: document.getElementById('phone').value,
      facts: factsTextarea.value,
      photoUrl: capturedPhotoDataUrl || '',
      timestamp: formattedTimestamp
    };

    const notes = JSON.parse(localStorage.getItem('notes')) || [];
    notes.push(noteData);
    localStorage.setItem('notes', JSON.stringify(notes));
    displayNotes();

    noteForm.reset();
    factsTextarea.value = '';
    capturedPhotoDataUrl = null;
    
    // OCULTAR Y LIMPIAR VISTA PREVIA
    if (photoPreview) {
      photoPreview.src = '#'; 
      photoPreview.style.display = 'none';
    }
    alert("Nota guardada exitosamente.");
  }

  async function shareNote(noteData) {
    let shareText = `Nota Policial:
Fecha y Hora: ${noteData.timestamp || 'N/A'}
Documento: ${noteData.documentNumber || 'N/A'}
Nombre: ${noteData.fullName || 'N/A'}
Lugar de Nacimiento: ${noteData.birthPlace || 'N/A'} 
Fecha de Nacimiento: ${noteData.birthdate || 'N/A'}
Padres: ${noteData.parentsName || 'N/A'}
Dirección: ${noteData.address || 'N/A'}
Teléfono: ${noteData.phone || 'N/A'}
Lugar de Intervención: ${noteData.interventionLocation || 'N/A'}
Hechos: ${noteData.facts || 'N/A'}`;

    const shareOptions = {
      title: 'Nota Policial',
      text: shareText,
    };

    if (noteData.photoUrl) {
      try {
        const response = await fetch(noteData.photoUrl);
        const blob = await response.blob();
        const photoFile = new File([blob], 'foto_nota.png', { type: 'image/png' });
        shareOptions.files = [photoFile];
      } catch (error) {
        console.error('Error al convertir la foto para compartir:', error);
      }
    }

    try {
      if (navigator.share) {
        await navigator.share(shareOptions);
        console.log('Nota compartida exitosamente.');
      } else {
        alert('La función de compartir nativa no es compatible con este navegador. Usa las opciones de "Copiar Texto" o "Descargar Foto".');
        console.log('Web Share API no soportada.');
      }
    } catch (err) {
      console.error('Error al compartir la nota:', err);
      if (err.name === 'AbortError') {
         console.log('Compartir cancelado por el usuario.');
      } else {
         alert("No se pudo compartir la nota. Inténtalo de nuevo.");
      }
    }
  }

  async function copyNoteText(noteData) {
      let noteText = `Nota Policial:
Fecha y Hora: ${noteData.timestamp || 'N/A'}
Documento: ${noteData.documentNumber || 'N/A'}
Nombre: ${noteData.fullName || 'N/A'}
Lugar de Nacimiento: ${noteData.birthPlace || 'N/A'}
Fecha de Nacimiento: ${noteData.birthdate || 'N/A'}
Padres: ${noteData.parentsName || 'N/A'}
Dirección: ${noteData.address || 'N/A'}
Teléfono: ${noteData.phone || 'N/A'}
Lugar de Intervención: ${noteData.interventionLocation || 'N/A'}
Hechos: ${noteData.facts || 'N/A'}`;
      try {
          await navigator.clipboard.writeText(noteText);
          alert('Texto de la nota copiado al portapapeles.');
      } catch (err) {
          console.error('Error al copiar el texto:', err);
          alert('No se pudo copiar el texto al portapapeles.');
      }
  }

  function downloadNotePhoto(photoUrl) {
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

  function displayNotes() {
    const notes = JSON.parse(localStorage.getItem('notes')) || [];
    if (notes.length === 0) {
      notesContainer.innerHTML = "<p>No hay notas guardadas.</p>";
      return;
    }
    notesContainer.innerHTML = notes.map((note, index) => `
      <div class="note">
          <p><strong>Fecha y Hora:</strong> ${note.timestamp || 'N/A'}</p>
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
             <button class="btn btn-delete" onclick="deleteNote(${index})">Eliminar</button>
             <button class="btn btn-share" onclick="shareNoteFromIndex(${index})">Compartir</button>
             <button class="btn btn-copy" onclick="copyNoteTextFromIndex(${index})">Copiar Texto</button>
             ${note.photoUrl ? `<button class="btn btn-download" onclick="downloadNotePhotoFromIndex(${index})">Descargar Foto</button>` : ''}
          </div>
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

  window.copyNoteTextFromIndex = function(index) {
      const notes = JSON.parse(localStorage.getItem('notes')) || [];
      if (index >= 0 && index < notes.length) {
          copyNoteText(notes[index]);
      }
  };

  window.downloadNotePhotoFromIndex = function(index) {
      const notes = JSON.parse(localStorage.getItem('notes')) || [];
      if (index >= 0 && index < notes.length && notes[index].photoUrl) {
          downloadNotePhoto(notes[index].photoUrl);
      } else {
          alert('Esta nota no tiene foto para descargar.');
      }
  };

  generateReportButton.addEventListener('click', generateReport);

  function generateReport() {
    const notes = JSON.parse(localStorage.getItem('notes')) || [];
    let reportText = 'Informe de Intervenciones\\n\\n';

    notes.forEach((note, index) => {
      reportText += `Intervención ${index + 1}\\n`;
      reportText += '---------------------------------\\n';
      reportText += `Fecha y Hora: ${note.timestamp || 'N/A'}\\n`;
      reportText += `Lugar de Intervención: ${note.interventionLocation || 'N/A'}\\n`;
      reportText += `Documento: ${note.documentNumber || 'N/A'}\\n`;
      reportText += `Nombre: ${note.fullName || 'N/A'}\\n`;
      reportText += `Lugar de Nacimiento: ${note.birthPlace || 'N/A'}\\n`;
      reportText += `Fecha de Nacimiento: ${note.birthdate || 'N/A'}\\n`;
      reportText += `Padres: ${note.parentsName || 'N/A'}\\n`;
      reportText += `Dirección: ${note.address || 'N/A'}\\n`;
      reportText += `Teléfono: ${note.phone || 'N/A'}\\n`;
      reportText += `Hechos: ${note.facts || 'N/A'}\\n`;
      reportText += '---------------------------------\\n\\n';
    });

    const blob = new Blob([reportText.replace(/\\n/g, '\n')], { type: 'text/plain' }); // Asegurar saltos de línea correctos
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'informe_intervenciones.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

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

  captureButton.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedPhotoDataUrl = canvas.toDataURL('image/png');
    
    // MOSTRAR VISTA PREVIA
    if (photoPreview) {
      photoPreview.src = capturedPhotoDataUrl;
      photoPreview.style.display = 'block';
    }
    
    closeCameraModal();
  });

  cancelCaptureButton.addEventListener('click', () => {
    // Opcional: si se cancela la captura, se podría limpiar `capturedPhotoDataUrl` 
    // y la vista previa si no se quiere mantener una foto previamente capturada para la nota actual.
    // Por ahora, solo cierra el modal, la foto se limpiará al guardar la nota.
    closeCameraModal();
  });

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
