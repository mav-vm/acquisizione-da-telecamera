const video = document.getElementById('camera');
const canvas = document.getElementById('canvas');
const mirino = document.getElementById('mirino');
const btnScatta = document.getElementById('btnScatta');
const btnModificaLista = document.getElementById('btnModificaLista');
const btnCopia = document.getElementById('btnCopia');
const stato = document.getElementById('stato');
const outputJson = document.getElementById('outputJson');
const badgeContainer = document.getElementById('badgeContainer');
const apiKeyInput = document.getElementById('apiKeyInput');

const btnToggleGrid = document.getElementById('btnToggleGrid');
const gridSettings = document.getElementById('gridSettings');
const rangeRigheTit = document.getElementById('rangeRigheTit');
const rangeRigheRis = document.getElementById('rangeRigheRis');
const rangeColMaglia = document.getElementById('rangeColMaglia');
const rangeColRuolo = document.getElementById('rangeColRuolo');
const rangeAltezza = document.getElementById('rangeAltezza');

const modalDuplicati = document.getElementById('modalDuplicati');
const modalBox = document.getElementById('modalBox');
const modalTitle = document.getElementById('modalTitle');
const modalList = document.getElementById('modalList');
const modalMsg = document.getElementById('modalMsg');
const previewRitaglio = document.getElementById('previewRitaglio');
const btnAggiungiRiga = document.getElementById('btnAggiungiRiga');
const btnConfermaCorrezione = document.getElementById('btnConfermaCorrezione');
const btnForzaJson = document.getElementById('btnForzaJson');
const zoomCameraRow = document.getElementById('zoomCameraRow');
const rangeZoomCamera = document.getElementById('rangeZoomCamera');
const valZoomCamera = document.getElementById('valZoomCamera');
let currentVideoTrack = null;







// Schema ruoli standard Mod. B FIR dall'alto verso il basso (Estremo -> Pilone Sinistro)
const SCHEMA_MOD_B_TITOLARI = [
  { maglia: '15', ruolo: 'E' },
  { maglia: '14', ruolo: 'AD' },
  { maglia: '13', ruolo: 'CD' },
  { maglia: '12', ruolo: 'CS' },
  { maglia: '11', ruolo: 'AS' },
  { maglia: '10', ruolo: 'MA' },
  { maglia: '9',  ruolo: 'MM' },
  { maglia: '8',  ruolo: '3C' },
  { maglia: '7',  ruolo: '3D' },
  { maglia: '6',  ruolo: '3S' },
  { maglia: '5',  ruolo: '2D' },
  { maglia: '4',  ruolo: '2S' },
  { maglia: '3',  ruolo: 'PD' },
  { maglia: '2',  ruolo: 'T' },
  { maglia: '1',  ruolo: 'PS' }
];

// Coordinate percentuali esatte della tabella giocatori dentro il foglio A4 FIR
const PDF_CALIBRATION = {
  tableLeft: 0.012,    // 1.2% dal bordo sinistro A4
  tableTop: 0.095,     // 9.5% dall'alto A4 (subito sotto intestazione N. Maglia | Ruolo | Cognome)
  tableWidth: 0.587,   // 58.7% larghezza A4 (copre Maglia + Ruolo + Cognome e Nome)
  tableHeight: 0.455,  // 45.5% altezza A4 (arriva fino alla riga 23 / fine panchina)
  colMagliaPct: 11.9,  // 7.0% / 58.7% = 11.9% della zona ritagliata
  colRuoloPct: 8.9     // 5.2% / 58.7% = 8.9% della zona ritagliata
};





let datiTemporanei = [];
let fonteTemporanea = '';

function creaListaPrecompilata() {
  const numTit = parseInt(rangeRigheTit.value, 10) || 15;
  const numRis = parseInt(rangeRigheRis.value, 10) || 7;
  const lista = [];

  for (let i = 0; i < numTit; i++) {
    const base = SCHEMA_MOD_B_TITOLARI[i] || { maglia: String(15 - i), ruolo: '' };
    lista.push({ maglia: base.maglia, ruolo: base.ruolo, cognome_nome: '' });
  }
  for (let r = 0; r < numRis; r++) {
    lista.push({ maglia: String(16 + r), ruolo: 'RI', cognome_nome: '' });
  }
  return lista;
}

function unisciConPrecompilata(datiEstratti) {
  const lista = creaListaPrecompilata();

  datiEstratti.forEach((estr, idx) => {
    const numMaglia = String(estr.maglia || '').trim();
    const nome = String(estr.cognome_nome || '').trim().toUpperCase();

    if (idx < lista.length) {
      // Mantiene il ruolo fisso della riga (E, AD, CD...) e aggiorna numero maglia (anche 99) e nome
      if (numMaglia) lista[idx].maglia = numMaglia;
      if (nome) lista[idx].cognome_nome = nome;
    } else if (numMaglia || nome) {
      lista.push({
        maglia: numMaglia,
        ruolo: String(estr.ruolo || 'RI').trim().toUpperCase(),
        cognome_nome: nome
      });
    }
  });

  return lista;
}

btnToggleGrid.addEventListener('click', () => {
  gridSettings.style.display = gridSettings.style.display === 'block' ? 'none' : 'block';
});

function aggiornaGriglia() {
  const righeTit = parseInt(rangeRigheTit.value, 10);
  const righeRis = parseInt(rangeRigheRis.value, 10);
  const colMagliaPct = parseInt(rangeColMaglia.value, 10); // default 12% della tabella
  const colRuoloPct = parseInt(rangeColRuolo.value, 10);   // default 9% della tabella
  const zoomMirino = parseInt(rangeAltezza.value, 10);      // controlla larghezza/zoom mirino (es. 88%)

  document.getElementById('valRigheTit').innerText = righeTit;
  document.getElementById('valRigheRis').innerText = righeRis;
  document.getElementById('valColMaglia').innerText = colMagliaPct + '%';
  document.getElementById('valColRuolo').innerText = colRuoloPct + '%';
  document.getElementById('valAltezza').innerText = zoomMirino + '%';

  // Dimensione grande e leggibile su smartphone mantenendo proporzione A4
  mirino.style.width = zoomMirino + '%';
  mirino.style.height = 'auto';
  mirino.style.aspectRatio = '210 / 297';
  mirino.style.maxHeight = '95%';

  // Calcola l'altezza della tabella blu in base al numero di righe (titolari + 2 vuote + panchina)
  const totaleRighe = righeTit + 2 + (righeRis > 0 ? righeRis + 1 : 0);
  const altezzaTabellaPct = Math.min(85, (totaleRighe * 1.82)).toFixed(1);

  mirino.innerHTML = `
    <span class="mirino-label">ALLINEA IL FOGLIO A4 AL BORDO VERDE</span>
    <div id="boxTabella" style="
      position: absolute;
      left: ${PDF_CALIBRATION.tableLeft * 100}%;
      top: ${PDF_CALIBRATION.tableTop * 100}%;
      width: ${PDF_CALIBRATION.tableWidth * 100}%;
      height: ${altezzaTabellaPct}%;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.14);
      display: grid;
      grid-template-columns: ${colMagliaPct}% ${colRuoloPct}% 1fr;
    ">
      <div style="border-right: 1px dashed #a855f7; background: rgba(168,85,247,0.12);"></div>
      <div style="border-right: 1px dashed #ef4444; background: rgba(239,68,68,0.12);"></div>
      <div></div>
    </div>
  `;

  localStorage.setItem('grid_prefs_modb', JSON.stringify({
    righeTit, righeRis, colMaglia: colMagliaPct, colRuolo: colRuoloPct, altezza: zoomMirino
  }));
}

function catturaMirinoEsatto() {
  const videoRect = video.getBoundingClientRect();
  // Ritaglia direttamente l'area esatta del riquadro blu (boxTabella) rispetto al video!
  const boxTabella = document.getElementById('boxTabella') || mirino;
  const targetRect = boxTabella.getBoundingClientRect();

  const videoRatio = video.videoWidth / video.videoHeight;
  const elemRatio = videoRect.width / videoRect.height;

  let renderWidth, renderHeight, offsetX, offsetY;
  if (elemRatio > videoRatio) {
    renderWidth = videoRect.width;
    renderHeight = videoRect.width / videoRatio;
    offsetX = 0;
    offsetY = (videoRect.height - renderHeight) / 2;
  } else {
    renderHeight = videoRect.height;
    renderWidth = videoRect.height * videoRatio;
    offsetX = (videoRect.width - renderWidth) / 2;
    offsetY = 0;
  }

  const scaleX = video.videoWidth / renderWidth;
  const scaleY = video.videoHeight / renderHeight;

  const cropX = (targetRect.left - videoRect.left - offsetX) * scaleX;
  const cropY = (targetRect.top - videoRect.top - offsetY) * scaleY;
  const cropWidth = targetRect.width * scaleX;
  const cropHeight = targetRect.height * scaleY;

  canvas.width = cropWidth;
  canvas.height = cropHeight;
  canvas.getContext('2d').drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
}




function creaCella(classe) {
  const cell = document.createElement('div');
  cell.className = classe;
  return cell;
}

const savedPrefs = JSON.parse(localStorage.getItem('grid_prefs_modb') || 'null');
if (savedPrefs) {
  rangeRigheTit.value = savedPrefs.righeTit ?? 15;
  rangeRigheRis.value = savedPrefs.righeRis ?? 7;
  rangeColMaglia.value = savedPrefs.colMaglia ?? 12;
  rangeColRuolo.value = savedPrefs.colRuolo ?? 11;
  rangeAltezza.value = savedPrefs.altezza ?? 82;
}
[rangeRigheTit, rangeRigheRis, rangeColMaglia, rangeColRuolo, rangeAltezza].forEach(el => {
  el.addEventListener('input', aggiornaGriglia);
});
aggiornaGriglia();
datiTemporanei = creaListaPrecompilata();

apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
});

function trovaMaglieDuplicate(giocatori) {
  const conteggio = {};
  giocatori.forEach(g => {
    const num = String(g.maglia || '').trim();
    if (num) conteggio[num] = (conteggio[num] || 0) + 1;
  });
  return Object.keys(conteggio).filter(num => conteggio[num] > 1);
}

function escapeHtml(str) {
  return String(str || '').replace(/"/g, '&quot;');
}

function creaRigaEditor(g, isDup) {
  const row = document.createElement('div');
  row.className = 'player-edit-row' + (isDup ? ' is-duplicate' : '');
  row.innerHTML = `
    <input type="text" class="edit-maglia" value="${escapeHtml(g.maglia)}" placeholder="N." aria-label="Numero maglia">
    <input type="text" class="edit-ruolo" value="${escapeHtml(g.ruolo)}" placeholder="Ruolo" aria-label="Ruolo">
    <input type="text" class="edit-nome" value="${escapeHtml(g.cognome_nome)}" placeholder="Cognome e Nome" aria-label="Cognome e Nome">
    <button type="button" class="danger-small btn-rimuovi" title="Elimina riga">×</button>
  `;
  row.querySelector('.btn-rimuovi').addEventListener('click', () => row.remove());
  return row;
}

function apriEditorLista(giocatori, duplicati = []) {
  if (duplicati.length > 0) {
    modalBox.classList.add('has-errors');
    modalTitle.innerText = "⚠️ Numeri di maglia duplicati";
    modalMsg.innerText = `Duplicati rilevati: ${duplicati.join(', ')}. Correggi le righe in rosso e premi Conferma.`;
  } else {
    modalBox.classList.remove('has-errors');
    modalTitle.innerText = "✏️ Verifica e Modifica Giocatori";
    modalMsg.innerText = "Controlla numeri e nominativi, poi premi Conferma per generare il JSON.";
  }

  modalList.innerHTML = '';
  giocatori.forEach(g => {
    const isDup = duplicati.includes(String(g.maglia || '').trim());
    modalList.appendChild(creaRigaEditor(g, isDup));
  });

  modalDuplicati.style.display = 'flex';
}

btnAggiungiRiga.addEventListener('click', () => {
  modalList.appendChild(creaRigaEditor({ maglia: '', ruolo: 'RI', cognome_nome: '' }, false));
  modalList.scrollTop = modalList.scrollHeight;
});

btnModificaLista.addEventListener('click', () => {
  apriEditorLista(datiTemporanei, trovaMaglieDuplicate(datiTemporanei));
});

function leggiRigheDaModale() {
  const rows = modalList.querySelectorAll('.player-edit-row');
  const aggiornati = [];
  rows.forEach(row => {
    const maglia = row.querySelector('.edit-maglia').value.trim();
    const ruolo = row.querySelector('.edit-ruolo').value.trim().toUpperCase();
    const cognome_nome = row.querySelector('.edit-nome').value.trim().toUpperCase();
    if (maglia || ruolo || cognome_nome) {
      aggiornati.push({ maglia, ruolo, cognome_nome });
    }
  });
  return aggiornati;
}

btnConfermaCorrezione.addEventListener('click', () => {
  datiTemporanei = leggiRigheDaModale();
  const nuoviDuplicati = trovaMaglieDuplicate(datiTemporanei);
  if (nuoviDuplicati.length > 0) {
    apriEditorLista(datiTemporanei, nuoviDuplicati);
  } else {
    modalDuplicati.style.display = 'none';
    finalizzaOutputJson(datiTemporanei, fonteTemporanea);
  }
});

btnForzaJson.addEventListener('click', () => {
  datiTemporanei = leggiRigheDaModale();
  modalDuplicati.style.display = 'none';
  finalizzaOutputJson(datiTemporanei, fonteTemporanea);
});

function finalizzaOutputJson(dati, fonte) {
  badgeContainer.innerHTML = fonte === 'GEMINI_CLOUD'
    ? '<span class="badge online">ONLINE: Letto con Gemini AI</span>'
    : '<span class="badge offline">OFFLINE: Letto localmente</span>';
  outputJson.textContent = JSON.stringify(dati, null, 2);
  stato.innerText = 'JSON pronto: ${dati.length} giocatori in lista.';
btnCopia.style.display = 'block';
}
// Ritaglio preciso compensando object-fit: cover su schermi allungati
function catturaMirinoEsatto() {
const videoRect = video.getBoundingClientRect();
const mirinoRect = mirino.getBoundingClientRect();
const videoRatio = video.videoWidth / video.videoHeight;
const elemRatio = videoRect.width / videoRect.height;
let renderWidth, renderHeight, offsetX, offsetY;
if (elemRatio > videoRatio) {
renderWidth = videoRect.width;
renderHeight = videoRect.width / videoRatio;
offsetX = 0;
offsetY = (videoRect.height - renderHeight) / 2;
} else {
renderHeight = videoRect.height;
renderWidth = videoRect.height * videoRatio;
offsetX = (videoRect.width - renderWidth) / 2;
offsetY = 0;
}
const scaleX = video.videoWidth / renderWidth;
const scaleY = video.videoHeight / renderHeight;
const cropX = (mirinoRect.left - videoRect.left - offsetX) * scaleX;
const cropY = (mirinoRect.top - videoRect.top - offsetY) * scaleY;
const cropWidth = mirinoRect.width * scaleX;
const cropHeight = mirinoRect.height * scaleY;
canvas.width = cropWidth;
canvas.height = cropHeight;
canvas.getContext('2d').drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
}
async function eseguiScansioneDaCanvas() {
// Mostra subito l'anteprima del ritaglio dentro il pop-up
previewRitaglio.src = canvas.toDataURL('image/jpeg', 0.7);
previewRitaglio.style.display = 'block';
try {
const apiKey = apiKeyInput.value.trim();
const risultato = await elaboraDistinta(canvas, apiKey, (msg) => {
stato.innerText = msg;
});
datiTemporanei = unisciConPrecompilata(risultato.dati);
fonteTemporanea = risultato.fonte;
apriEditorLista(datiTemporanei, trovaMaglieDuplicate(datiTemporanei));
stato.innerText = "Controlla i dati nel pop-up e premi Conferma.";
} catch (err) {
datiTemporanei = creaListaPrecompilata();
apriEditorLista(datiTemporanei, []);
stato.innerText = "OCR non riuscito (" + err.message + "): compila manualmente.";
}
}
btnScatta.addEventListener('click', async () => {
btnScatta.disabled = true;
btnCopia.style.display = 'none';
badgeContainer.innerHTML = '';
catturaMirinoEsatto();
await eseguiScansioneDaCanvas();
btnScatta.disabled = false;
});
btnCopia.addEventListener('click', async () => {
try {
await navigator.clipboard.writeText(outputJson.textContent);
stato.innerText = "JSON copiato negli appunti!";
} catch (err) {
stato.innerText = "Impossibile copiare automaticamente. Seleziona il testo.";
}
});
function configuraZoomCamera(stream) {
  const tracks = stream.getVideoTracks();
  if (!tracks || tracks.length === 0) return;
  currentVideoTrack = tracks[0];

  const capabilities = currentVideoTrack.getCapabilities ? currentVideoTrack.getCapabilities() : {};
  if (capabilities.zoom) {
    rangeZoomCamera.min = capabilities.zoom.min || 1;
    rangeZoomCamera.max = Math.min(capabilities.zoom.max || 4, 4);
    rangeZoomCamera.step = capabilities.zoom.step || 0.1;

    const zoomIniziale = Math.min(Math.max(1.3, capabilities.zoom.min), rangeZoomCamera.max);
    rangeZoomCamera.value = zoomIniziale;
    valZoomCamera.innerText = zoomIniziale.toFixed(1) + 'x';
    currentVideoTrack.applyConstraints({ advanced: [{ zoom: zoomIniziale }] }).catch(() => {});

    zoomCameraRow.style.display = 'flex';
  }
}

if (rangeZoomCamera) {
  rangeZoomCamera.addEventListener('input', async () => {
    const val = parseFloat(rangeZoomCamera.value);
    valZoomCamera.innerText = val.toFixed(1) + 'x';
    if (currentVideoTrack) {
      try {
        await currentVideoTrack.applyConstraints({ advanced: [{ zoom: val }] });
      } catch (e) {
        console.warn("Zoom non applicabile:", e);
      }
    }
  });
}

function avviaCameraConTimeout(vincoli, ms = 4000) {
  return Promise.race([
    navigator.mediaDevices.getUserMedia(vincoli),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout fotocamera")), ms))
  ]);
}

async function avviaCameraSicura() {
  stato.innerText = "Richiesta accesso fotocamera...";
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    stato.innerText = "Usa il tasto Fotocamera / Galleria qui sotto.";
    return;
  }
  try {
    const stream = await avviaCameraConTimeout({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    }, 4000);
    video.srcObject = stream;
    await video.play();
    configuraZoomCamera(stream);
    stato.innerText = navigator.onLine ? "Pronto (Online)" : "Pronto (Offline)";
  } catch (err) {
    try {
      const fallback = await avviaCameraConTimeout({ video: true, audio: false }, 3000);
      video.srcObject = fallback;
      await video.play();
      configuraZoomCamera(fallback);
      stato.innerText = "Pronto (Fotocamera standard)";
    } catch (err2) {
      stato.innerText = "Fotocamera live non disponibile. Usa Fotocamera / Galleria.";
    }
  }
}

avviaCameraSicura();

const inputFotoNativa = document.getElementById('inputFotoNativa');
const btnFotoNativa = document.getElementById('btnFotoNativa');

if (btnFotoNativa && inputFotoNativa) {
  btnFotoNativa.addEventListener('click', () => inputFotoNativa.click());
  inputFotoNativa.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = async () => {
      const cropX = img.width * PDF_CALIBRATION.tableLeft;
      const cropY = img.height * PDF_CALIBRATION.tableTop;
      const cropWidth = img.width * PDF_CALIBRATION.tableWidth;
      const cropHeight = img.height * PDF_CALIBRATION.tableHeight;

      canvas.width = cropWidth;
      canvas.height = cropHeight;
      canvas.getContext('2d').drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      stato.innerText = "Elaborazione foto acquisita...";
      await eseguiScansioneDaCanvas();
    };
    img.src = URL.createObjectURL(file);
  });
}
