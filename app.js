const video = document.getElementById('camera');
const canvas = document.getElementById('canvas');
const mirino = document.getElementById('mirino');
const btnScatta = document.getElementById('btnScatta');
const btnCopia = document.getElementById('btnCopia');
const stato = document.getElementById('stato');
const outputJson = document.getElementById('outputJson');
const badgeContainer = document.getElementById('badgeContainer');
const apiKeyInput = document.getElementById('apiKeyInput');

const btnToggleGrid = document.getElementById('btnToggleGrid');
const gridSettings = document.getElementById('gridSettings');
const rangeRighe = document.getElementById('rangeRighe');
const rangeColonne = document.getElementById('rangeColonne');
const rangeAltezza = document.getElementById('rangeAltezza');
const rangeLarghezza = document.getElementById('rangeLarghezza');

btnToggleGrid.addEventListener('click', () => {
  gridSettings.style.display = gridSettings.style.display === 'block' ? 'none' : 'block';
});

function aggiornaGriglia() {
  const righe = parseInt(rangeRighe.value, 10);
  const colonne = parseInt(rangeColonne.value, 10);
  const altezza = rangeAltezza.value + '%';
  const larghezza = rangeLarghezza.value + '%';

  document.getElementById('valRighe').innerText = righe;
  document.getElementById('valColonne').innerText = colonne;
  document.getElementById('valAltezza').innerText = altezza;
  document.getElementById('valLarghezza').innerText = larghezza;

  mirino.style.height = altezza;
  mirino.style.width = larghezza;
  mirino.style.gridTemplateColumns = colonne === 3 ? '16% 14% 70%' : `repeat(${colonne}, 1fr)`;
  mirino.style.gridTemplateRows = `repeat(${righe}, 1fr)`;

  mirino.innerHTML = '<span class="mirino-label">ALLINEA TABELLA GIOCATORI QUI</span>';
  for (let i = 0; i < righe * colonne; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    mirino.appendChild(cell);
  }

  localStorage.setItem('grid_prefs', JSON.stringify({
    righe, colonne, altezza: rangeAltezza.value, larghezza: rangeLarghezza.value
  }));
}

const savedPrefs = JSON.parse(localStorage.getItem('grid_prefs') || 'null');
if (savedPrefs) {
  rangeRighe.value = savedPrefs.righe;
  rangeColonne.value = savedPrefs.colonne;
  rangeAltezza.value = savedPrefs.altezza;
  rangeLarghezza.value = savedPrefs.larghezza;
}
[rangeRighe, rangeColonne, rangeAltezza, rangeLarghezza].forEach(el => el.addEventListener('input', aggiornaGriglia));
aggiornaGriglia();

apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
});

async function avviaCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    video.srcObject = stream;
    stato.innerText = navigator.onLine ? "Pronto (Online)" : "Pronto (Modalità Offline/Aereo)";
  } catch (err) {
    stato.innerText = "Errore camera: " + err.message;
  }
}

btnScatta.addEventListener('click', async () => {
  btnScatta.disabled = true;
  btnCopia.style.display = 'none';
  badgeContainer.innerHTML = '';

  const videoRect = video.getBoundingClientRect();
  const mirinoRect = mirino.getBoundingClientRect();
  const scaleX = video.videoWidth / videoRect.width;
  const scaleY = video.videoHeight / videoRect.height;

  const cropX = (mirinoRect.left - videoRect.left) * scaleX;
  const cropY = (mirinoRect.top - videoRect.top) * scaleY;
  const cropWidth = mirinoRect.width * scaleX;
  const cropHeight = mirinoRect.height * scaleY;

  canvas.width = cropWidth;
  canvas.height = cropHeight;
  canvas.getContext('2d').drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  try {
    const risultato = await elaboraDistinta(canvas, apiKeyInput.value.trim(), msg => { stato.innerText = msg; });
    badgeContainer.innerHTML = risultato.fonte === 'GEMINI_CLOUD'
      ? '<span class="badge online">ONLINE: Letto con Gemini AI</span>'
      : '<span class="badge offline">OFFLINE: Letto localmente</span>';
    outputJson.textContent = JSON.stringify(risultato.dati, null, 2);
    stato.innerText = `Estratti ${risultato.dati.length} giocatori.`;
    btnCopia.style.display = 'block';
  } catch (err) {
    stato.innerText = "Errore: " + err.message;
  } finally {
    btnScatta.disabled = false;
  }
});

btnCopia.addEventListener('click', () => {
  navigator.clipboard.writeText(outputJson.textContent);
  btnCopia.innerText = "Copiato!";
  setTimeout(() => { btnCopia.innerText = "Copia JSON"; }, 2000);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
}

avviaCamera();
