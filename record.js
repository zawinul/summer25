const SPACE_SECONDS = 30;
const EXTRA_SECONDS = 10;
const drawPow = .5;

const SLICESIZE = 100000;


async function initRecorder(audioContext, canvas) {
    await audioContext.audioWorklet.addModule('recorder.worklet.js');
    let recWetLeft, recWetRight, recDry;
    let recCursor;
    let recording = false;
    let graphLen = canvas.width;
    let graphMin = new Float32Array(graphLen).fill(0);
    let graphMax = new Float32Array(graphLen).fill(0);
    let lastRecording, lastRecCursor = -1;

    let curSpace;
    let drawSize;
    window.graphMin = graphMin;
    window.graphMax = graphMax; // debug

    const node = new AudioWorkletNode(audioContext, 'recorder-worklet', {
        numberOfInputs: 2,
        numberOfOutputs: 0,
        //channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers'
    });
    node.port.onmessage = evt => onRecorderMessage(evt);

    function newSlice() {
        return new Float32Array(SLICESIZE).fill(0);
    }

    function write(value, chain, pos) {
        let sliceIndex = Math.floor(pos / SLICESIZE);
        while (sliceIndex >= chain.length) 
            chain.push(newSlice());

        let slicePos = pos % SLICESIZE;
        chain[sliceIndex][slicePos] = value;
    }

    function read(chain, pos) {
        let sliceIndex = Math.floor(pos / SLICESIZE);
        if (sliceIndex >= chain.length) 
            return .15; // valore casuale se fuori dallo spazio (non dovrebbe succedere)
        let slicePos = pos % SLICESIZE;
        return chain[sliceIndex][slicePos];
    }

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


    async function onRecorderMessage(evt) {
        let d = evt.data;
        if (d.type == 'data' && recording) {
            const { dry, wetL, wetR } = d;
            const n = dry.length; // assumiamo stessa lunghezza

            for (let i = 0; i < n; i++) {
                const writePosition = recCursor + i;
                const gpos = Math.round(writePosition * graphLen / drawSize);
                // scrivi i 3 buffer
                write(dry[i], recDry, writePosition);
                write(wetL[i], recWetLeft, writePosition);
                write(wetR[i], recWetRight, writePosition);
                // usa il wet per il grafico (più rappresentativo)
                graphMin[gpos] = Math.min(graphMin[gpos], wetL[i], wetR[i]);
                graphMax[gpos] = Math.max(graphMax[gpos], wetL[i], wetR[i]);
            }
            recCursor = recCursor + n;
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

    function redrawOldSamples() {
        let cur = 0;
        const end = drawSize;
        //console.log('Redrawing samples: ' + cur + ' / ' + end);
        function updateSection() {
            console.log('Redrawing samples: ' + cur + ' / ' + end);
            for (let j = 0; j < 10000; j++) {
                const wpos = cur++;
                const gpos = Math.round(wpos * graphLen / drawSize);
                const l = read(recWetLeft, wpos);
                const r = read(recWetRight, wpos);
                graphMin[gpos] = Math.min(graphMin[gpos], l, r);
                graphMax[gpos] = Math.max(graphMax[gpos], l, r  );
                if (cur >= end) 
                    return;
            }
            setTimeout(updateSection, 1);
        }
        setTimeout(updateSection, 1);
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
        const len = recCursor;
        // let left______ = recWetLeft.slice(0, len);
        // let right______ = recWetRight.slice(0, len);
        const sampleRate = audioContext.sampleRate;
        const numChannels = 2;
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

        // Interleaving + conversione float → int16
        for (let i = 0; i < len; i++) {
            const sampleLeft = Math.max(-1, Math.min(1, read(recWetLeft, i)));
            const sampleRight = Math.max(-1, Math.min(1, read(recWetRight, i)));

            view.setInt16(offset, sampleLeft * 0x7fff, true); offset += 2;
            view.setInt16(offset, sampleRight * 0x7fff, true); offset += 2;
        }

        return new Blob([buffer], { type: "audio/wav" });
    }

    function createDryWavFile() {
        const len = recCursor;
        //const dry______ = recDry.slice(0, recCursor);
        const sampleRate = audioContext.sampleRate;
        const numChannels = 1;
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

        // Interleaving + conversione float → int16
        for (let i = 0; i < len; i++) {
            const sample = Math.max(-1, Math.min(1, read(recDry, i)));

            view.setInt16(offset, sampleLeft * 0x7fff, true); offset += 2;
        }

        return new Blob([buffer], { type: "audio/wav" });
    }

    function getDryRecord() {
        const len = recCursor;
        const result = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            result[i] = read(recDry, i);
        }
        return result;
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

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
