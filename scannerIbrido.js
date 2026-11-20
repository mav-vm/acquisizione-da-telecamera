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
async function ottieniModelliDisponibili(apiKey) {
  const urlLista = 'https://googleapis.com' + encodeURIComponent(apiKey);
  const res = await fetch(urlLista);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error && err.error.message ? err.error.message : ("Chiave API non valida (HTTP " + res.status + ")"));
  }
  const data = await res.json();
  const tutti = data.models || [];

  // Filtra solo i modelli Gemini che supportano generateContent (esclude embedding, imagen, ecc.)
  const validi = tutti
    .filter(m => m.name && m.name.includes('gemini') && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map(m => m.name.replace('models/', ''));

  // Dai priorità ai modelli Flash/Pro più recenti
  validi.sort((a, b) => {
    const score = (nome) => {
      let s = 0;
      if (nome.includes('flash')) s += 10;
      if (nome.includes('pro')) s += 5;
      if (nome.includes('lite')) s -= 2;
      if (nome.includes('exp') || nome.includes('preview')) s -= 1;
      return s;
    };
    return score(b) - score(a);
  });

  if (validi.length === 0) {
    throw new Error("Nessun modello Gemini attivo trovato su questa chiave API.");
  }
  return validi;
}

async function estraiConGemini(canvasElement, apiKey, onStatusUpdate) {
  // Alta qualità (0.85) per leggere perfettamente anche le correzioni a penna
  const dataUrl = canvasElement.toDataURL('image/jpeg', 0.85);
  const base64Image = dataUrl.substring(dataUrl.indexOf(',') + 1);

  if (onStatusUpdate) onStatusUpdate("Verifica modelli Gemini attivi...");
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
      temperature: 0.1
    }
  };

  let ultimoErrore = null;

  // Prova in automatico i primi 4 modelli disponibili finché uno risponde con successo
  for (const modello of modelliAttivi.slice(0, 4)) {
    if (onStatusUpdate) onStatusUpdate("Analisi con " + modello + "...");
    const url = 'https://googleapis.com' + modello + ':generateContent?key=' + encodeURIComponent(apiKey);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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

  throw ultimoErrore || new Error("Nessun modello Gemini ha risposto.");
}

function miglioraContrasto(sourceCanvas) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = sourceCanvas.width;
  tempCanvas.height = sourceCanvas.height;
  const ctx = tempCanvas.getContext('2d');
  ctx.filter = 'grayscale(100%) contrast(165%) brightness(115%)';
  ctx.drawImage(sourceCanvas, 0, 0);
  return tempCanvas;
}

async function estraiConTesseractOffline(canvasElement, onStatusUpdate) {
  onStatusUpdate("Caricamento motore OCR locale...");
  const TesseractLib = await assicuraTesseract();
  const canvasOttimizzato = miglioraContrasto(canvasElement);

  const worker = await TesseractLib.createWorker('ita', 1, {
    workerPath: './tesseract/worker.min.js',
    corePath: './tesseract/tesseract-core.wasm.js',
    langPath: './tesseract',
    gzip: false,
    logger: m => {
      if (m.status === 'recognizing text') {
        onStatusUpdate(`Lettura OCR: ${Math.round(m.progress * 100)}%`);
      }
    }
  });

  await worker.setParameters({ tessedit_pageseg_mode: '6' });
  const { data: { text } } = await worker.recognize(canvasOttimizzato);
  await worker.terminate();

  return analizzaRigheIntereModB(text);
}

function analizzaRigheIntereModB(testoGrezzo) {
  const righe = testoGrezzo.split('\n');
  const giocatori = [];
  const ruoliValidi = ['E', 'AD', 'CS', 'CD', 'AS', 'MA', 'MM', '3C', '3S', '3D', '2S', '2D', 'PD', 'T', 'PS', 'RI'];

  for (const riga of righe) {
    const upper = riga.toUpperCase().trim();
    if (!upper || upper.includes('PANCHINA') || upper.includes('COGNOME') || upper.includes('ALLENATORE')) continue;

    const match = upper.match(/(?:^|\b)(\d{1,2})?\s*\|?\s*(E|AD|CS|CD|AS|MA|MM|3C|3S|3D|2S|2D|PD|T|PS|RI)\s*\|?\s*([A-ZÀ-Ü'.,\s()-]{5,})/);
    if (match && ruoliValidi.includes(match.at(2))) {
      const nomePulito = match.at(3)
        .split(/\b\d{5,}\b|\b\d{2}\/\d{2}\/\d{4}\b|\bC\.?I\.?\b|\bPASS\.?\b|\bPAT\.?\b/)
        .at(0)
        .replace(/[^A-ZÀ-Ü',().\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (nomePulito.length >= 4) {
        giocatori.push({
          maglia: match.at(1) ? match.at(1).trim() : '',
          ruolo: match.at(2).trim(),
          cognome_nome: nomePulito
        });
      }
    }
  }
  return giocatori;
}
