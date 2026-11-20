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

const zoomCameraRow = document.getElementById('zoomCameraRow');
const rangeZoomCamera = document.getElementById('rangeZoomCamera');
const valZoomCamera = document.getElementById('valZoomCamera');
let currentVideoTrack = null;

const modalDuplicati = document.getElementById('modalDuplicati');
const modalBox = document.getElementById('modalBox');
const modalTitle = document.getElementById('modalTitle');
const modalList = document.getElementById('modalList');
const modalMsg = document.getElementById('modalMsg');
const previewRitaglio = document.getElementById('previewRitaglio');
const btnAggiungiRiga = document.getElementById('btnAggiungiRiga');
const btnConfermaCorrezione = document.getElementById('btnConfermaCorrezione');
const btnForzaJson = document.getElementById('btnForzaJson');

const SCHEMA_MOD_B_TITOLARI = [
  { maglia: '15', ruolo: 'E' },
  { maglia: '14', ruolo: 'AD' },
  { maglia: '13', ruolo: 'CS' },
  { maglia: '12', ruolo: 'CD' },
  { maglia: '11', ruolo: 'AS' },
  { maglia: '10', ruolo: 'MA' },
  { maglia: '9',  ruolo: 'MM' },
  { maglia: '8',  ruolo: '3C' },
  { maglia: '7',  ruolo: '3S' },
  { maglia: '6',  ruolo: '3D' },
  { maglia: '5',  ruolo: '2S' },
  { maglia: '4',  ruolo: '2D' },
  { maglia: '3',  ruolo: 'PD' },
  { maglia: '2',  ruolo: 'T' },
  { maglia: '1',  ruolo: 'PS' }
];

const PDF_CALIBRATION = {
  tableLeft: 0.012,
  tableTop: 0.095,
  tableWidth: 0.587
};

let datiTemporanei = [];
let fonteTemporanea = '';
let ultimoErroreDebug = '';

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
  if (datiEstratti && datiEstratti.length >= 10 && datiEstratti.some(d => d.cognome_nome && d.cognome_nome.length > 3)) {
    return datiEstratti.map(estr => ({
      maglia: String(estr.maglia || '').trim(),
      ruolo: String(estr.ruolo || '').trim().toUpperCase(),
      cognome_nome: String(estr.cognome_nome || '').trim().toUpperCase()
    }));
  }

  const lista = creaListaPrecompilata();
  datiEstratti.forEach((estr, idx) => {
    const numMaglia = String(estr.maglia || '').trim();
    const nome = String(estr.cognome_nome || '').trim().toUpperCase();
    const ruolo = String(estr.ruolo || '').trim().toUpperCase();

    if (idx < lista.length && ruolo !== 'ALL') {
      if (numMaglia) lista[idx].maglia = numMaglia;
      if (nome) lista[idx].cognome_nome = nome;
    } else if (numMaglia || nome) {
      lista.push({
        maglia: numMaglia,
        ruolo: ruolo || 'RI',
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
  const colMagliaPct = parseInt(rangeColMaglia.value, 10);
  const colRuoloPct = parseInt(rangeColRuolo.value, 10);
  const zoomMirino = parseInt(rangeAltezza.value, 10);

  document.getElementById('valRigheTit').innerText = righeTit;
  document.getElementById('valRigheRis').innerText = righeRis;
  document.getElementById('valColMaglia').innerText = colMagliaPct + '%';
  document.getElementById('valColRuolo').innerText = colRuoloPct + '%';
  document.getElementById('valAltezza').innerText = zoomMirino + '%';

  // Calcola dimensioni esatte A4 (210x297) dentro il contenitore senza mai deformarlo
  const wrapper = mirino.parentElement;
  const maxW = wrapper.clientWidth * (zoomMirino / 100);
  const maxH = wrapper.clientHeight * 0.92;
  const ratioA4 = 210 / 297;

  let finalW = maxW;
  let finalH = finalW / ratioA4;
  if (finalH > maxH) {
    finalH = maxH;
    finalW = finalH * ratioA4;
  }

  mirino.style.width = Math.round(finalW) + 'px';
  mirino.style.height = Math.round(finalH) + 'px';

  const totaleRighe = righeTit + 2 + (righeRis > 0 ? righeRis + 1 : 0);
  const altezzaTabellaPct = Math.min(86, (totaleRighe * 1.82)).toFixed(1);

  // Genera le righe guida orizzontali per allineare facilmente il foglio
  let righeHtml = '';
  for (let i = 0; i < totaleRighe; i++) {
    righeHtml += `<div style="border-bottom: 1px solid rgba(59, 130, 246, 0.35); width: 100%; height: 100%;"></div>`;
  }

  mirino.innerHTML = `
    <span class="mirino-label">ALLINEA I BORDI DEL FOGLIO A4 AL VERDE</span>
    <div id="boxTabella" style="
      position: absolute;
      left: ${PDF_CALIBRATION.tableLeft * 100}%;
      top: ${PDF_CALIBRATION.tableTop * 100}%;
      width: ${PDF_CALIBRATION.tableWidth * 100}%;
      height: ${altezzaTabellaPct}%;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.08);
      display: grid;
      grid-template-columns: ${colMagliaPct}% ${colRuoloPct}% 1fr;
    ">
      <div style="border-right: 1px dashed #a855f7; background: rgba(168,85,247,0.10);"></div>
      <div style="border-right: 1px dashed #ef4444; background: rgba(239,68,68,0.10);"></div>
      <div style="display: grid; grid-template-rows: repeat(${totaleRighe}, 1fr);">${righeHtml}</div>
    </div>
  `;

  localStorage.setItem('grid_prefs_modb', JSON.stringify({
    righeTit, righeRis, colMaglia: colMagliaPct, colRuolo: colRuoloPct, altezza: zoomMirino
  }));
}
window.addEventListener('resize', aggiornaGriglia);


const savedPrefs = JSON.parse(localStorage.getItem('grid_prefs_modb') || 'null');
if (savedPrefs) {
  rangeRigheTit.value = savedPrefs.righeTit ?? 15;
  rangeRigheRis.value = savedPrefs.righeRis ?? 7;
  rangeColMaglia.value = savedPrefs.colMaglia ?? 12;
  rangeColRuolo.value = savedPrefs.colRuolo ?? 9;
  rangeAltezza.value = savedPrefs.altezza ?? 88;
}
[rangeRigheTit, rangeRigheRis, rangeColMaglia, rangeColRuolo, rangeAltezza].forEach(el => {
  el.addEventListener('input', aggiornaGriglia);
});
aggiornaGriglia();
datiTemporanei = creaListaPrecompilata();

// MODIFICA 1: Salvataggio istantaneo della API key durante la digitazione/incolla
apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
apiKeyInput.addEventListener('input', () => {
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
  
  if (ultimoErroreDebug) {
    outputJson.textContent = "⚠️ DETTAGLIO ERRORE:\n" + ultimoErroreDebug + "\n\n" + outputJson.textContent;
  }
});

function finalizzaOutputJson(dati, fonte) {
  badgeContainer.innerHTML = fonte === 'GEMINI_CLOUD'
    ? '<span class="badge online">ONLINE: Letto con Gemini AI</span>'
    : '<span class="badge offline">OFFLINE: Letto localmente</span>';
  outputJson.textContent = JSON.stringify(dati, null, 2);
  stato.innerText = `JSON pronto: ${dati.length} giocatori in lista.`;
  btnCopia.style.display = 'block';
}

function catturaMirinoEsatto() {
  const videoRect = video.getBoundingClientRect();
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

async function eseguiScansioneDaCanvas() {
	ultimoErroreDebug = '';
  previewRitaglio.src = canvas.toDataURL('image/jpeg', 0.75);
  previewRitaglio.style.display = 'block';

  if (typeof elaboraDistinta !== 'function') {
  	ultimoErroreDebug = "Funzione elaboraDistinta mancante nel progetto.";
    stato.innerText = "Errore:"+ ultimoErroreDebug";
    return;
  }

  try {
    const apiKey = apiKeyInput.value.trim() || localStorage.getItem('gemini_api_key') || '';
    stato.innerText = "Analisi immagine in corso...";
    const risultato = await elaboraDistinta(canvas, apiKey, (msg) => {
      stato.innerText = msg;
    });
    datiTemporanei = unisciConPrecompilata(risultato.dati);
    fonteTemporanea = risultato.fonte;
    apriEditorLista(datiTemporanei, trovaMaglieDuplicate(datiTemporanei));
    stato.innerText = "Controlla i dati nel pop-up e premi Conferma.";
  } catch (err) {
  	ultimoErroreDebug = err.message || String(err);
    datiTemporanei = creaListaPrecompilata();
    apriEditorLista(datiTemporanei, []);
    stato.innerText = "Errore Gemini: premi 'Chiudi / Forza JSON' per leggerlo.";
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

// MODIFICA 2: Funzione per spegnere la camera live e liberare hardware/RAM
function fermaCameraLive() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  currentVideoTrack = null;
  if (zoomCameraRow) zoomCameraRow.style.display = 'none';
}

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
  // Evita di riavviare la camera live se siamo appena rientrati da un tentativo di scatto nativo
  if (sessionStorage.getItem('usa_nativa') === '1') {
    sessionStorage.removeItem('usa_nativa');
    stato.innerText = "Se il browser ha ricaricato la pagina, usa 'Scegli da Galleria' per la foto appena scattata.";
    return;
  }

  stato.innerText = "Richiesta accesso fotocamera...";
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    stato.innerText = "Usa Fotocamera Nativa o Scegli da Galleria.";
    return;
  }
  try {
    const stream = await avviaCameraConTimeout({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
      stato.innerText = "Fotocamera live non disponibile. Usa Fotocamera Nativa o Galleria.";
    }
  }
}
avviaCameraSicura();

// MODIFICA 3: Caricamento immagine con FileReader e indice [0] corretto
function gestisciFileImmagine(file) {
  if (!file) return;
  sessionStorage.removeItem('usa_nativa');
  btnCopia.style.display = 'none';
  badgeContainer.innerHTML = '';
  stato.innerText = "Caricamento e ritaglio immagine...";

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = async () => {
      const righeTit = parseInt(rangeRigheTit.value, 10) || 15;
      const righeRis = parseInt(rangeRigheRis.value, 10) || 7;
      const totaleRighe = righeTit + 2 + (righeRis > 0 ? righeRis + 1 : 0);
      const altezzaTabellaPct = Math.min(0.86, (totaleRighe * 1.82) / 100);

      // Se l'immagine è verticale (foglio A4 intero), ritaglia direttamente la tabella
      const isVerticale = img.height > img.width * 1.15;
      const sx = isVerticale ? Math.round(img.width * PDF_CALIBRATION.tableLeft) : 0;
      const sy = isVerticale ? Math.round(img.height * PDF_CALIBRATION.tableTop) : 0;
      const sw = isVerticale ? Math.round(img.width * PDF_CALIBRATION.tableWidth) : img.width;
      const sh = isVerticale ? Math.round(img.height * altezzaTabellaPct) : img.height;

      const maxDim = 1400;
      const scale = Math.min(1, maxDim / Math.max(sw, sh));
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);

      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      await eseguiScansioneDaCanvas();
    };
    img.onerror = () => {
      stato.innerText = "Errore nella lettura del file immagine.";
    };
    img.src = event.target.result;
  };
  reader.onerror = () => {
    stato.innerText = "Impossibile leggere la foto dalla memoria.";
  };
  reader.readAsDataURL(file);
}


// Pulsante 1: Fotocamera Nativa
const btnFotoNativa = document.getElementById('btnFotoNativa');
const inputFotoNativa = document.getElementById('inputFotoNativa');
if (btnFotoNativa && inputFotoNativa) {
  btnFotoNativa.addEventListener('click', () => {
    fermaCameraLive();
    sessionStorage.setItem('usa_nativa', '1');
    inputFotoNativa.value = '';
    inputFotoNativa.click();
  });
  inputFotoNativa.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      gestisciFileImmagine(e.target.files[0]);
    }
  });
}

// Pulsante 2: Scegli da Galleria
const btnGalleria = document.getElementById('btnGalleria');
const inputGalleria = document.getElementById('inputGalleria');
if (btnGalleria && inputGalleria) {
  btnGalleria.addEventListener('click', () => {
    fermaCameraLive();
    inputGalleria.value = '';
    inputGalleria.click();
  });
  inputGalleria.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      gestisciFileImmagine(e.target.files[0]);
    }
  });
}
