async function elaboraDistinta(canvasElement, apiKey, onStatusUpdate) {
  if (navigator.onLine && apiKey) {
    try {
      onStatusUpdate("Online: analisi con Gemini AI...");
      const giocatori = await estraiConGemini(canvasElement, apiKey);
      return { fonte: "GEMINI_CLOUD", dati: giocatori };
    } catch (errore) {
      console.warn("Fallback su Tesseract offline:", errore);
      onStatusUpdate("Rete lenta/errore API: passaggio a OCR offline...");
    }
  } else {
    onStatusUpdate("Offline/Aereo: avvio OCR locale Tesseract...");
  }

  const giocatoriOffline = await estraiConTesseractOffline(canvasElement, onStatusUpdate);
  return { fonte: "TESSERACT_OFFLINE", dati: giocatoriOffline };
}

async function estraiConGemini(canvasElement, apiKey) {
  const base64Image = canvasElement.toDataURL('image/jpeg', 0.85).split(',')[1];
  const url = `https://googleapis.com{encodeURIComponent(apiKey)}`;

  const responseSchema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        maglia: { type: "STRING", description: "Numero di maglia definitivo (se corretto a penna usa quello a penna)" },
        ruolo: { type: "STRING", description: "Sigla del ruolo (es. E, AD, CS, CD, AS, MA, MM, 3C, 3S, 3D, 2S, 2D, PD, T, PS, RI)" },
        cognome_nome: { type: "STRING", description: "Cognome e Nome del giocatore" }
      },
      required: ["maglia", "ruolo", "cognome_nome"]
    }
  };

  const payload = {
    contents: [{
      parts: [
        { text: "Estrai dal Mod. B tutti i giocatori (titolari e riserve sotto 'Giocatori in panchina'). Ignora la riga separatrice 'Giocatori in panchina'. Se un numero di maglia è barrato e riscritto a penna, restituisci il numero scritto a penna." },
        { inline_data: { mime_type: "image/jpeg", data: base64Image } }
      ]
    }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: responseSchema,
      temperature: 0.1
    }
  };

  // Timeout massimo di 8 secondi per evitare blocchi su connessioni lente
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!response.ok) throw new Error("HTTP " + response.status);
  const data = await response.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

async function estraiConTesseractOffline(canvasElement, onStatusUpdate) {
  if (typeof Tesseract === 'undefined') {
    throw new Error("Libreria Tesseract non ancora caricata. Riprova tra qualche secondo.");
  }

  const canvasOttimizzato = miglioraContrasto(canvasElement);

  const { data: { text } } = await Tesseract.recognize(
    canvasOttimizzato,
    'ita',
    {
      logger: m => {
        if (m.status === 'recognizing text') {
          onStatusUpdate(`Lettura offline: ${Math.round(m.progress * 100)}%`);
        }
      }
    }
  );

  return analizzaTestoModB(text);
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

function analizzaTestoModB(testoGrezzo) {
  const righe = testoGrezzo.split('\n');
  const giocatori = [];
  const regexRiga = /^\s*(\d{1,2})[^\w\n]*([A-Z0-9]{1,3})\s+([A-ZÀ-Ü'\s,().-]{5,})/;

  for (const riga of righe) {
    if (riga.toUpperCase().includes('PANCHINA')) continue;
    const match = riga.match(regexRiga);
    if (match) {
      const numero = parseInt(match[1], 10);
      if (numero >= 1 && numero <= 26) {
        const nomePulito = match[3].split(/\d{5,}/)[0].trim();
        giocatori.push({
          maglia: numero.toString(),
          ruolo: match[2].trim(),
          cognome_nome: nomePulito
        });
      }
    }
  }
  return giocatori;
}
