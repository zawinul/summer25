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
			this.outFrames[i] = this.createOutBuffer(fftSize, i * fftSize / overlap);

		this.lastFrame = new Float32Array(fftSize).fill(0);
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
			let ret = data[ph];
			ph++;
			if (ph >= data.length) {
				ph = 0;
				data.set(oscillator.lastFrame);
				oscillator.askForANewFrame();
			}
			return ret;
		}
		return { ph, data, getSample }
	}


	async onMessage(event) {
		let d = event.data;
		//log('on osc msg', d.type)
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
		if (d.type === 'dump-request') {
			this.port.postMessage({ type: 'dump', data: {frames:this.outFrames, lastFrame: this.lastFrame} });
		}
	}


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
