// Worker per il vocoder - vocoder.js
console.log('Vocoder Worker avviato');
importScripts("fft.js");
importScripts("common.js");




let sampleRate;
let currentBuffer = null;

let fftSize;
let overlap;
let hopSize;


let window;

let inparams = {
	targetx: 0,
	targety: 0,
	forcepos: false,
	dragging: false,
	traction: 0,
	mergeMix: .5,
	mergeMode: 'mix',

	speedx: 0,
	speedy: 0,

	lfoxamp: 0,
	lfoyamp: 0,
	lfofreq: 0,
	
	lfowave: LFOWAVE_SINE,
	lfodeltaph: 0,

	scale: 1,
	steps: 0
}

let outparams = {
	posx: 0,
	posy: 0,
	maxdist: 0,
	lfoph: 0,
	xlfonorm: 0,
	ylfonorm: 0,
	lfox: 0,
	lfoy: 0,
	incx: 0, 
	incy: 0,

};



let mergeFrameSpace;
let emptyFrame;
let emptyWave;
let waveY, waveX;
let outBuffer;

function log() {
	let pars = ['voc-worker'];
	for (let i = 0; i < arguments.length; i++) {
		pars.push(arguments[i]);
	}
	console.log(...pars);
}

async function init() {
	log('in vocoder init');

	const lib = initCommon(fftSize, overlap, sampleRate);
	Object.assign(self, lib);

	window = createHammingWindow(fftSize);

	outBuffer = new Float32Array(fftSize);

	outparams.posx = inparams.targetx = Math.random();
	outparams.posy = inparams.targetx = Math.random();
	mergeFrameSpace = {
		magnitudes: new Float32Array(fftSize / 2 + 1),
		deltaPh: new Float32Array(fftSize / 2 + 1)
	}

	emptyFrame = {
		magnitudes: new Float32Array(fftSize / 2 + 1).fill(0),
		deltaPh: new Float32Array(fftSize / 2 + 1).fill(0)
	}

	emptyWave = {
		getAnalizedFrame: function () {
			return emptyFrame;
		}
	}
	waveX = emptyWave;
	waveY = emptyWave;
}

function incrementPosition() {

	if (inparams.dragging) {
		let dx = inparams.targetx - outparams.posx;
		let dy = inparams.targety - outparams.posy;
		if ((inparams.traction < 1) && !inparams.forcepos) {
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist > outparams.maxdist) {
				dx = dx * outparams.maxdist / dist;
				dy = dy * outparams.maxdist / dist;
			}
		}
		outparams.posx += dx;
		outparams.posy += dy;
	}
	else {
		let incx = linearSpeedRescale(inparams.speedx);
		let incy = linearSpeedRescale(inparams.speedy);
		outparams.incx = waveX ? incx * (fftSize / overlap) / waveX.len : 0;
		outparams.incy = waveY ? incy * (fftSize / overlap) / waveY.len : 0;
		outparams.posx += outparams.incx;
		outparams.posy += outparams.incy;
	}
	if (outparams.posx < 0) outparams.posx += 1;
	if (outparams.posx >= 1) outparams.posx -= 1;
	if (outparams.posy < 0) outparams.posy += 1;
	if (outparams.posy >= 1) outparams.posy -= 1;

	computeLfo();
}

let ph=0;
function computeLfo() {
	let spedhz = Math.pow(inparams.lfofreq,3) * 10;
	let period = hopSize / sampleRate;
	let lfospeed = spedhz * period;

	ph += lfospeed;
	let v = ph;
	if (inparams.steps!=0) {
		let slice = 2*Math.PI / inparams.steps;
		v = ph / slice;
		v = Math.round(v) % inparams.steps;
		v = v * slice;
	}
	outparams.lfoph = v = normalize(v);
	outparams.lfox = lfowaveX(inparams.lfowave, v) * lfoAmpRescale(inparams.lfoxamp);
	outparams.lfoy = lfowaveY(inparams.lfowave, v, inparams.lfodeltaph) * lfoAmpRescale(inparams.lfoyamp);
}


function getGraphData(size, x, y, merge) {
	let ret = {
		x: new Float32Array(size),
		y: new Float32Array(size),
		merge: new Float32Array(size),
		max: 0
	}
	let srcs = [x, y, merge];
	let dsts = [ret.x, ret.y, ret.merge];
	for (let i = 0; i < srcs.length; i++) {
		let src = srcs[i];
		let dst = dsts[i];
		dst.fill(0);
		if (!src)
			continue;

		for (let j = 0; j < src.length; j++) {
			let pos = Math.round(j * size / src.length);
			dst[pos] = Math.max(dst[pos], src[j]);
		}
		for (let j = 0; j < size; j++)
			if (dst[j] > ret.max)
				ret.max = dst[j];
	}
	return ret;
}

let frameX, frameY, mergedFrame;
function fillNextFrame(memory) {
	//log('fnf', outparams.posx, outparams.posy);
	if (waveY == emptyWave && waveY == emptyWave) {
		memory.fill(0);
		return;
	}
	frameX = waveX.getAnalizedFrame(outparams.posx + outparams.lfox, memory);
	frameY = waveY.getAnalizedFrame(outparams.posy + outparams.lfoy, memory);


	if (waveX == emptyWave)
		mergedFrame = frameY;
	else if (waveY == emptyWave)
		mergedFrame = frameX;
	else
		mergedFrame = mergeFrame(frameX, frameY);

	// aggiustamenti per errori vari
	if (mergedFrame.magnitudes)
		mergedFrame.magnitudes[fftSize / 2] = 0;
	if (mergedFrame.deltaPh)
		mergedFrame.deltaPh[fftSize / 2] = 0;

	simplifiedResynthesize(mergedFrame, memory);
	for (let i = 0; i < memory.length; i++)
		memory[i] *= inparams.scale;
}

function mergeFrame(frame1, frame2) {
	let mode = inparams.mergeMode;
	let len = fftSize / 2 + 1;
	let { magnitudes, deltaPh } = mergeFrameSpace;
	let input_m1 = frame1.magnitudes;
	let input_m2 = frame2.magnitudes;

	if (mode.includes('dx')){
		input_m1 = derivate(input_m1, 'x');
		mode = mode.replace('dx', '');
	}
	if (mode.includes('dy')){
		input_m2 = derivate(input_m2, 'y');
		mode = mode.replace('dy', '');
	}
	for (let i = 0; i < len; i++) {
		let m1 = input_m1[i];
		let m2 = input_m2[i];
		let dph1 = frame1.deltaPh[i];
		let dph2 = frame2.deltaPh[i];
		if (mode == 'mix') {
			magnitudes[i] = m1 * (1 - inparams.mergeMix) + m2 * inparams.mergeMix;
		}
		else if (mode == 'diff') {
			magnitudes[i] = Math.abs(m1 * (1 - inparams.mergeMix) - m2 * inparams.mergeMix);
		}
		else if (mode == 'min') {
			magnitudes[i] = Math.min(m1 * (1 - inparams.mergeMix), m2 * inparams.mergeMix);
		}
		else if (mode == 'max') {
			magnitudes[i] = Math.max(m1 * (1 - inparams.mergeMix), m2 * inparams.mergeMix);
		}
		else if (mode == 'mul') {
			magnitudes[i] = Math.pow(m1, 1 - inparams.mergeMix) * Math.pow(m2, inparams.mergeMix);
		}


		let deltadelta = normalize(dph2 - dph1);
		let delta = (m1+m2!=0) ? dph1 + (deltadelta * m2 / (m1 + m2)) : dph1;
		deltaPh[i] = normalize(delta);
	}

	// if (inparams.mergeMode == 'cep') {
	// 	let out = mixcep(frame1.magnitudes, frame2.magnitudes);
	// 	for (let i = 0; i < magnitudes.length; i++)
	// 		magnitudes[i] = out[i];
	// }

	return mergeFrameSpace;
}

let derivateBuffers = {};
function derivate(buffer, tag) {
	if (!derivateBuffers[tag])
		derivateBuffers[tag] = [buffer.slice(),new Float32Array(buffer.length)];
	let [value, delta] = derivateBuffers[tag];
	for (let i = 0; i < buffer.length; i++) {
		delta[i] = Math.abs(buffer[i] - value[i]);
		value[i] = buffer[i];
	}
	return delta;
}

function mixcep(ax, ay) {
	if (!mixcep.fft)
		mixcep.fft = new FFT(fftSize / 2);
	let mfft = mixcep.fft;

	let xComplexSpectrum = mfft.createComplexArray();
	mfft.realTransform(xComplexSpectrum, ax);
	mfft.completeSpectrum(xComplexSpectrum);

	let yComplexSpectrum = mfft.createComplexArray();
	mfft.realTransform(yComplexSpectrum, ay);
	mfft.completeSpectrum(yComplexSpectrum);

	let s = mfft.createComplexArray();
	for (let i = 0; i < s.length; i++)
		s[i] = xComplexSpectrum[i] * (1 - inparams.mergeMix) + yComplexSpectrum[i] * inparams.mergeMix;

	// debug: s = xComplexSpectrum;

	const amps = mfft.createComplexArray();
	mfft.inverseTransform(amps, s);

	let out = new Float32Array(fftSize / 2);
	for (let i = 0; i < out.length; i++)
		out[i] = amps[i * 2];
	return out;
}

function setwave(index, buffer) {
	let data = new Float32Array(buffer);
	let len = data.length;
	let left = 0;
	let right = len;
	let ph = 0;

	function getAnalizedFrame(normPh) {
		let ph = Math.round(left + normPh * (right - left));
		ph = ph % len;
		//log('gaf', ph );
		return simplifiedAnalysisAtPoint(data, ph, debugdump);
	}
	let w = { data, len, left, right, getAnalizedFrame, ph };
	if (index == 'y')
		waveY = w;
	else
		waveX = w;
	log('set wave ' + index);
}

const LEFTTRACTIONVALUE = .0001;
const RIGHTTRACTIONVALUE = .2;

self.onmessage = async function (event) {
	const d = event.data;
	const type = event.data.type;
	//log('Worker ricevuto messaggio:', type );

	if (type == 'init') {
		log('vocoder worker init', d);
		fftSize = d.fftSize;
		overlap = d.overlap;
		hopSize = fftSize / overlap;
		sampleRate = d.sampleRate;
		await init();
		self.postMessage({
			type: 'init_complete',
		});
		return;
	}

	if (type == 'set-status') {
		for(var k in d.data) {
			if (typeof(inparams[k])=='number')
				inparams[k] = d.data[k]-0;
			else if (typeof(inparams[k])=='boolean')
				inparams[k] = !!d.data[k];
			else
				inparams[k] = d.data[k];
		}
		// console.log(self);
		// parameters manipulation
		outparams.maxdist = LEFTTRACTIONVALUE * Math.pow(RIGHTTRACTIONVALUE / LEFTTRACTIONVALUE, inparams.traction);
	}


	if (type == 'set-wave') {
		log('worker setwave ' + d.index);
		setwave(d.index, d.buffer);
	}

	if (type == 'graph-data-request') {
		let x = frameX ? frameX.magnitudes : null;
		let y = frameY ? frameY.magnitudes : null;
		let m = mergedFrame ? mergedFrame.magnitudes : null;
		let graphData = getGraphData(d.size, x, y, m);
		self.postMessage({
			type: 'graph-data',
			data: graphData,
		});
	}
	if (type == 'new-frame-request') {
		incrementPosition();
		fillNextFrame(outBuffer);
		self.postMessage({
			type: 'new-frame',
			data: outBuffer,
		});
		
		self.postMessage({
			type: 'osc-in-status',
			data: inparams
		});
		self.postMessage({
			type: 'osc-out-status',
			data:outparams
		});
	}

	self.postMessage({
		type: 'error',
		data: {
			error: 'Tipo di messaggio non supportato',
			receivedType: type
		}
	});
};

self.postMessage({
	type: 'created',
});

// Gestione degli errori
self.onerror = function (error) {
	console.error('Errore nel worker:', error);

	self.postMessage({
		type: 'error',
		data: {
			error: error.message,
			filename: error.filename,
			lineno: error.lineno
		}
	});
};

log('Vocoder Worker inizializzato e pronto');
