# acquisizione-da-telecamera
# Scanner Distinte Mod. B (Rugby OCR)

Progressive Web App (PWA) ibrida per l'acquisizione tramite fotocamera dei dati dei giocatori (N. Maglia, Ruolo, Cognome e Nome) dal **Modello B della Federazione Italiana Rugby**, con generazione di output JSON verificato.

🌐 **App online:** [https://github.io](https://github.io)

---

## Funzionalità principali

* **Mirino calibrato sul Mod. B:**
  * Colonne evidenziate con colori distinti: **N. Maglia** (viola, `12%`), **Ruolo** (rosso, `11%`), **Cognome e Nome** (blu, `77%`).
  * Suddivisione righe per **15 titolari**, fascia gialla separatrice *"Giocatori in panchina"* e **7 riserve**.
  * Tutti i parametri della griglia (righe, larghezze colonne, dimensioni mirino) sono regolabili tramite slider e salvati automaticamente in `localStorage`.
* **Motore di riconoscimento ibrido (Online + Offline):**
  * **Online (Gemini 2.5 Flash):** Se la rete è attiva e viene inserita una Gemini API Key, utilizza lo *Structured Output* per estrarre i dati in JSON, riconoscendo anche eventuali numeri di maglia barrati e corretti a penna.
  * **Offline (Tesseract.js v5):** In assenza di rete o in modalità aereo, applica un filtro di pre-elaborazione del contrasto sul ritaglio e legge localmente il testo in italiano.
* **Controllo duplicati ed Editor interattivo:**
  * Rileva automaticamente eventuali numeri di maglia duplicati ed evidenzia le righe interessate in rosso dentro un pop-up di correzione.
  * Permette di aprire manualmente l'editor (**Modifica Lista**), correggere singoli campi, aggiungere o eliminare righe e ricontrollare i duplicati prima di generare e copiare il JSON finale.

---

## Struttura del repository

* `index.html` — Interfaccia utente, stili, mirino sovrapposto al flusso video e pop-up di verifica/modifica.
* `app.js` — Gestione fotocamera (`getUserMedia`), ritaglio su `<canvas>`, salvataggio impostazioni, controllo duplicati ed editor lista.
* `scannerIbrido.js` — Logica di estrazione cloud (`gemini-2.5-flash`) con fallback locale (`Tesseract.js`) e parser regex per il Mod. B.
* `manifest.json` — Configurazione PWA per l'installazione su dispositivi mobili.
* `sw.js` — Service Worker (`modb-ocr-cache-v6`) per il funzionamento offline e il caching degli asset.

---

## Utilizzo rapido

1. Apri l'app da smartphone (consigliato Chrome su Android o Safari su iOS) e consenti l'accesso alla fotocamera.
2. *(Opzionale)* Tocca **Regola Griglia / API** per inserire la tua **Gemini API Key** (salvata solo localmente sul dispositivo) e adattare la griglia al foglio.
3. Inquadra la tabella dei giocatori allineando i numeri di maglia, i ruoli e la fascia gialla *"Giocatori in panchina"*.
4. Premi **Scatta ed Estrai**, verifica eventuali avvisi sui duplicati o usa **Modifica Lista** per rifinire i dati, infine premi **Copia JSON**.

---

## Stato di avanzamento & Prossimi sviluppi

* [x] Acquisizione fotocamera posteriore e ritaglio area mirino su `<canvas>`.
* [x] Griglia regolabile con fasce colorate (Maglia, Ruolo, Nominativo, Panchina).
* [x] Estrazione ibrida Gemini AI + Tesseract offline.
* [x] Controllo automatico maglie duplicate ed editor interattivo pre-JSON.
* [ ] *(Opzionale)* Estrazione intestazione gara (squadre, data, ora, categoria).
* [ ] *(Opzionale)* Esportazione diretta in formato CSV / Excel oltre al JSON.
