const RECORDER_DRY_INPUT = 0;
const RECORDER_WET_INPUT = 1;

class RecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.recording = true;
        this.paused = false; const RECORDER_DRY_INPUT = 0;
        const RECORDER_WET_INPUT = 1;

        class RecorderProcessor extends AudioWorkletProcessor {
            constructor() {
                super();
                this.recording = true;
                this.paused = false;

                // Handle messages from the main thread
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
                // Get input channels: dry (mono) and wet (stereo)
                const dryIn = inputs[RECORDER_DRY_INPUT] || [];   // Expected 1 channel (mono)
                const wetIn = inputs[RECORDER_WET_INPUT] || [];   // Expected 2 channels (stereo)

                // Process audio data only when recording and not paused
                if (this.recording && !this.paused) {
                    const blockSize = dryIn[0]?.length || wetIn[0]?.length || 128;

                    // Dry mono: take only the first available channel
                    const dry = dryIn[0] || new Float32Array(blockSize);

                    // Wet stereo: handle fallback if right channel is missing
                    const wetL = wetIn[0] || new Float32Array(blockSize);
                    const wetR = wetIn[1] || wetL;

                    // Send audio data back to the main thread
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

        //registerProcessor('s25-recorder-worklet', RecorderProcessor);

        // Handle messages from the main thread
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
        // Get input channels: dry (mono) and wet (stereo)
        const dryIn = inputs[RECORDER_DRY_INPUT] || [];   // Expected 1 channel (mono)
        const wetIn = inputs[RECORDER_WET_INPUT] || [];   // Expected 2 channels (stereo)

        // Process audio data only when recording and not paused
        if (this.recording && !this.paused) {
            const blockSize = dryIn[0]?.length || wetIn[0]?.length || 128;

            // Dry mono: take only the first available channel
            const dry = dryIn[0] || new Float32Array(blockSize);

            // Wet stereo: handle fallback if right channel is missing
            const wetL = wetIn[0] || new Float32Array(blockSize);
            const wetR = wetIn[1] || wetL;

            // Send audio data back to the main thread
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

registerProcessor('s25-recorder-worklet', RecorderProcessor);