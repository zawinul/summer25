/* funzione generata inizialmente da gemini AIStudio con questo prompt:
Sto scrivendo un programma di manipolazione audio in js su web. Ho la FFT di un segnale calcolata su 4096 punti e ho calcolato le magnitudini di ogni banda. 
Vorrei calcolare il profilo dello spettro, una curva dolce che disegna l'andamento dello spettro. 
Il risultato deve comunque essere un'array di 2048 valori. 
Vorrei che la risoluzione con cui il profilo segue le ampiezze originali fosse proporzionale al numero di semitoni di distanza tra una banda e l'altra, 
quindi una risoluzione maggiore sulle bande basse e minore su quelle alte. 
Genera la funzione
*/

/**
 * Calcola il profilo spettrale dolce di un segnale audio a partire dalle magnitudini della sua FFT.
 * La risoluzione segue un andamento logaritmico, simile alla percezione in semitoni.
 *
 * @param {Float32Array|Array<number>} fftMagnitudes Un array di 4096 magnitudini FFT.
 * @param {number} sampleRate La frequenza di campionamento dell'audio originale (es. 44100).
 * @param {number} numBands Numero di bande logaritmiche in cui raggruppare lo spettro. Un valore più alto dà più dettaglio.
 * @param {number} smoothingFactor Fattore di smoothing per la curva finale (numero di punti per la media mobile).
 * @returns {Float32Array} Un array di 2048 valori che rappresenta il profilo spettrale.
 */
function calcolaProfiloSpettrale(fftMagnitudes, sampleRate, numBands = 120, smoothingFactor = 5) {
    const fftSize = 4096;
    const halfFftSize = fftSize / 2;

    // 1. Raggruppamento Logaritmico delle Bande
    const logBands = new Float32Array(numBands).fill(0);
    const bandCounts = new Uint8Array(numBands).fill(0);

    const maxFreq = sampleRate / 2;
    // Calcola la frequenza di ogni bin della FFT
    const freqs = Array.from({ length: halfFftSize }, (_, i) => (i * maxFreq) / halfFftSize);

    // Calcola i limiti di frequenza per ogni banda logaritmica
    const minFreq = freqs[1]; // Inizia dalla prima frequenza non nulla
    const logMaxFreq = Math.log2(maxFreq);
    const logMinFreq = Math.log2(minFreq);
    const logBandWidth = (logMaxFreq - logMinFreq) / numBands;

    const bandLimits = Array.from({ length: numBands + 1 }, (_, i) =>
        Math.pow(2, logMinFreq + i * logBandWidth)
    );

    // Assegna ogni bin FFT a una banda logaritmica e calcola la media
    for (let i = 1; i < halfFftSize; i++) {
        const freq = freqs[i];
        for (let j = 0; j < numBands; j++) {
            if (freq >= bandLimits[j] && freq < bandLimits[j + 1]) {
                logBands[j] += fftMagnitudes[i];
                bandCounts[j]++;
                break;
            }
        }
    }

    // Calcola la magnitudine media per ogni banda
    const averagedBands = logBands.map((sum, i) => (bandCounts[i] > 0 ? sum / bandCounts[i] : 0));

    // 2. Interpolazione Lineare per tornare a 2048 punti
    const interpolatedProfile = new Float32Array(halfFftSize);
    for (let i = 0; i < halfFftSize; i++) {
        const freq = freqs[i];
        let bandIndex = 0;
        while (bandIndex < numBands - 1 && freq > bandLimits[bandIndex + 1]) {
            bandIndex++;
        }

        if (bandIndex >= numBands - 1) {
            interpolatedProfile[i] = averagedBands[numBands - 1];
        } else {
            const x1 = bandLimits[bandIndex];
            const y1 = averagedBands[bandIndex];
            const x2 = bandLimits[bandIndex + 1];
            const y2 = averagedBands[bandIndex + 1];

            // Interpolazione lineare
            if (x2 - x1 > 0) {
                interpolatedProfile[i] = y1 + ((freq - x1) * (y2 - y1)) / (x2 - x1);
            } else {
                interpolatedProfile[i] = y1;
            }
        }
    }

    return interpolatedProfile;

    // 3. Smoothing con Media Mobile
    const smoothedProfile = new Float32Array(halfFftSize);
    for (let i = 0; i < halfFftSize; i++) {
        let sum = 0;
        let count = 0;
        for (let j = -Math.floor(smoothingFactor / 2); j <= Math.floor(smoothingFactor / 2); j++) {
            const index = i + j;
            if (index >= 0 && index < halfFftSize) {
                sum += interpolatedProfile[index];
                count++;
            }
        }
        smoothedProfile[i] = sum / count;
    }


    return smoothedProfile;
}

/*
// Esempio di utilizzo:

// Supponiamo di avere le magnitudini della FFT in un array
// (qui generiamo dati casuali per l'esempio)
const magnitudiniFFT = new Float32Array(4096);
for (let i = 0; i < 2048; i++) {
    // Simuliamo dei picchi spettrali
    if (i > 100 && i < 120) magnitudiniFFT[i] = Math.random() * 0.8 + 0.1;
    if (i > 500 && i < 530) magnitudiniFFT[i] = Math.random() * 0.6 + 0.1;
    if (i > 1500 && i < 1550) magnitudiniFFT[i] = Math.random() * 0.4 + 0.05;
    else magnitudiniFFT[i] += Math.random() * 0.05;
}


const sampleRate = 44100;
const profiloSpettrale = calcolaProfiloSpettrale(magnitudiniFFT, sampleRate);

console.log("Profilo Spettrale Calcolato:", profiloSpettrale);
console.log("Lunghezza del Profilo:", profiloSpettrale.length);
*/