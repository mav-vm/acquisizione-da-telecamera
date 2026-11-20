function caricaScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Errore caricamento locale: ' + url));
    document.head.appendChild(script);
  });
}

async function assicuraTesseract() {
  if (typeof window.Tesseract !== 'undefined') {
    return window.Tesseract;
  }
  try {
    return await caricaScript('./tesseract/tesseract.min.js');
  } catch (e) {
    console.error(e);
    throw new Error("Impossibile caricare Tesseract locale.");
  }
}

async function elaboraDistinta(canvasElement, apiKey, onStatusUpdate) {
  const chiavePulita = (apiKey || '').trim();

  if (navigator.onLine && chiavePulita) {
    try {
      onStatusUpdate("Online: connessione a Gemini AI...");
      const giocatori = await estraiConGemini(canvasElement, chiavePulita, onStatusUpdate);
      return { fonte: "GEMINI_CLOUD", dati: giocatori };
    } catch (errore) {
      console.error("Errore Gemini:", errore);
      const boxJson = document.getElementById('outputJson');
      if (boxJson) {
        boxJson.textContent = "ERRORE GEMINI:\n" + errore.message;
      }
      throw new Error("Gemini non disponibile: " + errore.message);
    }
  }

  onStatusUpdate("Offline o senza API Key: avvio OCR locale Tesseract...");
  const giocatoriOffline = await estraiConTesseractOffline(canvasElement, onStatusUpdate);
  return { fonte: "TESSERACT_OFFLINE", dati: giocatoriOffline };
}

// Chiede direttamente a Google quali modelli sono attivi sulla tua chiave API
// Chiede direttamente a Google quali modelli FLASH veloci sono attivi sulla tua chiave API
async function ottieniModelliDisponibili(apiKey) {
  const urlLista = 'https://googleapis.com' + encodeURIComponent(apiKey);
  const res = await fetch(urlLista);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error && err.error.message ? err.error.message : ("Chiave API non valida (HTTP " + res.status + ")"));
  }
  const data = await res.json();
  const tutti = data.models || [];

  // Filtra solo i modelli Gemini FLASH veloci (esclude pro/thinking troppo lenti per mobile)
  const validi = tutti
    .filter(m => {
      if (!m.name || !Array.isArray(m.supportedGenerationMethods) || !m.supportedGenerationMethods.includes('generateContent')) return false;
      const n = m.name.toLowerCase();
      return n.includes('gemini') && n.includes('flash') && !n.includes('image') && !n.includes('tts') && !n.includes('audio');
    })
    .map(m => m.name.replace('models/', ''));

  // Ordina mettendo prima i modelli più recenti (es. 3.8, 3.5, 3, ecc.) e prima i flash standard rispetto ai lite
  validi.sort((a, b) => {
    const score = (nome) => {
      let s = 0;
      if (nome.includes('3.8') || nome.includes('4')) s += 30;
      else if (nome.includes('3.5') || nome.includes('3')) s += 20;
      if (nome.includes('lite')) s -= 5;
      if (nome.includes('preview') || nome.includes('exp')) s -= 2;
      return s;
    };
    return score(b) - score(a);
  });

  if (validi.length === 0) {
    throw new Error("Nessun modello Gemini Flash trovato su questa chiave API.");
  }
  return validi;
}

async function estraiConGemini(canvasElement, apiKey, onStatusUpdate) {
  // Ridimensiona a max 1280px con qualità 0.75: nitidissimo ma velocissimo da caricare in 4G
  const maxLato = 1280;
  let canvasInvio = canvasElement;
  if (Math.max(canvasElement.width, canvasElement.height) > maxLato) {
    const scala = maxLato / Math.max(canvasElement.width, canvasElement.height);
    canvasInvio = document.createElement('canvas');
    canvasInvio.width = Math.round(canvasElement.width * scala);
    canvasInvio.height = Math.round(canvasElement.height * scala);
    canvasInvio.getContext('2d').drawImage(canvasElement, 0, 0, canvasInvio.width, canvasInvio.height);
  }

  const dataUrl = canvasInvio.toDataURL('image/jpeg', 0.75);
  const base64Image = dataUrl.substring(dataUrl.indexOf(',') + 1);

  if (onStatusUpdate) onStatusUpdate("Verifica modelli Gemini Flash...");
  const modelliAttivi = await ottieniModelliDisponibili(apiKey);

  const promptTesto = `
Analizza questa immagine di una distinta di gara della Federazione Italiana Rugby (Mod. B).
Estrai dall'alto verso il basso i giocatori titolari, i giocatori in panchina e l'allenatore in fondo.

Regole rigorose:
1. GIOCATORI TITOLARI (prime 15 righe) E GIOCATORI IN PANCHINA (sezione "Giocatori in panchina"):
   - Ignora la riga separatrice "Giocatori in panchina" e le eventuali righe vuote con puntini.
   - "maglia": numero di maglia definitivo (1-99). Se il numero stampato è barrato o corretto a penna (es. 11 corretto in 35), restituisci il numero scritto a penna.
   - "ruolo": sigla nella colonna Ruolo (es. E, AD, CS, CD, AS, MA, MM, 3C, 3S, 3D, 2S, 2D, PD, T, PS, oppure RI per la panchina).
   - "cognome_nome": trascrivi "COGNOME, NOME" in maiuscolo. MANTIENI le diciture (IL), (V), (C) e le eventuali indicazioni di ruolo in panchina come (PS/T) o (T) se presenti accanto al nome. NON includere numero tessera FIR, data di nascita o numero documento.
2. ALLENATORE (in fondo al foglio, sotto "Sostituzioni"):
   - Aggiungi alla fine della lista l'Allenatore (campo "Allenatore:") con:
     - "maglia": ""
     - "ruolo": "ALL"
     - "cognome_nome": "COGNOME, NOME" in maiuscolo (pulito, senza altre diciture).

Restituisci esclusivamente un array JSON valido.
`;

  const responseSchema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        maglia: { type: "STRING" },
        ruolo: { type: "STRING" },
        cognome_nome: { type: "STRING" }
      },
      required: ["maglia", "ruolo", "cognome_nome"]
    }
  };

  const payload = {
    contents: [{
      parts: [
        { text: promptTesto },
        { inline_data: { mime_type: "image/jpeg", data: base64Image } }
      ]
    }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: responseSchema,
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  let ultimoErrore = null;

  for (const modello of modelliAttivi.slice(0, 3)) {
    if (onStatusUpdate) onStatusUpdate("Analisi rapida con " + modello + "...");
    const url = 'https://googleapis.com' + modello + ':generateContent?key=' + encodeURIComponent(apiKey);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const dettagli = errData.error && errData.error.message ? errData.error.message : ("HTTP " + response.status);
        throw new Error(modello + ": " + dettagli);
      }

      const data = await response.json();
      const candidate = data.candidates && data.candidates.at(0);
      const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts.at(0);
      const testoRisposta = part && part.text;

      if (!testoRisposta) {
        throw new Error("Risposta vuota da " + modello);
      }

      return JSON.parse(testoRisposta);
    } catch (err) {
      clearTimeout(timeoutId);
      ultimoErrore = err.name === 'AbortError' ? new Error("Timeout su " + modello) : err;
      console.warn("Tentativo fallito:", ultimoErrore.message);
    }
  }

  throw ultimoErrore || new Error("Nessun modello Gemini Flash ha risposto.");
}

function preparaStrisciaOCR(sourceCanvas, xPct, wPct) {
  // Aggiunge un margine interno del 3% per tagliare via i bordi verticali neri della tabella
  const margine = wPct * 0.04;
  const sx = Math.max(0, Math.round(sourceCanvas.width * (xPct + margine)));
  const sw = Math.max(10, Math.round(sourceCanvas.width * (wPct - margine * 2)));
  const sh = sourceCanvas.height;

  // Ingrandisce 1.5x per aiutare Tesseract sui caratteri piccoli
  const scala = 1.5;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.round(sw * scala);
  tempCanvas.height = Math.round(sh * scala);

  const ctx = tempCanvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  ctx.filter = 'grayscale(100%) contrast(180%) brightness(115%)';
  ctx.drawImage(sourceCanvas, sx, 0, sw, sh, 0, 0, tempCanvas.width, tempCanvas.height);
  return tempCanvas;
}

async function estraiConTesseractOffline(canvasElement, onStatusUpdate) {
  onStatusUpdate("Avvio OCR a colonne isolate...");
  const TesseractLib = await assicuraTesseract();

  // Legge le percentuali configurate negli slider dall'utente
  const colMagliaPct = (parseInt(document.getElementById('rangeColMaglia')?.value, 10) || 12) / 100;
  const colRuoloPct = (parseInt(document.getElementById('rangeColRuolo')?.value, 10) || 9) / 100;
  const colNomeStart = colMagliaPct + colRuoloPct;
  const colNomeWidth = 1 - colNomeStart;

  const canvasNomi = preparaStrisciaOCR(canvasElement, colNomeStart, colNomeWidth);
  const canvasMaglie = preparaStrisciaOCR(canvasElement, 0, colMagliaPct);

  const worker = await TesseractLib.createWorker('ita', 1, {
    workerPath: './tesseract/worker.min.js',
    corePath: './tesseract/tesseract-core.wasm.js',
    langPath: './tesseract',
    gzip: false,
    logger: m => {
      if (m.status === 'recognizing text') {
        onStatusUpdate(`Lettura OCR colonne: ${Math.round(m.progress * 100)}%`);
      }
    }
  });

  // 1. Legge SOLO la colonna Cognome e Nome (con whitelist caratteri)
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÈÉÌÒÙ'.,()- "
  });
  const resNomi = await worker.recognize(canvasNomi);

  // 2. Legge SOLO la colonna Numeri di Maglia
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    tessedit_char_whitelist: "0123456789"
  });
  const resMaglie = await worker.recognize(canvasMaglie);

  await worker.terminate();

  return combinaColonneModB(resMaglie.data.text, resNomi.data.text);
}

function combinaColonneModB(testoMaglie, testoNomi) {
  const righeNomi = testoNomi.split('\n')
    .map(r => r.toUpperCase()
      .replace(/^[IL|1]\s+/, '') // Rimuove residui di bordo sinistro scambiati per I o L
      .replace(/\s+[IL|1]$/, '') // Rimuove residui di bordo destro
      .replace(/\s+/g, ' ')
      .trim()
    )
    .filter(r => {
      if (r.length < 4) return false;
      // Scarta intestazioni e righe separatrici del Mod. B
      if (r.includes('COGNOME') || r.includes('PANCHINA') || r.includes('GIOCATORI') || r.includes('SOSTITUZIONI') || r.includes('ALLENATORE')) return false;
      return true;
    });

  const numeriMaglia = testoMaglie.split('\n')
    .map(r => r.replace(/\D/g, '').trim())
    .filter(n => n.length >= 1 && n.length <= 2);

  // Usa lo schema ruoli fisso del Mod. B (15->E ... 1->PS, poi RI)
  const ruoliFissi = ['E', 'AD', 'CS', 'CD', 'AS', 'MA', 'MM', '3C', '3S', '3D', '2S', '2D', 'PD', 'T', 'PS'];
  const maglieFisse = ['15', '14', '13', '12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1'];

  const giocatori = [];
  righeNomi.forEach((nome, idx) => {
    const isTitolare = idx < 15;
    const magliaDefault = isTitolare ? maglieFisse.at(idx) : String(16 + (idx - 15));
    const magliaLetta = numeriMaglia.at(idx);

    giocatori.push({
      maglia: magliaLetta || magliaDefault,
      ruolo: isTitolare ? ruoliFissi.at(idx) : 'RI',
      cognome_nome: nome
    });
  });

  return giocatori;
}

