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
  const path = '/v1beta/models/gemini-2.5-flash:generateContent?key=';
  const url = proto + host + path + encodeURIComponent(apiKey);

  const responseSchema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        maglia: { type: "STRING", description: "Numero di maglia definitivo (1-99, se corretto a penna usa quello a penna)" },
        ruolo: { type: "STRING", description: "Sigla del ruolo (es. E, AD, CD, CS, AS, MA, MM, 3C, 3D, 3S, 2D, 2S, PD, T, PS, RI)" },
        cognome_nome: { type: "STRING", description: "Cognome e Nome del giocatore" }
      },
      required: ["maglia", "ruolo", "cognome_nome"]
    }
  };

  const payload = {
    contents: [{
      parts: [
        { text: "Estrai dal Mod. B tutti i giocatori dall'alto verso il basso (titolari e riserve sotto 'Giocatori in panchina'). Ignora la riga separatrice 'Giocatori in panchina'. Se un numero di maglia è barrato e riscritto a penna, restituisci il numero scritto a penna." },
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
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!response.ok) throw new Error("HTTP " + response.status);
  const data = await response.json();
  return JSON.parse(data.candidates.content.parts[0].text);
}

function miglioraContrasto(sourceCanvas) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = sourceCanvas.width;
  tempCanvas.height = sourceCanvas.height;
  const ctx = tempCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const val = avg > 140 ? 255 : (avg < 80 ? 0 : avg);
    d[i] = d[i + 1] = d[i + 2] = val;
  }
  ctx.putImageData(imgData, 0, 0);
  return tempCanvas;
}

function ritagliaFascia(sourceCanvas, startPercent, widthPercent) {
  const temp = document.createElement('canvas');
  const sx = Math.floor(sourceCanvas.width * startPercent);
  const sw = Math.floor(sourceCanvas.width * widthPercent);
  temp.width = Math.max(1, sw);
  temp.height = sourceCanvas.height;
  temp.getContext('2d').drawImage(
    sourceCanvas,
    sx, 0, sw, sourceCanvas.height,
    0, 0, sw, sourceCanvas.height
  );
  return miglioraContrasto(temp);
}

async function estraiConTesseractOffline(canvasElement, onStatusUpdate) {
  onStatusUpdate("Caricamento motore OCR locale...");
  const TesseractLib = await assicuraTesseract();

    // Percentuali esatte calibrate sul PDF reale FIR
  const colMaglia = 0.119;
  const colRuolo = 0.089;

  const canvasMaglie = ritagliaFascia(canvasElement, 0.005, colMaglia - 0.01);
  const startNomi = colMaglia + colRuolo + 0.005;
  const canvasNomi = ritagliaFascia(canvasElement, startNomi, 1 - startNomi - 0.005);


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

  // 1. Legge SOLO numeri (0-9, inclusi 99) dalla prima colonna
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    tessedit_char_whitelist: '0123456789'
  });
  const resMaglie = await worker.recognize(canvasMaglie);

  // 2. Legge i nominativi dalla terza colonna
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    tessedit_char_whitelist: ''
  });
  const resNomi = await worker.recognize(canvasNomi);

  await worker.terminate();

  return combinaMaglieENomi(resMaglie.data.text, resNomi.data.text);
}

function combinaMaglieENomi(testoMaglie, testoNomi) {
  const numEstratti = testoMaglie
    .split('\n')
    .map(r => r.replace(/\D/g, '').trim())
    .filter(n => n.length >= 1 && n.length <= 2);

  const nomiEstratti = testoNomi
    .split('\n')
    .map(r => r.toUpperCase().replace(/[^A-ZÀ-Ü'\s.-]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(n => n.length >= 4 && !n.includes('PANCHINA') && !n.includes('COGNOME')&& !/^\.+$/.test(n));

  const totaleRighe = Math.max(numEstratti.length, nomiEstratti.length);
  const giocatori = [];

  for (let i = 0; i < totaleRighe; i++) {
    giocatori.push({
      maglia: numEstratti[i] || '',
      ruolo: '',
      cognome_nome: nomiEstratti[i] || ''
    });
  }

  return giocatori;
}