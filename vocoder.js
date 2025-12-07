// Worker per il vocoder - vocoder.js
console.log('Vocoder Worker avviato');
importScripts("fft.js");
importScripts("common.js");
importScripts("contour.js");

let requested = false;
let computing = false;
let n_requested = 0;
let n_delivered = 0;


let sampleRate;
let currentBuffer = null;

let fftSize;
let overlap;
let hopSize;


let window;

let inparams = {
	targetx: 0,
	targety: 0,
	dragging: false,
	traction: 0,
	mergeMix: .5,
	mergeMode: 'mix',

	speedx: 0,
	speedy: 0,

	lfoxamp: 0,
	lfoyamp: 0,
	lfofreq: 0,
	speedmultx: 1,
	speedmulty: 1,

	lfowave: LFOWAVE_SINE,
	lfodeltaph: 0,

	// contourBands:120, 
	// contourSmooth: 5,
	contourResolution: .5,

	scale: 1,
	steps: 0,

	transposeX: 0,
	transposeY: 0,
	transposeM: 0,
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
	let enabled = inparams['enable-linear'] === undefined || inparams['enable-linear'];
	outparams.maxdist = tractionRescale(inparams.traction);

	if (inparams.dragging) {
		let dx = inparams.targetx - outparams.posx;
		let dy = inparams.targety - outparams.posy;
		if (inparams.traction < 1) {
			const dist = Math.sqrt(dx * dx + dy * dy);
			outparams.dist = dist;
			let md = outparams.maxdist;
			md *= dist * dist;
			let f = dist > md ? md / dist : 1;
			if (dist > md) {
				dx *= f;
				dy *= f;
			}
		}
		outparams.posx = clip(outparams.posx + dx, 0, 1);
		outparams.posy = clip(outparams.posy + dy, 0, 1);
	}
	else if (enabled) {
		let incx = linearSpeedRescale(inparams.speedx);
		let incy = linearSpeedRescale(inparams.speedy);
		outparams.incx = waveX ? incx * (fftSize / overlap) / waveX.len : 0;
		outparams.incy = waveY ? incy * (fftSize / overlap) / waveY.len : 0;
		outparams.posx += outparams.incx;
		outparams.posy += outparams.incy;

		if (outparams.posx < 0) outparams.posx += 1;
		if (outparams.posx >= 1) outparams.posx -= 1;
		if (outparams.posy < 0) outparams.posy += 1;
		if (outparams.posy >= 1) outparams.posy -= 1;
	}

}

let ph = 0;
function computeLfo() {
	let enabled = inparams['enable-cyclic'] === undefined || inparams['enable-cyclic'];
	if (!enabled) {
		outparams.lfox = 0;
		outparams.lfoy = 0;
		return;
	}
	let spedhz = outparams.lfoHz = lfoSpeedRescale(inparams.lfofreq);
	let period = hopSize / sampleRate;
	let lfospeed = spedhz * period * 2 * Math.PI;

	ph += lfospeed;
	let v = ph;
	if (inparams.steps != 0) {
		let slice = 2 * Math.PI / inparams.steps;
		v = ph / slice;
		v = Math.round(v) % inparams.steps;
		v = v * slice;
	}
	outparams.lfoph = v = normalize(v);
	let xamp = lfoAmpRescale(inparams.lfoxamp);
	let yamp = lfoAmpRescale(inparams.lfoyamp);
	outparams.lfox = lfowaveX(inparams.lfowave, v * inparams.speedmultx, inparams.lfodeltaph) * xamp;
	outparams.lfoy = lfowaveY(inparams.lfowave, v * inparams.speedmulty, inparams.lfodeltaph) * yamp;
}


function getGraphData(size, data) {
	let ret = getGraphData.ret;
	let pos = getGraphData.pos;
	for (let key in data)
		ret[key] = ret[key] || new Float32Array(size);

	for (let key in data) {
		let src = data[key];
		let dst = ret[key];
		dst.fill(0);
		if (src) {
			for (let j = 1; j < src.length; j++) {
				let p = pos[j];
				if (p === undefined)
					p = pos[j] = Math.round(Math.exp(Math.log(size) * Math.log(j) / Math.log(src.length)));
				let v = dst[p] = Math.max(dst[p], src[j]);
			}
		}
	}
	return ret;
}
getGraphData.ret = {};
getGraphData.pos = [];

let frameX, frameY, mergedFrame;
function fillNextFrame(memory) {
	if (waveY == emptyWave && waveY == emptyWave) {
		memory.fill(0);
		return;
	}
	frameX = waveX.getAnalizedFrame(outparams.posx + outparams.lfox, memory);
	frameY = waveY.getAnalizedFrame(outparams.posy + outparams.lfoy, memory);

	if (inparams.transposeX != 0) {
		const fact = Math.pow(2, inparams.transposeX/12);
		transpose(frameX.magnitudes, frameX.deltaPh, f=>f*fact);
	}
	if (inparams.transposeY != 0) {
		const fact = Math.pow(2, inparams.transposeY/12);
		transpose(frameY.magnitudes, frameY.deltaPh, f=>f*fact);
	}



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

	// if (inparams.transposeM != 0) {
	// 	const fact = Math.pow(2, inparams.transposeM/12);
	// 	transpose(mergedFrame.magnitudes, mergedFrame.deltaPh, f=>f*fact);
	// }

	spectralTransform(mergedFrame.magnitudes, mergedFrame.deltaPh, segmentSpectralTransform, {points:[[.45,.55],[.55,.45]]});
	
	simplifiedResynthesize(mergedFrame, memory);

	for (let i = 0; i < memory.length; i++)
		memory[i] *= inparams.scale;
}

function segmentSpectralTransform(freq, amp, band, params) {
	let fmin = bandToFrequency(1);
	let fmax = bandToFrequency(sampleRate/2);
	let logf = Math.log(freq/fmin)/Math.log(fmax/fmin);
	let ampOut = 0, freqOut=freq;
	const points = params.points;
	for(let i=0;i<points.length-1;i++) {
		let [x1,y1] = points[i];
		let [x2,y2] = points[i+1];
		if (logf>=x1 && logf<=x2) {
			let logFOut = y1+(logf-x1)*(y2-y1)/(x2-x1);
			freqOut = fmin*Math.pow(fmax/fmin, logFOut);
			ampOut = amp;
			break;
		}
	}
	return {a:ampOut, f: freqOut}
}

let accx;
let accy;
let cx, cy, cm;
let drawData;
const clip = (v, min, max) => Math.min(Math.max(v, min), max);
const PHMODEMIX = 0, PHMODEX = 1, PHMODEY = 2;

function mergeFrame(frame1, frame2) {
	let dcx, dcy;
	let mode = inparams.mergeMode;
	let phmode = PHMODEMIX;
	if (mode == 'cxy')
		phmode = PHMODEY;
	else if (mode == 'xcy')
		phmode = PHMODEX;

	let len = fftSize / 2 + 1;
	let { magnitudes, deltaPh } = mergeFrameSpace;
	let input_m1 = frame1.magnitudes;
	let input_m2 = frame2.magnitudes;

	if (mode.includes('dx')) {
		input_m1 = derivate(input_m1, 'x');
		mode = mode.replace('dx', '');
	}

	if (mode.includes('dy')) {
		input_m2 = derivate(input_m2, 'y');
		mode = mode.replace('dy', '');
	}

	drawData = { x: input_m1, y: input_m2, m: mergeFrameSpace.magnitudes }


	if (mode == 'cxy' || mode == 'xcy') {
		//let contourBands = Math.round(Math.pow(fftSize/2, inparams.contourResolution));
		let contourSmooth = 5;
		cx = calcolaProfiloSpettrale(frame1.magnitudes, inparams.contourResolution);
		cy = calcolaProfiloSpettrale(frame2.magnitudes, inparams.contourResolution);
		if (!cm)
			cm = new Float32Array(cx.length);
		let mult;
		if (mode == 'xcy') {
			for (let i = 0; i < cx.length; i++) {
				mult = cx[i] < .00001 ? 0 : Math.pow(cy[i] / cx[i], inparams.mergeMix);
				//if (mult > 1) mult = Math.pow(mult, .5);
				cm[i] = cx[i] * mult;
			}
		}
		else {
			for (let i = 0; i < cx.length; i++) {
				mult = cy[i] < .00001 ? 0 : Math.pow(cx[i] / cy[i], 1 - inparams.mergeMix);
				//if (mult > 1) mult = Math.pow(mult, .5);
				cm[i] = cy[i] * mult;
			}
		}
		drawData.cx = cx;
		drawData.cy = cy;
		drawData.cm = cm;

		// accx = accx || new Float32Array(len);
		// accy = accy || new Float32Array(len);
		// cx = cx || new Float32Array(len);
		// cy = cy || new Float32Array(len);
		// accx.fill(0);
		// accy.fill(0);
		// for (let i = 1; i < len; i++) {
		// 	let key = contourTable.keys[i];
		// 	let cnt = contourTable.counts[key];
		// 	accx[key] += frame1.magnitudes[i] / cnt;
		// 	accy[key] += frame2.magnitudes[i] / cnt;
		// }
		// for (let i = 0; i < len; i++) {
		// 	let key = contourTable.keys[i];
		// 	cx[i] = accx[key];
		// 	cy[i] = accy[key];
		// }
		// //if (mode == 'cxy')
		// drawX = [dcx];
		// //if (mode == 'xcy')
		// drawY = [dcy];
	}

	//let mt0 = now();

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
		else if (mode == 'xcy') {
			magnitudes[i] = cx[i] < .00001 ? m1 : m1 * cm[i] / cx[i];
		}
		else if (mode == 'cxy') {
			magnitudes[i] = cy[i] < .00001 ? m2 : m2 * cm[i] / cy[i];
		}
		// else if (mode == 'xcy') {
		// 	let fact = cy[i];
		// 	//fact = Math.min(fact, 1);
		// 	magnitudes[i] = m1 * Math.pow(fact, inparams.mergeMix);
		// }
		// else if (mode == 'cxy') {
		// 	let fact = cx[i];
		// 	//fact = Math.min(fact,1);
		// 	magnitudes[i] = m2 * Math.pow(fact, 1-inparams.mergeMix);
		// }

		if (phmode == PHMODEMIX) {
			let deltadelta = normalize(dph2 - dph1);
			let delta = (m1 + m2 != 0) ? dph1 + (deltadelta * m2 / (m1 + m2)) : dph1;
			deltaPh[i] = normalize(delta);
		}

		else if (phmode == PHMODEX)
			deltaPh[i] = dph1;
		else if (phmode == PHMODEY)
			deltaPh[i] = dph2;
	}

	// outparams.m_elapsed = now() - mt0;

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
		derivateBuffers[tag] = [buffer.slice(), new Float32Array(buffer.length)];
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
		return simplifiedAnalysisAtPoint(data, ph);
	}
	let w = { data, len, left, right, getAnalizedFrame, ph };
	if (index == 'y')
		waveY = w;
	else
		waveX = w;
	log('set wave ' + index);
}

let intxpoints = [], intypoints = [];
function initInterpolationPoints(sampleRate, fftSize) {
	let keys = [0];
	for (let i = 1; i <= fftSize; i++) {
		let hz = i * sampleRate / fftSize;
		let key = 69 + Math.log(hz / 440) / Math.log(hstep);
		keys[i] = Math.round(key / 3);
	}
	let counts = new Array(fftSize).fill(0);
	for (let i = 1; i <= fftSize; i++) {
		counts[keys[i]]++;
	}

	return { keys, counts };
}

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
		for (var k in d.data) {

			if (typeof (inparams[k]) == 'number')
				inparams[k] = d.data[k] - 0;
			else if (typeof (inparams[k]) == 'boolean')
				inparams[k] = !!d.data[k];
			else
				inparams[k] = d.data[k];
		}
		if (inparams.forcex) {
			outparams.posx = inparams.targetx;
			delete inparams.forcex;
		}
		if (inparams.forcey) {
			outparams.posy = inparams.targety;
			delete inparams.forcey;
		}
	}


	if (type == 'set-wave') {
		log('worker setwave ' + d.index);
		setwave(d.index, d.buffer);
	}

	if (type == 'graph-data-request') {
		// let x = frameX ? frameX.magnitudes : null;
		// let y = frameY ? frameY.magnitudes : null;
		// let m = mergedFrame ? mergedFrame.magnitudes : null;
		if (drawData) {

			let graphData = getGraphData(d.size, drawData);
			self.postMessage({
				type: 'graph-data',
				data: graphData,
			});
		}
	}
	if (type == 'new-frame-request') {
		n_requested++; 
		requested = true;
		if (!computing) {
			requested = false;
			processAndSendLoop();
		}
		return;
	}

	self.postMessage({
		type: 'error',
		data: {
			error: 'Tipo di messaggio non supportato',
			receivedType: type
		}
	});
};

async function processAndSendLoop() {
	while(true) {
		try {
			processing = true;
			processAndSend();
		} catch (error) {
			console.log(error);
		}
		processing = false;
		// svuoto eventualmente la coda dei messaggi
		await new Promise(resolve=>setTimeout(resolve,0));

		if (requested)
			console.log('time overlap');
		else 
			break;
	}
}

function processAndSend() {
	try {
		incrementPosition();
		computeLfo();
		fillNextFrame(outBuffer);
		//outparams.elapsed = now() - t0;
	} catch (error) {
		outparams.error = error.message;
		self.postMessage({
			type: 'error',
			data: {
				error: error.message,
				filename: error.filename,
				lineno: error.lineno
			}
		});
	}
	n_delivered++;

	self.postMessage({
		type: 'new-frame',
		data: outBuffer,
	});
	self.postMessage({
		type: 'osc-in-status',
		data: inparams
	});


	outparams.n_requested = n_requested;
	outparams.n_delivered = n_delivered;	
	self.postMessage({
		type: 'osc-out-status',
		data: outparams
	});
}


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
