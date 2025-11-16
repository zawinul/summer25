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

    process(inputs, outputs) {
        const input = inputs[0] || [];
        const output = outputs[0] || [];

        const chs = Math.min(input.length, output.length);
        for (let ch = 0; ch < chs; ch++) {
            output[ch].set(input[ch]);
        }
        for (let ch = chs; ch < output.length; ch++) {
            output[ch].fill(0);
        }

        // Invio dei campioni al main thread quando attivo
        if (this.recording && !this.paused && input.length > 0) {
            const blockSize = input[0]?.length || 128;
            const left = input[0] || new Float32Array(blockSize);
            const right = input[1] || left; // se mono, duplica sul destro

            // Copie per sicurezza (evita mutazioni)
            const leftCopy = left.slice();
            const rightCopy = right.slice();

            this.port.postMessage({
                type: 'data',
                left: leftCopy,
                right: rightCopy
            });
        }

        return true;
    }
}

registerProcessor('recorder-worklet', RecorderProcessor);