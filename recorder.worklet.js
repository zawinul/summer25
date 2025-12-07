const RECORDER_DRY_INPUT = 0;
const RECORDER_WET_INPUT = 1;

class RecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.recording = true;
        this.paused = false;

        this.port.onmessage = (e) => {
            const cmd = e.data && e.data.command;
            if (!cmd) return;
            if (cmd === 'start') {
                this.recording = true;
                this.paused = false;
            } else if (cmd === 'pause') {
                this.paused = true;
            } else if (cmd === 'resume') {
                this.paused = false;
            } else if (cmd === 'stop') {
                this.recording = false;
                this.paused = false;
                this.port.postMessage({ event: 'stopped' });
            }
        };
    }

    process(inputs /*, outputs */) {
        const dryIn = inputs[RECORDER_DRY_INPUT] || [];   // atteso 1 canale (mono)
        const wetIn = inputs[RECORDER_WET_INPUT] || [];   // attesi 2 canali (stereo)

        if (this.recording && !this.paused) {
            const blockSize = dryIn[0]?.length || wetIn[0]?.length || 128;

            // Dry mono: prendi solo il primo canale disponibile
            const dry = dryIn[0] || new Float32Array(blockSize);

            // Wet stereo: gestisci fallback se manca R
            const wetL = wetIn[0] || new Float32Array(blockSize);
            const wetR = wetIn[1] || wetL;

            this.port.postMessage({
                type: 'data',
                dry: dry.slice(),
                wetL: wetL.slice(),
                wetR: wetR.slice()
            });
        }

        return true;
    }
}

registerProcessor('recorder-worklet', RecorderProcessor);