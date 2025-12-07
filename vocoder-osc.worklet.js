
console.log('in vocoder oscillator worklet');

const VOCODER_DRY_OUTPUT = 0;
const VOCODER_WET_OUTPUT = 1;

let sampleRate;
let delSize;
let lbuff;
let rbuff;

const MODE_PARALLEL = 1;
const MODE_PINGPONG_L = 2;
const MODE_PINGPONG_R = 3;
// const MODE_PINGPONG_LR = 4;


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

		delSize = 3 * sampleRate;
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
		if (d.type == 'init') {
			this.init(d.fftSize, d.overlap, d.sampleRate);
			this.port.postMessage({ type: 'initialized' });
		}
		if (d.type === 'set') {
			//log('set', d.value);
			Object.assign(this, d.value);
			if (d.clearDelay)
				clearDelay();
		}
		if (d.type === 'new-frame') {
			this.lastFrame.set(d.data)
		}
		if (d.type === 'dump-request') {
			this.port.postMessage({ type: 'dump', data: { frames: this.outFrames, lastFrame: this.lastFrame } });
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
		const dryOutput = outputs[VOCODER_DRY_OUTPUT];
		const wetOuput = outputs[VOCODER_WET_OUTPUT];
		const wetLeft = wetOuput[0];
		const wetRight = wetOuput[1];
		const dryMono = dryOutput[0];

		for (let i = 0; i < wetLeft.length; i++) {
			let oscOutSample = 0;
			for (let outFrame of this.outFrames)
				oscOutSample += outFrame.getSample();

			dryMono[i] = oscOutSample;

			let delOut = delay(oscOutSample);
			wetLeft[i] = delOut[0];
			wetRight[i] = delOut[1];
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
let lastL = 0, lastR = 0, filteredFeedback = 0;

function delay(input) {
	let ldelSamples = Math.round(delParams.ldelay * sampleRate);
	let rdelSamples = Math.round(delParams.rdelay * sampleRate);

	let leftDelayOut = lbuff[(wcur - ldelSamples + delSize) % delSize];
	let rightDelayOut = rbuff[(wcur - rdelSamples + delSize) % delSize];
	// lastL += (leftDelayOut - lastL) * delParams.lopass;
	// lastR += (rightDelayOut - lastR) * delParams.lopass;
	// if (Number.isNaN(lastL) || Number.isNaN(lastR)) {
	// 	lastL = 0;
	// 	lastR = 0;
	// }
	let leftDelayIn = 0, rightDelayIn = 0;
	if (delParams.mode == MODE_PARALLEL) {
		let fb = leftDelayOut + rightDelayOut;
		filteredFeedback += (fb - filteredFeedback) * delParams.lopass;
		if (Number.isNaN(filteredFeedback)) filteredFeedback = 0;
		leftDelayIn  = input + filteredFeedback * delParams.feedback;
		rightDelayIn = input + filteredFeedback * delParams.feedback;
	}
	else if (delParams.mode == MODE_PINGPONG_L) {
		let fb = rightDelayOut;
		filteredFeedback += (fb - filteredFeedback) * delParams.lopass;
		if (Number.isNaN(filteredFeedback)) filteredFeedback = 0;
		leftDelayIn = input + filteredFeedback * delParams.feedback;
		rightDelayIn = leftDelayOut;
	}
	else if (delParams.mode == MODE_PINGPONG_R) {
		let fb = leftDelayOut;
		filteredFeedback += (fb - filteredFeedback) * delParams.lopass;
		if (Number.isNaN(filteredFeedback)) filteredFeedback = 0;
		leftDelayIn = rightDelayOut;
		rightDelayIn = input + filteredFeedback * delParams.feedback;
	}
	// let lin = delParams.mode!=MODE_PINGPONG_R ? input : 0;
	// let rin = delParams.mode!=MODE_PINGPONG_L ? input : 0;
	// if (delParams.mode==MODE_PARALLEL) {
	// 	lin += lastL*delParams.feedback;
	// 	rin += lastR*delParams.feedback;
	// }
	// else {
	// 	lin += lastR*delParams.feedback;
	// 	rin += lastL*delParams.feedback;
	// }

	lbuff[wcur] = leftDelayIn;
	rbuff[wcur] = rightDelayIn;

	wcur = (wcur + 1) % delSize;
	let outl = input * .5 * (1 - delParams.mix) + leftDelayOut * delParams.mix;
	let outr = input * .5 * (1 - delParams.mix) + rightDelayOut * delParams.mix;
	return [outl, outr];
}

function clearDelay() {
	lbuff.fill(0);
	rbuff.fill(0);
}

registerProcessor('phase-vocoder-processor', Vocoder);
