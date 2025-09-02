// oscillator.worker.js

/**
 * Questo file definisce un AudioWorkletProcessor.
 * È un tipo speciale di worker ottimizzato per l'elaborazione audio in tempo reale.
 * Viene eseguito nel thread di rendering audio del browser per garantire bassa latenza e nessuna interruzione.
 */

class SineWaveProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.phase = 0;
        this.frequency = 440.0; // Frequenza fissa a 440 Hz (La)
        this.isRunning = true; // Inizia attivo ma viene controllato da messaggi

        // Gestisce i messaggi provenienti dal thread principale (main.js)
        this.port.onmessage = (event) => {
            if (event.data.action === 'start') {
                this.isRunning = true;
            } else if (event.data.action === 'pause' || event.data.action === 'stop') {
                this.isRunning = false;
            }
        };
		this.fenv = 0;
		this.env = 1;
		this.fmults = [1, 1.333333, 1.5, 2, 2.66667, 3, 4	];
		this.fmult = this.fmults[Math.floor(Math.random()*this.fmults.length)];

    }

    /**
     * Questo metodo viene chiamato dal motore audio del browser ogni volta
     * che ha bisogno di un nuovo blocco di campioni audio.
     * @param {Array} inputs - Array di input (non usato qui)
     * @param {Array} outputs - Array di output che dobbiamo riempire
     * @param {Object} parameters - Parametri audio (non usato qui)
     * @returns {boolean} - true per mantenere attivo il processore
     */
    process(inputs, outputs, parameters) {
        // Prendiamo il primo (e unico) output buffer
        const output = outputs[0];
        // Prendiamo il primo canale (l'oscillatore è mono)
        const channel = output[0];

        // Se non è in esecuzione, riempiamo il buffer di silenzio (0)
        if (!this.isRunning) {
            for (let i = 0; i < channel.length; i++) {
                channel[i] = 0;
            }
            return true; // Continua a processare
        }
        
        // Calcoliamo l'incremento di fase per ogni campione
        // sampleRate è una variabile globale disponibile negli AudioWorklet
        const phaseIncrement = (2 * Math.PI * this.frequency) / sampleRate;
        // Generiamo la sinusoide campione per campione
        for (let i = 0; i < channel.length; i++) {
			this.fenv += (this.env-this.fenv)*.001;
            channel[i] = Math.sin(this.phase)*this.fenv*this.fenv;
			this.env -= 13/sampleRate;
			if (this.env<=0) {
				this.env = 1;
				this.fmult = this.fmults[Math.floor(Math.random()*this.fmults.length)];
			}
            this.phase += phaseIncrement*this.fmult;
        }

        // Manteniamo la fase in un range gestibile per evitare problemi di precisione
        if (this.phase > 2 * Math.PI) {
            this.phase -= 2 * Math.PI;
        }

        // È importante restituire true per indicare che il processore deve rimanere attivo.
        return true;
    }
}

// Registriamo il nostro processore con un nome univoco.
// Questo nome sarà usato in main.js per creare un nodo audio basato su questo codice.
registerProcessor('sine-wave-processor', SineWaveProcessor);