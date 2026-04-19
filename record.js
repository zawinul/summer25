// Record.js - Audio recording management with graphical visualization

// Configuration constants
const SPACE_SECONDS = 30; // Initial recording duration in seconds
const EXTRA_SECONDS = 10; // Additional seconds for each extension
const drawPow = .5; // Power for visualization
const SLICESIZE = 100000; // size of a single slice

/**
 * Initializes the audio recorder with canvas visualization management
 * @param {AudioContext} audioContext - Web Audio API audio context
 * @param {HTMLCanvasElement} canvas - Canvas element for visualization
 */
async function initRecorder(audioContext, canvas) {
    await audioContext.audioWorklet.addModule('recorder.worklet.js');

    // Buffer for recording
    let recWetLeft, recWetRight, recDry;
    let recCursor; // Current position in the buffer

    // States
    let recording = false;
    let graphLen = canvas.width; // Graph length in pixels
    let graphMin = new Float32Array(graphLen).fill(0);
    let graphMax = new Float32Array(graphLen).fill(0);

    // Variables for dynamic size management
    let lastRecording, lastRecCursor = -1;
    let curSpace, drawSize;

    // Debug - exposed to window for console debug
    window.graphMin = graphMin;
    window.graphMax = graphMax; // debug

    /**
     * AudioWorkletNode for audio processing
     */
    const node = new AudioWorkletNode(audioContext, 's25-recorder-worklet', {
        numberOfInputs: 2,
        numberOfOutputs: 0,
        channelCountMode: 'max',
        channelInterpretation: 'speakers'
    });

    // Message handler from worklet
    node.port.onmessage = evt => onRecorderMessage(evt);

    /**
     * Creates a new empty slice
     * @returns {Float32Array} - Array of float32 values
     */
    function newSlice() {
        return new Float32Array(SLICESIZE).fill(0);
    }

    /**
     * Writes a value at a specific position in the slice chain
     * @param {number} value - Value to write
     * @param {Array<Float32Array>} chain - Chain of slices
     * @param {number} pos - Global position
     */
    function write(value, chain, pos) {
        let sliceIndex = Math.floor(pos / SLICESIZE);
        while (sliceIndex >= chain.length)
            chain.push(newSlice());

        let slicePos = pos % SLICESIZE;
        chain[sliceIndex][slicePos] = value;
    }

    /**
     * Reads a value from a specific position in the slice chain
     * @param {Array<Float32Array>} chain - Chain of slices
     * @param {number} pos - Global position
     * @returns {number} - Read value
     */
    function read(chain, pos) {
        let sliceIndex = Math.floor(pos / SLICESIZE);
        if (sliceIndex >= chain.length)
            return .15; // random value if out of space (should not happen)
        let slicePos = pos % SLICESIZE;
        return chain[sliceIndex][slicePos];
    }

    /**
     * Resets the recorder state
     * Resets all buffers and prepares for a new recording
     */
    function clear() {
        recWetLeft = [newSlice()];
        recWetRight = [newSlice()];
        recDry = [newSlice()];
        curSpace = SLICESIZE;
        drawSize = 60*audioContext.sampleRate;

        recCursor = 0;
        graphMin.fill(0);
        graphMax.fill(0);
    }
    clear();

    /**
     * Handles messages from the worklet
     * Processes audio data in real time and updates visualization
     * @param {Object} evt - Event from the worklet
     */
    async function onRecorderMessage(evt) {
        let d = evt.data;
        if (d.type == 'data' && recording) {
            const { dry, wetL, wetR } = d;
            const n = dry.length; // assume same length

            for (let i = 0; i < n; i++) {
                const writePosition = recCursor + i;
                const gpos = Math.round(writePosition * graphLen / drawSize);

                // write the 3 buffers
                write(dry[i], recDry, writePosition);
                write(wetL[i], recWetLeft, writePosition);
                write(wetR[i], recWetRight, writePosition);

                // use wet for the graph (more representative)
                graphMin[gpos] = Math.min(graphMin[gpos], wetL[i], wetR[i]);
                graphMax[gpos] = Math.max(graphMax[gpos], wetL[i], wetR[i]);
            }

            recCursor = recCursor + n;

            // If the buffer is full, extend the buffer by half
            if (recCursor >= drawSize) {
                console.log('incrementDrawSize: ' + drawSize + ' → ' + (drawSize*1.5));
                drawSize = Math.round(drawSize * 1.5);
                const relPos = Math.round(graphLen/1.5);
                graphMin.fill(0, relPos);
                graphMax.fill(0, relPos);
                redrawOldSamples();
            }
        }
    }

    /**
     * Redraws existing samples on a new extended buffer
     * Service function called when extending drawSize
     */
    function redrawOldSamples() {
        let cur = 0;
        const end = drawSize;

        function updateSection() {
            console.log('Redrawing samples: ' + cur + ' / ' + end);
            for (let j = 0; j < 10000; j++) {
                const wpos = cur++;
                const gpos = Math.round(wpos * graphLen / drawSize);
                const l = read(recWetLeft, wpos);
                const r = read(recWetRight, wpos);
                graphMin[gpos] = Math.min(graphMin[gpos], l, r);
                graphMax[gpos] = Math.max(graphMax[gpos], l, r );

                if (cur >= end) return;
            }
            setTimeout(updateSection, 1);
        }
        setTimeout(updateSection, 1);
    }

    /**
     * Draws the recording visualization on the canvas
     * Shows the audio waveform
     */
    function drawRecorder() {
        if (recCursor == lastRecCursor && lastRecording == recording) return;
        lastRecCursor = recCursor;
        lastRecording = recording;

        // Power function for more representative visual scaling
        const p = (y) => y < 0 ? -Math.pow(-y, drawPow) : Math.pow(y, drawPow);

        let ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'black';

        let cy = canvas.height / 2; // Y center
        let hy = -canvas.height / 2; // Scale

        for (let i = 0; i < graphLen; i++) {
            let y1 = p(graphMin[i]);
            let y2 = p(graphMax[i]);
            ctx.fillRect(i, cy + hy * y1, 1, (y2 - y1) * hy);
        }
    }

    /**
     * Drawing loop
     * Periodically updates the visualization
     */
    async function drawRecorderLoop() {
        while (true) {
            try {
                drawRecorder();
            } catch (e) {
                console.log('drawRecorderLoop error: ' + e);
            }
            await new Promise(resolve => setTimeout(resolve, 333)); // ~3 fps
        }
    }
    drawRecorderLoop();

    /**
     * Creates a stereo WAV file with processed (wet) audio
     * using PLUGIN_OUTPUT (to record processed versions of the sound)
     * Uses 2 channels
     * @returns {Blob} - Audio blob in WAV format
     */
    function createWetWavFile() {
        const len = recCursor;

        // Create WAV header according to specifications
        const sampleRate = audioContext.sampleRate;
        const numChannels = 2; // Stereo
        const bitsPerSample = 16;
        const blockAlign = numChannels * bitsPerSample / 8;
        const byteRate = sampleRate * blockAlign;
        const dataLength = len * blockAlign;

        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);

        let offset = 0;

        // --- RIFF HEADER ---
        writeString(view, offset, "RIFF"); offset += 4;
        view.setUint32(offset, 36 + dataLength, true); offset += 4; // file size - 8
        writeString(view, offset, "WAVE"); offset += 4;

        // --- fmt subchunk ---
        writeString(view, offset, "fmt "); offset += 4;
        view.setUint32(offset, 16, true); offset += 4; // PCM header size
        view.setUint16(offset, 1, true); offset += 2;  // PCM format = 1
        view.setUint16(offset, numChannels, true); offset += 2;
        view.setUint32(offset, sampleRate, true); offset += 4;
        view.setUint32(offset, byteRate, true); offset += 4;
        view.setUint16(offset, blockAlign, true); offset += 2;
        view.setUint16(offset, bitsPerSample, true); offset += 2;

        // --- data subchunk ---
        writeString(view, offset, "data"); offset += 4;
        view.setUint32(offset, dataLength, true); offset += 4;

        // Interleaving + float to int16 conversion
        for (let i = 0; i < len; i++) {
            const sampleLeft = Math.max(-1, Math.min(1, read(recWetLeft, i)));
            const sampleRight = Math.max(-1, Math.min(1, read(recWetRight, i)));

            view.setInt16(offset, sampleLeft * 0x7fff, true); offset += 2;
            view.setInt16(offset, sampleRight * 0x7fff, true); offset += 2;
        }

        return new Blob([buffer], { type: "audio/wav" });
    }

    /**
     * Creates a mono WAV file from the original (dry) signal
     * using PLUGIN_INPUT (to record original versions of the sound)
     * Uses only 1 channel
     * @returns {Blob} - Audio blob in WAV format
     */
    function createDryWavFile() {
        const len = recCursor;

        const sampleRate = audioContext.sampleRate;
        const numChannels = 1; // Mono
        const bitsPerSample = 16;
        const blockAlign = numChannels * bitsPerSample / 8;
        const byteRate = sampleRate * blockAlign;
        const dataLength = len * blockAlign;

        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);

        let offset = 0;

        // --- RIFF HEADER ---
        writeString(view, offset, "RIFF"); offset += 4;
        view.setUint32(offset, 36 + dataLength, true); offset += 4; // file size - 8
        writeString(view, offset, "WAVE"); offset += 4;

        // --- fmt subchunk ---
        writeString(view, offset, "fmt "); offset += 4;
        view.setUint32(offset, 16, true); offset += 4; // PCM header size
        view.setUint16(offset, 1, true); offset += 2;  // PCM format = 1
        view.setUint16(offset, numChannels, true); offset += 2;
        view.setUint32(offset, sampleRate, true); offset += 4;
        view.setUint32(offset, byteRate, true); offset += 4;
        view.setUint16(offset, blockAlign, true); offset += 2;
        view.setUint16(offset, bitsPerSample, true); offset += 2;

        // --- data subchunk ---
        writeString(view, offset, "data"); offset += 4;
        view.setUint32(offset, dataLength, true); offset += 4;

        // float to int16 conversion
        for (let i = 0; i < len; i++) {
            const sample = Math.max(-1, Math.min(1, read(recDry, i)));

            view.setInt16(offset, sampleLeft * 0x7fff, true); offset += 2;
        }

        return new Blob([buffer], { type: "audio/wav" });
    }

    /**
     * Extracts the original (dry) Float32Array audio
     * Used for fraudulent processing or other types of analysis
     * @returns {Float32Array} - Original audio signal array
     */
    function getDryRecord() {
        const len = recCursor;
        const result = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            result[i] = read(recDry, i);
        }
        return result;
    }

    /**
     * Writes a string into a DataView buffer
     * @param {DataView} view - Target DataView
     * @param {number} offset - Starting position
     * @param {string} string - String to write
     */
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    /**
     * Downloads the processed recording as a WAV file
     * Creates a blob and starts automatic download
     */
    function downloadBlob() {
        const blob = createWetWavFile();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = 'summer25.out.wav';
        a.click();
        URL.revokeObjectURL(url);
    }

    return {
        node,
        isRecording: () => recording,
        setRecording: x => recording = x,
        createWetWavFile,
        createDryWavFile,
        downloadBlob,
        getDryRecord,
        clear
        // recLeft,
        // recRight,
        // recLen,
        // recSpace,
        // recCursor,
    }
}