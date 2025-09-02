// Worker per il vocoder - vocoder.js
console.log('Vocoder Worker avviato');
importScripts("fft.js");
importScripts("common.js");

let sampleRate;
let bufferSize = 1024;
let currentBuffer = null;

let fftSize;
let overlap;


let window;

let posx = 0;
let posy = 0;
let mix = .5;
let mode = 0;
let fposx = 0;
let fposy = 0;
let lfoph = 0;
let lforad = 0;
let lfofreq = 0;
let lfox = 0;
let lfoy = 0;
let vmode = 0;


let mergeFrameSpace;
let emptyFrame;
let emptyWave;
let waveY, waveX;

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

	window = createHammingWindow(windowSize);



	posx = Math.random();
	posy = Math.random();
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
	posx += fposx;
	posy += fposy;
	if (posx < 0) posx += 1;
	if (posx >= 1) posx -= 1;
	if (posy < 0) posy += 1;
	if (posy >= 1) posy -= 1;
	lfox = lforad * Math.cos(lfoph);
	lfoy = lforad * Math.sin(lfoph);
	lfoph += lfofreq;
	this.port.postMessage({
		type: 'osc-status',
		posx,
		posy,
		fposx,
		fposy,
		lfox,
		lfoy,
	});
}

function getGraphData(size, x, y, merge) {
	let ret = {
		x: new Float32Array(size),
		y: new Float32Array(size),
		merge: new Float32Array(size),
	}
	let srcs = [x,y,merge];
	let dsts = [ret.x, ret.y, ret.merge];
	for(let i=0;i<srcs.length; i++) {
		let src = srcs[i];
		let dst = dsts[i];
		dst.fill(0);
		for(let j=0;j<src.length; j++) {
			let pos = Math.round(j*size/src.length);
			dst[pos] = Math.max(dst[pos], src[j]);
		}
	}
	return ret;
}

function fillNextFrame(memory) {
	//log('fnf', posx, posy);
	if (waveY == emptyWave && waveY == emptyWave) {
		memory.fill(0);
		return;
	}
	let frameX = waveX.getAnalizedFrame(posx + lfox, memory);
	let frameY = waveY.getAnalizedFrame(posy + lfoy, memory);

	let frame;
	if (waveX == emptyWave)
		frame = frameY;
	else if (waveY == emptyWave)
		frame = frameX;
	else
		frame = mergeFrame(frameX, frameY);

	simplifiedResynthesize(frame, memory);
}

function mergeFrame(frame1, frame2) {
	let len = fftSize / 2 + 1;
	let { magnitudes, deltaPh } = mergeFrameSpace;
	for (let i = 0; i < len; i++) {
		let m1 = frame1.magnitudes[i];
		let m2 = frame2.magnitudes[i];
		let dph1 = frame1.deltaPh[i];
		let dph2 = frame2.deltaPh[i];
		magnitudes[i] = m1 * (1 - mix) + m2 * mix;
		//magnitudes[i] = Math.min(m1, m2);
		let deltadelta = normalize(dph2 - dph1);
		let delta = dph1 + (deltadelta * m2 / (m1 + m2))
		deltaPh[i] = normalize(delta);
	}
	return mergeFrameSpace;
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
	log('set wave '+index);
}


self.onmessage = async function (event) {
	const d = event.data;
	const type = event.data.type;
	//log('Worker ricevuto messaggio:', type );

	if (type == 'init') {
		log('vocoder worker init', d);
		fftSize = d.fftSize;
		overlap = d.overlap;
		sampleRate = d.sampleRate;
		await init();
		self.postMessage({
			type: 'init_complete',
		});
		return;
	}

	if (type == 'set-status') {
		Object.assign(self, data);
	}

	if (type=='set-wave') {
		let {index, buffer} = event.data; 
		setwave(index, buffer);
	}
	if (type == 'set-wave') {
		log('worker setwave '+d.index);
		setwave(d.index, d.buffer);
	}

	if (type == 'next-buffer') {
		let buffer = new Float32Array(bufferSize);
		fillNextFrame(buffer);
		self.postMessage({
			type: 'next-buffer',
			data: buffer,
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
