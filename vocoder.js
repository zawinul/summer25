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

self.targetx = 0;
self.targety = 0;
self.posx = 0;
self.posy = 0;
self.maxdist = 0;
self.dragging = false;
self.friction = 0;
self.mergeMix = .5;
self.mergeAlpha = 1;
self.mergeMode = 0;

self.speedx = 0;
self.speedy = 0;
self.lfoph = 0;
self.lfoxamp = 0;
self.lfoyamp = 0;
self.lfofreq = 0;
self.lfox = 0;
self.lfoy = 0;
self.vmode = 0;
self.incX = 0;
self.incY = 0;
self.resetPh = false;
self.scale = 1;

const LFOWAVE_SINE = 0;
const LFOWAVE_TRIANGLE = 1;
const LFOWAVE_SAW_UP = 2;
const LFOWAVE_SAWD_OWN = 3;
const LFOWAVE_SQUARE = 4;



self.xlfowave = LFOWAVE_SINE;
self.ylfowave = LFOWAVE_SINE;
self.xlfoamp = 0;
self.ylfoamp = 0;
self.xlfospeed = 1;
self.ylfospeed = 1;
self.xlfoph = 0;
self.ylfoph = 0;
self.lfosync = false;
self.lforatio = 1;
self.lfodeltaph;
self.lfox =0;
self.lfoy =0;

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

	posx = targetx = Math.random();
	posy = targetx = Math.random();
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

	if (dragging) {
		let dx = targetx - posx;
		let dy = targety - posy;
		if (friction>0) {
			const dist = Math.sqrt(dx*dx+dy*dy);
			if (dist>maxdist) {
				dx = dx*maxdist/dist;
				dy = dy*maxdist/dist;
			}
		} 
		posx +=dx;
		posy += dy;
	}
	else {
		incx = waveX ? speedx * (fftSize / overlap) / waveX.len : 0;
		incy = waveY ? speedy * (fftSize / overlap) / waveY.len : 0;
		posx += incx;
		posy += incy;
	}
	if (posx < 0) posx += 1;
	if (posx >= 1) posx -= 1;
	if (posy < 0) posy += 1;
	if (posy >= 1) posy -= 1;

	computeLfo();
}

function computeLfo() {
/*
self.xlfowave = LFOWAVE_SINE;
self.ylfowave = LFOWAVE_SINE;
self.xlfospeed = 1;
self.ylfospeed = 1;
self.xlfoph = 0;
self.ylfoph = 0;
self.lfosync = false;
self.lforatio = 1;
self.lfodeltaph;
*/
	period = hopSize/sampleRate;
	xlfoph = normalize(xlfoph + xlfospeed * period);
	ylfoph = lfosync 
		? normalize(ylfoph + xlfospeed * lforatio * period)
		: normalize(ylfoph + ylfospeed  * period);
	lfox = lfowave(xlfowave, xlfoph) * xlfoamp;
	lfoy = lfowave(ylfowave, ylfoph) * ylfoamp;
}

const pi = Math.PI;

function lfowave(shape, rad) { // -PI < rad <PI
	// while (rad<0)
	// 	rad += 2*Math.PI;
	// while (rad>=2*Math.PI)
	// 	rad -= 2*Math.PI;
	if (shape==LFOWAVE_SQUARE)
		return rad>=0 ? 1 : -1;
	if (shape==LFOWAVE_SINE)
		return Math.sin(rad);
	if (shape==LFOWAVE_SAW_UP)
		return rad/pi;
	if (shape==LFOWAVE_SAW_DOWN)
		return 1 - rad/pi;
	if (shape==LFOWAVE_TRIANGLE)
		return 2*Math.abs(rad)/pi-1;
	return 0;
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
	//log('fnf', posx, posy);
	if (waveY == emptyWave && waveY == emptyWave) {
		memory.fill(0);
		return;
	}
	frameX = waveX.getAnalizedFrame(posx + lfox, memory);
	frameY = waveY.getAnalizedFrame(posy + lfoy, memory);


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
		mergedFrame.deltaPh[fftSize/2] = 0;

	simplifiedResynthesize(mergedFrame, memory);
	for(let i=0;i<memory.length;i++)
		memory[i] *= scale;
}

function mergeFrame(frame1, frame2) {
	let len = fftSize / 2 + 1;
	let { magnitudes, deltaPh } = mergeFrameSpace;

	for (let i = 0; i < len; i++) {
		let m1 = frame1.magnitudes[i];
		let m2 = frame2.magnitudes[i];
		let dph1 = frame1.deltaPh[i];
		let dph2 = frame2.deltaPh[i];
		if (mergeMode == 'mix') {
			magnitudes[i] = m1 * (1 - mergeMix) + m2 * mergeMix;
		}
		else if (mergeMode == 'diff') {
			magnitudes[i] = Math.abs(m1 * (1 - mergeMix) - m2 * mergeMix);
		}
		else if (mergeMode == 'min') {
			magnitudes[i] = Math.min(m1 * (1 - mergeMix), m2 * mergeMix);
		}
		else if (mergeMode == 'max') {
			magnitudes[i] = Math.max(m1 * (1 - mergeMix), m2 * mergeMix);
		}
		else if (mergeMode == 'mul') {
			magnitudes[i] =  Math.pow(m1,1 - mergeMix) * Math.pow(m2, mergeMix);
		}



		//magnitudes[i] = Math.min(m1, m2);
		let deltadelta = normalize(dph2 - dph1);
		let delta = dph1 + (deltadelta * m2 / (m1 + m2))
		deltaPh[i] = normalize(delta);
	}

	if (mergeMode == 'cep') {
		let out = mixcep(frame1.magnitudes, frame2.magnitudes);
		for(let i=0;i<magnitudes.length; i++)
			magnitudes[i] = out[i];	
	}

	return mergeFrameSpace;
}

function mixcep(ax, ay) {
	if (!mixcep.fft)
		mixcep.fft = new FFT(fftSize/2);
	let mfft = mixcep.fft;

	let xComplexSpectrum = mfft.createComplexArray();
	mfft.realTransform(xComplexSpectrum, ax);
	mfft.completeSpectrum(xComplexSpectrum);

	let yComplexSpectrum = mfft.createComplexArray();
	mfft.realTransform(yComplexSpectrum, ay);
	mfft.completeSpectrum(yComplexSpectrum);

	let s = mfft.createComplexArray();
	for (let i = 0; i < s.length; i++)
		s[i] = xComplexSpectrum[i]*(1-mergeMix) + yComplexSpectrum[i]*mergeMix;

	// debug: s = xComplexSpectrum;

	const amps = mfft.createComplexArray();
	mfft.inverseTransform(amps, s);

	let out = new Float32Array(fftSize/2);
	for (let i = 0; i < out.length; i++)
		out[i] = amps[i*2];
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


self.onmessage = async function (event) {
	const d = event.data;
	const type = event.data.type;
	//log('Worker ricevuto messaggio:', type );

	if (type == 'init') {
		log('vocoder worker init', d);
		fftSize = d.fftSize;
		overlap = d.overlap;
		hopSize = fftSize/overlap;
		sampleRate = d.sampleRate;
		await init();
		self.postMessage({
			type: 'init_complete',
		});
		return;
	}

	if (type == 'set-status') {
		Object.assign(self, d.data);
		maxdist = 5*Math.pow(.000005, friction);
		if (typeof(d.data.lfosync)=='boolean' && d.data.lfosync)
			ylfoph = xlfoph * lforatio;
		if (resetPh) {
			resetPhases();
			resetPh = false;
		}

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
			type: 'osc-status',
			data: {
				dragging,
				friction,
				posx,
				posy,
				xlfoph,
				ylfoph,
				targetx,
				targety,
				maxdist,
				speedx,
				speedy,
				lfox,
				lfoy,
				incX,
				incY,
			}
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
