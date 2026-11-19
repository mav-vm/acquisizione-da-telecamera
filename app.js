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
const rangeLarghezza = document.getElementById('rangeLarghezza');

// Elementi Pop-up Editor / Duplicati
const modalDuplicati = document.getElementById('modalDuplicati');
const modalBox = document.getElementById('modalBox');
const modalTitle = document.getElementById('modalTitle');
const modalList = document.getElementById('modalList');
const modalMsg = document.getElementById('modalMsg');
const btnAggiungiRiga = document.getElementById('btnAggiungiRiga');
const btnConfermaCorrezione = document.getElementById('btnConfermaCorrezione');
const btnForzaJson = document.getElementById('btnForzaJson');

let datiTemporanei = [];
let fonteTemporanea = '';
// Schema standard Mod. B FIR dall'alto verso il basso (15 -> 1 + Riserve)
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
    // Cerca la riga con lo stesso numero di maglia; se non la trova, usa la posizione
    let target = lista.find(r => r.maglia === numMaglia && !r.cognome_nome);
    if (!target && idx < lista.length) {
      target = lista[idx];
    }

    if (target) {
      if (numMaglia) target.maglia = numMaglia;
      if (estr.ruolo && !target.ruolo) target.ruolo = estr.ruolo.trim().toUpperCase();
      if (estr.cognome_nome) target.cognome_nome = estr.cognome_nome.trim().toUpperCase();
    } else {
      lista.push({
        maglia: numMaglia,
        ruolo: String(estr.ruolo || '').trim().toUpperCase(),
        cognome_nome: String(estr.cognome_nome || '').trim().toUpperCase()
      });
    }
  });

  return lista;
}

// Precompila subito la lista all'avvio così anche "Modifica Lista" è già pronta
datiTemporanei = creaListaPrecompilata();




btnToggleGrid.addEventListener('click', () => {
  gridSettings.style.display = gridSettings.style.display === 'block' ? 'none' : 'block';
});

function aggiornaGriglia() {
  const righeTit = parseInt(rangeRigheTit.value, 10);
  const righeRis = parseInt(rangeRigheRis.value, 10);
  const colMaglia = parseInt(rangeColMaglia.value, 10);
  const colRuolo = parseInt(rangeColRuolo.value, 10);
  const colNome = 100 - colMaglia - colRuolo;
  const altezza = rangeAltezza.value + '%';
  const larghezza = rangeLarghezza.value + '%';

  document.getElementById('valRigheTit').innerText = righeTit;
  document.getElementById('valRigheRis').innerText = righeRis;
  document.getElementById('valColMaglia').innerText = colMaglia + '%';
  document.getElementById('valColRuolo').innerText = colRuolo + '%';
  document.getElementById('valAltezza').innerText = altezza;
  document.getElementById('valLarghezza').innerText = larghezza;

  mirino.style.height = altezza;
  mirino.style.width = larghezza;
  mirino.style.gridTemplateColumns = `${colMaglia}% ${colRuolo}% ${colNome}%`;

  const templateRighe = righeRis > 0
    ? `repeat(${righeTit}, 1fr) 0.9fr repeat(${righeRis}, 1fr)`
    : `repeat(${righeTit}, 1fr)`;
  mirino.style.gridTemplateRows = templateRighe;

  mirino.innerHTML = '<span class="mirino-label">ALLINEA TABELLA MOD. B QUI</span>';

  for (let r = 0; r < righeTit; r++) {
    mirino.appendChild(creaCella('col-maglia'));
    mirino.appendChild(creaCella('col-ruolo'));
    mirino.appendChild(creaCella('col-nome'));
  }

  if (righeRis > 0) {
    const fascia = document.createElement('div');
    fascia.className = 'row-panchina';
    fascia.innerText = 'Giocatori in panchina';
    mirino.appendChild(fascia);

    for (let r = 0; r < righeRis; r++) {
      mirino.appendChild(creaCella('col-maglia'));
      mirino.appendChild(creaCella('col-ruolo'));
      mirino.appendChild(creaCella('col-nome'));
    }
  }

  localStorage.setItem('grid_prefs_modb', JSON.stringify({
    righeTit,
    righeRis,
    colMaglia,
    colRuolo,
    altezza: rangeAltezza.value,
    larghezza: rangeLarghezza.value
  }));
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
  rangeLarghezza.value = savedPrefs.larghezza ?? 92;
}
[rangeRigheTit, rangeRigheRis, rangeColMaglia, rangeColRuolo, rangeAltezza, rangeLarghezza].forEach(el => {
  el.addEventListener('input', aggiornaGriglia);
});
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

function trovaMaglieDuplicate(giocatori) {
  const conteggio = {};
  giocatori.forEach(g => {
    const num = String(g.maglia || '').trim();
    if (num) {
      conteggio[num] = (conteggio[num] || 0) + 1;
    }
  });
  return Object.keys(conteggio).filter(num => conteggio[num] > 1);
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

  row.querySelector('.btn-rimuovi').addEventListener('click', () => {
    row.remove();
  });

  return row;
}

/**
 * Apre l'editor della lista (evidenziando eventuali numeri duplicati)
 */
function apriEditorLista(giocatori, duplicati = []) {
  if (duplicati.length > 0) {
    modalBox.classList.add('has-errors');
    modalTitle.innerText = "⚠️ Numeri di maglia duplicati";
    modalMsg.innerText = `Duplicati rilevati: ${duplicati.join(', ')}. Correggi le righe in rosso e premi Conferma.`;
  } else {
    modalBox.classList.remove('has-errors');
    modalTitle.innerText = "✏️ Modifica Lista Giocatori";
    modalMsg.innerText = "Puoi correggere numeri, ruoli o nominativi e premere Conferma per aggiornare il JSON.";
  }

  modalList.innerHTML = '';
  giocatori.forEach(g => {
    const isDup = duplicati.includes(String(g.maglia || '').trim());
    modalList.appendChild(creaRigaEditor(g, isDup));
  });

  modalDuplicati.style.display = 'flex';
}

function escapeHtml(str) {
  return String(str || '').replace(/"/g, '&quot;');
}

btnAggiungiRiga.addEventListener('click', () => {
  const nuovaRiga = creaRigaEditor({ maglia: '', ruolo: '', cognome_nome: '' }, false);
  modalList.appendChild(nuovaRiga);
  modalList.scrollTop = modalList.scrollHeight;
});

btnModificaLista.addEventListener('click', () => {
  const duplicatiAttuali = trovaMaglieDuplicate(datiTemporanei);
  apriEditorLista(datiTemporanei, duplicatiAttuali);
});

btnConfermaCorrezione.addEventListener('click', () => {
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

  datiTemporanei = aggiornati;
  const nuoviDuplicati = trovaMaglieDuplicate(datiTemporanei);

  if (nuoviDuplicati.length > 0) {
    apriEditorLista(datiTemporanei, nuoviDuplicati);
  } else {
    modalDuplicati.style.display = 'none';
    finalizzaOutputJson(datiTemporanei, fonteTemporanea);
  }
});

btnForzaJson.addEventListener('click', () => {
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
  datiTemporanei = aggiornati;
  modalDuplicati.style.display = 'none';
  finalizzaOutputJson(datiTemporanei, fonteTemporanea);
});

function finalizzaOutputJson(dati, fonte) {
  badgeContainer.innerHTML = fonte === 'GEMINI_CLOUD'
    ? '<span class="badge online">ONLINE: Letto con Gemini AI</span>'
    : '<span class="badge offline">OFFLINE: Letto localmente</span>';
  outputJson.textContent = JSON.stringify(dati, null, 2);
  stato.innerText = `JSON pronto: ${dati.length} giocatori in lista.`;
  btnModificaLista.style.display = 'block';
  btnCopia.style.display = 'block';
}

/*
btnScatta.addEventListener('click', async () => {
  btnScatta.disabled = true;
  btnModificaLista.style.display = 'none';
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
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  try {
    const apiKey = apiKeyInput.value.trim();
    const risultato = await elaboraDistinta(canvas, apiKey, (msg) => {
      stato.innerText = msg;
    });

    datiTemporanei = risultato.dati;
    fonteTemporanea = risultato.fonte;

    const duplicati = trovaMaglieDuplicate(datiTemporanei);
    if (duplicati.length > 0) {
      apriEditorLista(datiTemporanei, duplicati);
    } else {
      finalizzaOutputJson(datiTemporanei, fonteTemporanea);
    }
  } catch (err) {
    stato.innerText = "Errore durante l'estrazione: " + err.message;
  } finally {
    btnScatta.disabled = false;
  }
});
*/

btnCopia.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(outputJson.textContent);
    stato.innerText = "JSON copiato negli appunti!";
  } catch (err) {
    stato.innerText = "Impossibile copiare automaticamente. Seleziona il testo.";
  }
});

// Versione robusta di avviaCamera con fallback se la risoluzione HD blocca il dispositivo
// Sostituisci tutta la parte finale di app.js da "async function avviaCamera" in poi con questo:

function avviaCameraConTimeout(vincoli, ms = 4000) {
  return Promise.race([
    navigator.mediaDevices.getUserMedia(vincoli),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout fotocamera (browser bloccato)")), ms)
    )
  ]);
}

async function avviaCameraSicura() {
  stato.innerText = "Richiesta accesso fotocamera...";

  if (!window.isSecureContext) {
    stato.innerText = "Errore: l'app richiede HTTPS per usare la fotocamera.";
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    stato.innerText = "Fotocamera non supportata qui. Apri il link in Chrome o Safari.";
    return;
  }

  try {
    const stream = await avviaCameraConTimeout({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    }, 4000);
    video.srcObject = stream;
    await video.play();
    stato.innerText = navigator.onLine ? "Pronto (Online)" : "Pronto (Modalità Offline)";
  } catch (err) {
    try {
      const fallbackStream = await avviaCameraConTimeout({ video: true, audio: false }, 3000);
      video.srcObject = fallbackStream;
      await video.play();
      stato.innerText = "Pronto (Fotocamera standard)";
    } catch (err2) {
      stato.innerHTML = `Fotocamera bloccata (${err2.message}).<br><strong>Tocca i 3 puntini in alto a destra &rarr; "Apri in Chrome"</strong> oppure premi il tasto blu sotto.`;
      btnScatta.innerText = "Riprova / Carica Foto";
    }
  }
}

avviaCameraSicura();

const inputFotoNativa = document.getElementById('inputFotoNativa');
const btnFotoNativa = document.getElementById('btnFotoNativa');

if (btnFotoNativa && inputFotoNativa) {
  btnFotoNativa.addEventListener('click', () => inputFotoNativa.click());
/*
  inputFotoNativa.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      stato.innerText = "Elaborazione foto acquisita...";
      try {
        const apiKey = apiKeyInput.value.trim();
        const risultato = await elaboraDistinta(canvas, apiKey, (msg) => {
          stato.innerText = msg;
        });
        datiTemporanei = risultato.dati;
        fonteTemporanea = risultato.fonte;

        const duplicati = trovaMaglieDuplicate(datiTemporanei);
        if (duplicati.length > 0) {
          apriEditorLista(datiTemporanei, duplicati);
        } else {
          finalizzaOutputJson(datiTemporanei, fonteTemporanea);
        }
      } catch (err) {
        stato.innerText = "Errore estrazione: " + err.message;
      }
    };
    img.src = URL.createObjectURL(file);
  });
  */
  async function eseguiScansioneDaCanvas() {
  try {
    const apiKey = apiKeyInput.value.trim();
    const risultato = await elaboraDistinta(canvas, apiKey, (msg) => {
      stato.innerText = msg;
    });

    datiTemporanei = unisciConPrecompilata(risultato.dati);
    fonteTemporanea = risultato.fonte;

    const duplicati = trovaMaglieDuplicate(datiTemporanei);
    // Apre SEMPRE il pop-up di verifica dopo lo scatto
    apriEditorLista(datiTemporanei, duplicati);
    stato.innerText = "Controlla i nominativi nel pop-up e premi Conferma.";
  } catch (err) {
    // Anche in caso di errore OCR, apre la lista precompilata per non bloccarti
    datiTemporanei = creaListaPrecompilata();
    apriEditorLista(datiTemporanei, []);
    stato.innerText = "OCR non riuscito (" + err.message + "): compila manualmente.";
  }
}

btnScatta.addEventListener('click', async () => {
  btnScatta.disabled = true;
  btnModificaLista.style.display = 'none';
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
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  await eseguiScansioneDaCanvas();
  btnScatta.disabled = false;
});

if (btnFotoNativa && inputFotoNativa) {
  btnFotoNativa.addEventListener('click', () => inputFotoNativa.click());

  inputFotoNativa.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      stato.innerText = "Elaborazione foto acquisita...";
      await eseguiScansioneDaCanvas();
    };
    img.src = URL.createObjectURL(file);
  });
}

  
}





