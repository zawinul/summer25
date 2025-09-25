console.log('in vocoder oscillator worklet');
// import { FFT } from './fft.js';
// import { init } from './common.js';
let sampleRate;
let delSize;
let lbuff;
let rbuff;

const MODE_PARALLEL = 0;
const MODE_PINGPONG_L = 1;
const MODE_PINGPONG_R = 2;
const MODE_PINGPONG_LR = 3;


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

	init(fftSize, overlap, _sampleRate) {
		this.fftSize = fftSize;
		this.overlap = overlap;
		this.sampleRate = sampleRate = _sampleRate;
		this.outFrames = [];

		delSize = 3*sampleRate;
		lbuff = new Float32Array(delSize).fill(0);
		rbuff = new Float32Array(delSize).fill(0);

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
		if (d.type === 'set-delay') {
			Object.assign(delParams, d.data);
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
		//const output = outputs[0];
		const channelL = outputs[0][0];
		const channelR = outputs[0][1];

		for (let i = 0; i < channelL.length; i++) {
			let oscOutSample = 0;
			for (let outFrame of this.outFrames) 
				oscOutSample += outFrame.getSample();
			
			let delOut = delay(oscOutSample);
			channelL[i] = delOut[0];
			channelR[i] = delOut[1];
		}
		return true; // Continua a processare
	}
}


let delParams = {
	mode: 1,
	ldelay: 1,
	rdelay: .5,
	feedback: 0,
	lopass: 1,
	mix: 0
}
let wcur = 0;
let lastL = 0, lastR = 0;

function delay(input) {
	let sLeftDelay = Math.round(delParams.ldelay * sampleRate);
	let sRightDelay = Math.round(delParams.rdelay * sampleRate);
	
	let leftDelayOut = lbuff[(wcur-sLeftDelay+delSize)%delSize];
	let rightDelayOut = rbuff[(wcur-sRightDelay+delSize)%delSize];
	lastL += (leftDelayOut-lastL)*delParams.lopass;
	lastR += (rightDelayOut-lastR)*delParams.lopass;
	if (Number.isNaN(lastL) || Number.isNaN(lastR)) {
		lastL = 0;
		lastR = 0;
	}
	let lin = delParams.mode!=MODE_PINGPONG_R ? input : 0;
	let rin = delParams.mode!=MODE_PINGPONG_L ? input : 0;
	if (delParams.mode==MODE_PARALLEL) {
		lin += lastL*delParams.feedback;
		rin += lastR*delParams.feedback;
	}
	else {
		lin += lastR*delParams.feedback;
		rin += lastL*delParams.feedback;
	}

	lbuff[wcur] = lin;
	rbuff[wcur] = rin;

	wcur = (wcur+1) % delSize;
	let outl = input*(1-delParams.mix) + leftDelayOut*delParams.mix;
	let outr = input*(1-delParams.mix) + rightDelayOut*delParams.mix;
	return [outl, outr];
}


registerProcessor('phase-vocoder-processor', Vocoder);
