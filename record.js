const SPACE_SECONDS = 60;
const drawPow = .5;


async function initRecorder(audioContext, canvas) {
    await audioContext.audioWorklet.addModule('recorder.worklet.js');
    let space = SPACE_SECONDS * audioContext.sampleRate;
    let recWetLeft = new Float32Array(space).fill(0);
    let recWetRight = new Float32Array(space).fill(0);
    let recDry = new Float32Array(space).fill(0);
    let recCursor = 0;
    let recording = false;
    let graphLen = canvas.width;
    let graphMin = new Float32Array(graphLen).fill(0);
    let graphMax = new Float32Array(graphLen).fill(0);
    let lastRecording, lastRecCursor = -1;

    const node = new AudioWorkletNode(audioContext, 'recorder-worklet', {
        numberOfInputs: 2,
        numberOfOutputs: 0,
        //channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers'
    });
    node.port.onmessage = evt => onRecorderMessage(evt);

    function clear() {
        recCursor = 0;
        recDry.fill(0);
        recWetLeft.fill(0);
        recWetRight.fill(0);
        graphMin.fill(0);
        graphMax.fill(0);
    }

    async function onRecorderMessage(evt) {
        let d = evt.data;
        if (d.type == 'data' && recording) {
            const { dry, wetL, wetR } = d;
            const n = dry.length; // assumiamo stessa lunghezza
            for (let i = 0; i < n; i++) {
                const wpos = recCursor + i;
                const gpos = Math.round(wpos * graphLen / recDry.length);
                // scrivi i 3 buffer
                recDry[wpos] = dry[i];
                recWetLeft[wpos] = wetL[i];
                recWetRight[wpos] = wetR[i];

                // usa il wet per il grafico (più rappresentativo)
                graphMin[gpos] = Math.min(graphMin[gpos], wetL[i], wetR[i]);
                graphMax[gpos] = Math.max(graphMax[gpos], wetL[i], wetR[i]);
            }
            recCursor = Math.min(recCursor + n, space);
        }
    }


    function drawRecorder() {
        if (recCursor == lastRecCursor && lastRecording == recording) return;
        lastRecCursor = recCursor;
        lastRecording = recording;

        const p = (y) => y < 0 ? -Math.pow(-y, drawPow) : Math.pow(y, drawPow);
        let ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'black';
        let cy = canvas.height / 2;
        let hy = -canvas.height / 2;
        for (let i = 0; i < graphLen; i++) {
            let y1 = p(graphMin[i]);
            let y2 = p(graphMax[i]);
            ctx.fillRect(i, cy + hy * y1, 1, (y2 - y1) * hy);
        }
    }

    async function drawRecorderLoop() {
        while (true) {
            try {
                drawRecorder();
            } catch (e) {
                console.log('drawRecorderLoop error: ' + e);
            }
            await new Promise(resolve => setTimeout(resolve, 333));
        }
    }
    drawRecorderLoop();

    function createWetWavFile() {
        let left = recLeft.slice(0, recCursor), right = recWetRight.slice(0, recCursor), sampleRate = audioContext.sampleRate;
        const numChannels = 2;
        const bitsPerSample = 16;
        const blockAlign = numChannels * bitsPerSample / 8;
        const byteRate = sampleRate * blockAlign;
        const dataLength = left.length * blockAlign;
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

        // Interleaving + conversione float → int16
        for (let i = 0; i < left.length; i++) {
            const sampleLeft = Math.max(-1, Math.min(1, left[i]));
            const sampleRight = Math.max(-1, Math.min(1, right[i]));

            view.setInt16(offset, sampleLeft * 0x7fff, true); offset += 2;
            view.setInt16(offset, sampleRight * 0x7fff, true); offset += 2;
        }

        return new Blob([buffer], { type: "audio/wav" });
    }

    function createDryWavFile() {
        const dry = recDry.slice(0, recCursor);
        const sampleRate = audioContext.sampleRate;
        const numChannels = 1;
        const bitsPerSample = 16;
        const blockAlign = numChannels * bitsPerSample / 8;
        const byteRate = sampleRate * blockAlign;
        const dataLength = dry.length * blockAlign;
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

        // Interleaving + conversione float → int16
        for (let i = 0; i < dry.length; i++) {
            const sample = Math.max(-1, Math.min(1, dry[i]));

            view.setInt16(offset, sampleLeft * 0x7fff, true); offset += 2;
        }

        return new Blob([buffer], { type: "audio/wav" });
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    function downloadBlob() {
        const blob = createWavFile();
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
        getDryRecord: () => recDry.slice(0, recCursor),
        clear
        // recLeft,
        // recRight,
        // recLen,
        // recSpace,
        // recCursor,
    }
}
