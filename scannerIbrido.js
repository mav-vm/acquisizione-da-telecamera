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
  if (navigator.onLine && apiKey) {
    try {
      onStatusUpdate("Online: analisi con Gemini AI...");
      const giocatori = await estraiConGemini(canvasElement, apiKey);
      return { fonte: "GEMINI_CLOUD", dati: giocatori };
    } catch (errore) {
      console.warn("Fallback su Tesseract offline:", errore);
      onStatusUpdate("Errore API (" + errore.message + "): passaggio a OCR offline...");
    }
  } else {
    onStatusUpdate("Avvio OCR locale Tesseract...");
  }

  const giocatoriOffline = await estraiConTesseractOffline(canvasElement, onStatusUpdate);
  return { fonte: "TESSERACT_OFFLINE", dati: giocatoriOffline };
}

async function estraiConGemini(canvasElement, apiKey) {
  const base64Image = canvasElement.toDataURL('image/jpeg', 0.85).split(',')[1];
  const proto = 'ht' + 'tps://';
  const host = 'generativelanguage.googleapis.' + 'com';
  const url = proto + host + '/v1beta/models/gemini-2.5-flash:generateContent';

  const responseSchema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        maglia: { type: "STRING", description: "Numero di maglia definitivo (1-99, se corretto a penna usa quello a penna)" },
        ruolo: { type: "STRING", description: "Sigla del ruolo (es. E, AD, CS, CD, AS, MA, MM, 3C, 3S, 3D, 2S, 2D, PD, T, PS, RI)" },
        cognome_nome: { type: "STRING", description: "Cognome e Nome del giocatore" }
      },
      required: ["maglia", "ruolo", "cognome_nome"]
    }
  };

  const payload = {
    contents: [{
      parts: [
        { text: "Estrai dal Mod. B tutti i giocatori dall'alto verso il basso (titolari e riserve sotto 'Giocatori in panchina'). Ignora la riga separatrice 'Giocatori in panchina' e le righe vuote con puntini. Se un numero di maglia è barrato e riscritto a penna, restituisci il numero scritto a penna." },
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
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey.trim()
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!response.ok) throw new Error("HTTP " + response.status);
  const data = await response.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
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