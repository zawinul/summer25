console.log('in vocoder oscillator worklet');
// import { FFT } from './fft.js';
// import { init } from './common.js';

function log() {
	let pars = ['voc-osc'];
	for (let i = 0; i < arguments.length; i++) {
		pars.push(arguments[i]);
	}
	console.log(...pars);
}

class Vocoder extends AudioWorkletProcessor {

	constructor() {
		super();
		this.port.onmessage = event => this.onMessage(event);
		this.port.postMessage({ type: 'created' });
	}

	init(fftSize, overlap, sampleRate) {
		this.fftSize = fftSize;
		this.overlap = overlap;
		this.sampleRate = sampleRate;
		this.outFrames = [];
		for (let i = 0; i < overlap; i++)
			this.outFrames[i] = this.createOutBuffer(fftSize+1, i * fftSize / overlap);

		this.lastFrame = new Float32Array(fftSize + 1).fill(0);
		this.port.postMessage({ type: 'initialized' });
	}

	askForANewFrame() {
		this.port.postMessage({ type: 'new-frame-request' });
	}

	createOutBuffer(size, initialPh) {
		let oscillator = this;
		let ph = initialPh;
		let data = new Float32Array(size).fill(0);
		function getSample() {
			let ret = data[ph++];
			if (ph >= data.length) {
				ph = 0;
				data.set(oscillator.lastFrame);
				oscillator.askForANewFrame();
			}
			return ret;
		}
		return { ph, data, getSample }
	}

	// fillNextFrame(memory) {
	// 	//log('fnf', this.posx, this.posy);
	// 	if (this.waveY == this.emptyWave && this.waveY == this.emptyWave) {
	// 		memory.fill(0);
	// 		return;
	// 	}
	// 	let frame1 = this.waveX.getAnalizedFrame(this.posx + this.lfox, memory);
	// 	let frame2 = this.waveY.getAnalizedFrame(this.posy + this.lfoy, memory);
	// 	// debugdump.frame1 = frame1;
	// 	// debugdump.frame2 = frame2;
	// 	// debugdump.posx = this.posx;
	// 	// debugdump.posy = this.posy;
	// 	// debugdump.lfox = this.lfox;
	// 	// debugdump.lfoy = this.lfoy;
	// 	// debugdump.lfoph = this.lfoph;
	// 	// debugdump.lforad = this.lforad;
	// 	// debugdump.lfofreq = this.lfofreq;

	// 	let frame;
	// 	if (this.waveX == this.emptyWave)
	// 		frame = frame2;
	// 	else if (this.waveY == this.emptyWave)
	// 		frame = frame1;
	// 	else
	// 		frame = this.mergeFrame(frame1, frame2);

	// 	simplifiedResynthesize(frame, memory);
	// }

	// checkFrame(frame) {
	// 	for (let m of frame.magnitudes) {
	// 		if (Number.isNaN(m)) {
	// 			log("m is NaN", debugdump);
	// 			return false;
	// 		}
	// 	}
	// 	for (let d of frame.deltaPh) {
	// 		if (Number.isNaN(d)) {
	// 			log("d is NaN", debugdump);
	// 			return false;
	// 		}
	// 	}
	// 	return true;
	// }
	// mergeFrameSpace

	// mergeFrame(frame1, frame2) {
	// 	let len = fftSize / 2 + 1;
	// 	let { magnitudes, deltaPh } = this.mergeFrameSpace;
	// 	for (let i = 0; i < len; i++) {
	// 		let m1 = frame1.magnitudes[i];
	// 		let m2 = frame2.magnitudes[i];
	// 		let dph1 = frame1.deltaPh[i];
	// 		let dph2 = frame2.deltaPh[i];
	// 		//magnitudes[i] = m1 * (1 - this.mix) + m2 * this.mix;
	// 		magnitudes[i] = Math.min(m1, m2);
	// 		let deltadelta = normalize(dph2 - dph1);
	// 		let delta = dph1 + (deltadelta * m2 / (m1 + m2))
	// 		deltaPh[i] = normalize(delta);
	// 	}
	// 	return this.mergeFrameSpace;
	// }

	async onMessage(event) {
		let d = event.data;
		log('on osc msg', d.type)
		if (d.type=='init') {
			this.init(d.fftSize, d.overlap, d.sampleRate);
			this.port.postMessage({ type: 'initialized' });
		}
		if (d.type === 'set') {
			//log('set', d.value);
			Object.assign(this, d.value);
		}
		if (d.type === 'new-frame') {
			this.lastFrame.set(d.data)
		}
	}


	// async setwave(index, buffer) {
	// 	let data = new Float32Array(buffer);
	// 	let len = data.length;
	// 	let left = 0;
	// 	let right = len;
	// 	let ph = 0;

	// 	function getAnalizedFrame(normPh) {
	// 		debugdump.normPh = normPh;
	// 		debugdump.index = index;
	// 		debugdump.len = len;
	// 		let ph = Math.round(left + normPh * (right - left));
	// 		ph = ph % len;
	// 		//log('gaf', ph );
	// 		return simplifiedAnalysisAtPoint(data, ph, debugdump);
	// 	}
	// 	let w = { data, len, left, right, getAnalizedFrame, ph };
	// 	if (index == 'y')
	// 		this.waveY = w;
	// 	else
	// 		this.waveX = w;
	// }
	// emptyWave() {
	// 	return {
	// 		getAnalizedFrame: function () {
	// 			return {
	// 				magnitudes: [],
	// 				deltaPh: []
	// 			}
	// 		}
	// 	}
	// }

	/**
	 * Questo metodo viene chiamato dal motore audio del browser ogni volta
	 * che ha bisogno di un nuovo blocco di campioni audio.
	 * @param {Array} inputs - Array di input (non usato qui)
	 * @param {Array} outputs - Array di output che dobbiamo riempire
	 * @param {Object} parameters - Parametri audio (non usato qui)
	 * @returns {boolean} - true per mantenere attivo il processore
	 */
	process(inputs, outputs, parameters) {
		// Prendiamo il primo (e unico) output buffer
		const output = outputs[0];
		// Prendiamo il primo canale (l'oscillatore è mono)
		const channel = output[0];

		for (let i = 0; i < channel.length; i++) {
			let out = 0;
			for (let outFrame of this.outFrames) {
				out += outFrame.getSample();
			}
			channel[i] = out;
		}
		return true; // Continua a processare
	}
}



registerProcessor('phase-vocoder-processor', Vocoder);
