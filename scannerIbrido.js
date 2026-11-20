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
  if (onStatusUpdate) onStatusUpdate("Analisi con Gemini 4 Hydrogen...");
  const dataUrl = canvasElement.toDataURL('image/jpeg', 0.80);
  const base64Image = dataUrl.substring(dataUrl.indexOf(',') + 1);
  
  const proto = 'ht' + 'tps://';
  const host = 'generativelanguage.googleapis.' + 'com';
  const path = '/v1beta/models/gemini-4-hydrogen:generateContent?key=';
  const url = proto + host + path + encodeURIComponent(apiKey.trim());


  const prompt = `Leggi questa distinta rugby Mod. B. Restituisci SOLO un array JSON puro (senza markdown) con tutti i giocatori dall'alto in basso (titolari e riserve) e l'allenatore in fondo.
Formato esatto: [{"maglia":"15","ruolo":"E","cognome_nome":"COGNOME, NOME"}]
Regole:
- Se il numero maglia è corretto a penna, usa quello a penna.
- Mantieni (IL), (1L), (V), (C) e ruoli panchina accanto al nome. Escludi tessera FIR e date.
- Per l'allenatore in fondo usa: {"maglia":"","ruolo":"ALL","cognome_nome":"COGNOME, NOME"}.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
          ]
        }],
        generationConfig: {
          temperature: 0.1
        }
      }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(err.name === 'AbortError' ? 'Timeout connessione (25s)' : err.message);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error && err.error.message ? err.error.message : 'HTTP ' + res.status);
  }

  const data = await res.json();
  const candidate = data.candidates && data.candidates.at(0);
  const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts.at(0);
  const rawText = part && part.text ? part.text : '[]';
  const jsonPulito = rawText.replace(/```json|```/g, '').trim();
  return JSON.parse(jsonPulito);
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

