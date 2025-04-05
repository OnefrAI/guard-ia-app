// service-worker.js

// 1. Definir un nombre y versión para nuestra caché
const CACHE_NAME = 'guardia-cache-v1';

// 2. Listar los archivos que queremos guardar en caché para el modo offline
//    (¡Asegúrate de que las rutas son correctas desde la raíz de tu proyecto!)
const urlsToCache = [
  // App Shell & Core Assets
  '/', // La página principal (index.html)
  '/manifest.json', // El manifiesto que ya creamos
  '/icons/icon-192x192.png', // Iconos necesarios
  '/icons/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css', // CSS de Font Awesome (externo)

  // Herramienta: Bloc de Notas (para que funcione offline)
  '/herramientas-guardia/bloc-de-notas/index.html',
  '/herramientas-guardia/bloc-de-notas/styles.css',
  '/herramientas-guardia/bloc-de-notas/script.js'

  // --- Notas ---
  // - No incluimos aquí la Calculadora ni la Marca de Agua para empezar simple.
  // - Tampoco incluimos Google Fonts ni Tailwind CDN para no complicar el primer caché.
  // - Si necesitaras offline MÁS cosas, habría que añadirlas a esta lista.
];

// 3. Evento 'install': Se dispara cuando el navegador instala el Service Worker por primera vez (o al actualizarse)
self.addEventListener('install', event => {
  console.log('[SW] Evento install detectado');
  // Espera hasta que la promesa dentro de waitUntil se complete
  event.waitUntil(
    caches.open(CACHE_NAME) // Abre (o crea) la caché con nuestro nombre
      .then(cache => {
        console.log('[SW] Cache abierta, añadiendo archivos principales (App Shell + BlocNotas)');
        return cache.addAll(urlsToCache); // Intenta descargar y guardar TODOS los archivos de la lista
      })
      .then(() => {
        console.log('[SW] ¡Archivos cacheados con éxito!');
        // Opcional: Forzar la activación inmediata del nuevo SW
        // self.skipWaiting();
      })
      .catch(error => {
        // Si falla al descargar CUALQUIER archivo de la lista, la instalación falla.
        console.error('[SW] Fallo al cachear archivos durante la instalación:', error);
      })
  );
});

// Por ahora, no añadimos más eventos (activate, fetch). Solo la instalación.
console.log('[SW] Service Worker cargado (pero solo con lógica de instalación por ahora).');