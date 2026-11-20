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
      onStatusUpdate("Online: analisi con Gemini AI...");
      const giocatori = await estraiConGemini(canvasElement, chiavePulita);
      return { fonte: "GEMINI_CLOUD", dati: giocatori };
    } catch (errore) {
      console.warn("Fallback su Tesseract offline:", errore);
      onStatusUpdate("Errore Gemini (" + errore.message + "): passaggio a OCR offline...");
      await new Promise(r => setTimeout(r, 2500));
    }
  } else if (!chiavePulita) {
    onStatusUpdate("API Key mancante: avvio OCR locale Tesseract...");
    await new Promise(r => setTimeout(r, 1500));
  } else {
    onStatusUpdate("Offline: avvio OCR locale Tesseract...");
  }

  const giocatoriOffline = await estraiConTesseractOffline(canvasElement, onStatusUpdate);
  return { fonte: "TESSERACT_OFFLINE", dati: giocatoriOffline };
}

async function estraiConGemini(canvasElement, apiKey) {
  const base64Image = canvasElement.toDataURL('image/jpeg', 0.85).split(',')[1];
  const url = `https://googleapis.com{encodeURIComponent(apiKey)}`;

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
        maglia: { type: "STRING", description: "Numero di maglia definitivo (1-99, se corretto a penna usa quello a penna; vuoto per allenatore)" },
        ruolo: { type: "STRING", description: "Sigla del ruolo (es. E, AD, CS, CD, AS, MA, MM, 3C, 3S, 3D, 2S, 2D, PD, T, PS, RI, ALL)" },
        cognome_nome: { type: "STRING", description: "Cognome e Nome (con eventuali sigle (IL), (V), (C) per i giocatori; pulito per l'allenatore)" }
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("Timeout connessione (25s)");
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const dettagli = errData.error?.message || ("HTTP " + response.status);
    throw new Error(dettagli);
  }

  const data = await response.json();
  const testoRisposta = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!testoRisposta) {
    throw new Error("Risposta vuota da Gemini");
  }

  return JSON.parse(testoRisposta);
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
    if (match && ruoliValidi.includes(match[2])) {
      const nomePulito = match[3]
        .split(/\b\d{5,}\b|\b\d{2}\/\d{2}\/\d{4}\b|\bC\.?I\.?\b|\bPASS\.?\b|\bPAT\.?\b/)[0]
        .replace(/[^A-ZÀ-Ü',().\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (nomePulito.length >= 4) {
        giocatori.push({
          maglia: match[1] ? match[1].trim() : '',
          ruolo: match[2].trim(),
          cognome_nome: nomePulito
        });
      }
    }
  }
  return giocatori;
}
