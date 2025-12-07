

const LFOWAVE_SINE = 0;
const LFOWAVE_COSINE = 1;
const LFOWAVE_TRIANGLE = 2;
const LFOWAVE_SAW_UP = 3;
const LFOWAVE_SAW_DOWN = 4;
const LFOWAVE_SQUARE = 5;

const VOCODER_DRY_OUTPUT = 0;
const VOCODER_WET_OUTPUT = 1;
const RECORDER_DRY_INPUT = 0;
const RECORDER_WET_INPUT = 1;


const pi = Math.PI;
const twoPi = 2 * Math.PI;

const mergeModes = [
	["mix", "X + Y", "X", "Y", "X+Y"],
	// ["diff", "|X - Y|", "X", "Y", "|X-Y|"],
	// ["min", "min(X,Y)", "X", "Y", "min(X,Y)"],
	// ["max", "max(X,Y)", "X", "Y", "max(X,Y)"],
	["dxmix", "ΔX + Y", "ΔX", "Y", "ΔX+Y"],
	["dymix", "X + ΔY", "X", "ΔY", "X+ΔY"],
	["dxdymix", "ΔX + ΔY", "ΔX", "ΔY", "ΔX+ΔY"],
	["xcy", "X * contour[Y]", "X", "contour(Y)", "X*contour(Y)"],
	["cxy", "Y * contour[X]", "contour(X)", "Y", "contour(X)*Y"]
];

function lfowave(shape, rad, deltaph) { // -PI < rad <PI
	rad = normalize(rad);
	if (shape == LFOWAVE_SQUARE)
		return rad >= 0 ? 1 : -1;
	if (shape == LFOWAVE_SINE)
		return Math.sin(rad);
	// if (shape == LFOWAVE_COSINE)
	// 	return Math.cos(rad);
	if (shape == LFOWAVE_SAW_UP)
		return rad / pi;
	if (shape == LFOWAVE_SAW_DOWN)
		return - rad / pi;
	if (shape == LFOWAVE_TRIANGLE)
		return 2 * Math.abs(rad) / pi - 1;
	return 0;
}

function lfowaveX(shape, rad, deltaph) {
	return lfowave(shape, rad - deltaph);
}

function lfowaveY(shape, rad, deltaph) {
	const shapeYDeltaPh = (shape == LFOWAVE_SINE || shape == LFOWAVE_TRIANGLE) ? Math.PI / 2 : 0;
	return lfowave(shape, rad + deltaph + shapeYDeltaPh);
}

function normalize(x) {
	x = x % twoPi; // porta il valore in [-2π, 2π)
	if (x <= -Math.PI) {
		x += twoPi;
	} else if (x > Math.PI) {
		x -= twoPi;
	}
	return x;;
}


function initCommon(fftSize, overlap, sampleRate) {

	const doPhaseVocoder = true;
	const simplifiedPhaseVocoder = true;


	const windowSize = fftSize;
	const hopSize = windowSize / overlap;

	let lastPhases = new Float32Array(fftSize / 2 + 1).fill(0);
	const resetPhases = () => lastPhases.fill(0);

	const binCenterFreqHz = [];
	let hopSizeSec = hopSize / sampleRate;
	let hopSizeHz = sampleRate / hopSize;
	let freqPerBin = sampleRate / fftSize; // Frequenza di ogni bin in Hz
	for (let i = 0; i < fftSize / 2 + 1; i++)
		binCenterFreqHz[i] = i * freqPerBin;
	let fft = new FFT(fftSize);

	const window = createHammingWindow(windowSize);

	//const normalize = x => x > Math.PI ? x - twoPi : (x < -Math.PI ? x + twoPi : x);


	function createHammingWindow(size) {
		const window = new Float32Array(size);
		for (let i = 0; i < size; i++) {
			window[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (size - 1));
		}
		return window;
	}

	function phaseDeltaToFrequency(phaseDelta, band) {
		// Questa è la variazione di fase che ci aspetteremmo se la frequenza
		// del segnale fosse esattamente al centro del bin della FFT.
		let expectedPhaseDelta = twoPi * hopSize * band / fftSize;

		// "Scarta" la fase (Phase Unwrapping)
		// Sottraiamo la variazione attesa e normalizziamo il risultato tra -π e +π
		// per trovare la deviazione reale dalla frequenza del bin.
		let phaseDeviation = phaseDelta - expectedPhaseDelta;
		phaseDeviation = phaseDeviation - twoPi * Math.round(phaseDeviation / twoPi);

		// Calcola la frequenza reale
		// La frequenza reale è la frequenza del bin più la deviazione,
		// convertita da radianti a Hz.
		// const freqDeviationHz = (phaseDeviation * sampleRate) / (twoPi * hopSize);
		const freqDeviationHz = (phaseDeviation / twoPi) * hopSizeHz;

		let freq = binCenterFreqHz[band] + freqDeviationHz;
		return freq;
	}

	function frequencyToBand(f) {
		return Math.round(f/freqPerBin);
	}

	function bandToFrequency(band) {
		return band*freqPerBin;
	}

	function frequencyToPhaseDelta(frequency) {
		const band = frequencyToBand(frequency);
		let freqDeviationHz = frequency - binCenterFreqHz[band];
		let phaseDeviation = twoPi * freqDeviationHz / hopSizeHz;
		let expectedPhaseDelta = twoPi * hopSize * band / fftSize;
		let phaseDelta = expectedPhaseDelta + phaseDeviation;
		return { band, phaseDelta };
	}


	function simplified_complexSpectrumToPhaseVocoder(complexSpectrum) {
		const magnitudes = new Float32Array(fftSize / 2 + 1);
		const deltaPh = new Float32Array(fftSize / 2 + 1);

		for (let k = 0; k < fftSize / 2 + 1; k++) {
			const re = complexSpectrum[2 * k];
			const im = complexSpectrum[2 * k + 1];

			magnitudes[k] = Math.sqrt(re * re + im * im);
			let ph = Math.atan2(im, re);
			let delta = normalize(ph - lastPhases[k]);
			deltaPh[k] = delta;

			lastPhases[k] = ph;
		}
		return { magnitudes, deltaPh };

	}

	function simplified_phaseVocoderToComplexSpectrum(magnitudes, deltaPh) {

		const complexSpectrum = fft.createComplexArray();

		for (let k = 0; k < magnitudes.length; k++) {

			let ph = normalize(lastPhases[k] + deltaPh[k]);
			lastPhases[k] = ph;
			complexSpectrum[2 * k] = magnitudes[k] * Math.cos(ph);
			complexSpectrum[2 * k + 1] = magnitudes[k] * Math.sin(ph);
		}

		return complexSpectrum;

	}

	function simplifiedAnalysisAtPoint(signal, point) {
		const len = signal.length;
		const modlen = x => { while (x < 0) x += len; while (x >= len) x -= len; return x; };
		let window = simplifiedAnalysisAtPoint.window;
		if (!window)
			window = simplifiedAnalysisAtPoint.window = createHammingWindow(windowSize);

		let start1 = modlen(Math.round(point + len - windowSize / 2 - hopSize / 2));
		let start2 = modlen(start1 + hopSize);

		// if (start1 < 0) {
		// 	start2 = start2 - start1;
		// 	start1 = 0;
		// }
		// if (start2 + windowSize > signal.length) {
		// 	start2 = signal.length - windowSize;
		// 	start1 = start2 - hopSize;
		// }
		// start1 = Math.round(start1);
		// start2 = Math.round(start2);

		let analized = [start1, start2].map(start => {
			let slice = new Float32Array(windowSize + 1);
			for (let i = 0; i <= windowSize; i++)
				slice[i] = signal[modlen(start + i + len)] * window[i];
			let complexSpectrum = fft.createComplexArray();
			fft.realTransform(complexSpectrum, slice);
			fft.completeSpectrum(complexSpectrum);
			let magnitudes = new Float32Array(fftSize / 2 + 1);
			let phases = new Float32Array(fftSize / 2 + 1);
			for (let k = 0; k < fftSize / 2 + 1; k++) {
				const re = complexSpectrum[2 * k];
				const im = complexSpectrum[2 * k + 1];

				if (start == start2) // è inutile calcolare la prima magnitude
					magnitudes[k] = Math.sqrt(re * re + im * im);
				phases[k] = Math.atan2(im, re);
			}
			return { magnitudes, phases }
		});

		let magnitudes = [], deltaPh = [];
		for (let i = 0; i < fftSize / 2 + 1; i++) {
			magnitudes[i] = analized[1].magnitudes[i];
			deltaPh[i] = normalize(analized[1].phases[i] - analized[0].phases[i]);


			// per evitare "danni"
			if (Number.isNaN(deltaPh[i]))
				deltaPh[i] = 0;
			if (Number.isNaN(magnitudes[i]))
				magnitudes[i] = 0;
		}

		return { magnitudes, deltaPh };
	}

	function transpose(magnitudes, deltaPh, freqFunction) {

		let outm = transpose.outm;
		if (!outm)
			outm = transpose.outm = new Float32Array(magnitudes.length);
		let outph = transpose.outph;
		if (!outph)
			outph = new Float32Array(deltaPh.length);

		outm.fill(0);
		outph.fill(0);

		for(let srcBand = 0; srcBand < magnitudes.length; srcBand++) {
			let freq = phaseDeltaToFrequency(deltaPh[srcBand], srcBand);
			const newFreq = freqFunction(freq, srcBand);
			let {band, phaseDelta} = frequencyToPhaseDelta(newFreq);

			if (magnitudes[srcBand] == 0)
				continue;

			outph[band] = (phaseDelta*magnitudes[srcBand] + outph[band]*outm[band])/(outm[band] + magnitudes[srcBand]);
			outm[band] += magnitudes[srcBand];
		}
		for(let i=0;i<outm.length;i++) {		
			magnitudes[i] = outm[i];
			deltaPh[i] = outph[i];
		}
	}

	
	function spectralTransform(magnitudes, deltaPh, transpFunction, ...transpFunctionArguments) {

		let outm = spectralTransform.outm;
		if (!outm)
			outm = spectralTransform.outm = new Float32Array(magnitudes.length);
		let outph = spectralTransform.outph;
		if (!outph)
			outph = new Float32Array(deltaPh.length);

		outm.fill(0);
		outph.fill(0);

		for(let srcBand = 0; srcBand < magnitudes.length; srcBand++) {
			let freq = phaseDeltaToFrequency(deltaPh[srcBand], srcBand);
			let { a, f} = transpFunction(freq, magnitudes[srcBand], srcBand, ...transpFunctionArguments);
			let {band, phaseDelta} = frequencyToPhaseDelta(f);

			if (a == 0)
				continue;

			outph[band] = (phaseDelta*a + outph[band]*outm[band])/(outm[band] + a);
			outm[band] += a;
		}
		for(let i=0;i<outm.length;i++) {		
			magnitudes[i] = outm[i];
			deltaPh[i] = outph[i];
		}
	}

	function simplifiedResynthesize(frame, outArea) {
		const { magnitudes, deltaPh } = frame;
		let complexSpectrum = simplified_phaseVocoderToComplexSpectrum(magnitudes, deltaPh);
		fft.completeSpectrum(complexSpectrum);

		const timeDomainFrame = fft.createComplexArray();
		fft.inverseTransform(timeDomainFrame, complexSpectrum);
		outArea.fill(0);
		for (let j = 0; j < windowSize; j++)
			// L'output della iFFT di fft.js è solo nella parte reale dell'array (indici pari)
			outArea[j] += timeDomainFrame[j * 2] * window[j];
	}

	function linearSpeedRescale(x) {
		if (x < 0)
			return -linearSpeedRescale(-x);
		const D = .01;
		if (x < D)
			return 0;
		x = (x - D) / (1 - D);
		x = x * x * x * 2;
		return x;
	}


	function lfoAmpRescale(x) {
		const D = .01;
		x = x < D ? 0 : (x - D) / (1 - D);
		x = x * x * x * .5;
		return x;
	}

	function delayLengthRescale(x) {
		const D = .01;
		x = x < D ? 0 : (x - D) * (1 - D);
		x = Math.round(x * x * x * 3000) / 1000;
		return x;
	}

	const LEFTTRACTIONVALUE = .0005;
	const RIGHTTRACTIONVALUE = .2;
	function tractionRescale(x) {
		return LEFTTRACTIONVALUE * Math.pow(RIGHTTRACTIONVALUE / LEFTTRACTIONVALUE, x);
	}

	function lfoSpeedRescale(x) {
		return Math.pow(x, 3) * 10;
	}

	function cutoffToAlpha(cutoff) {
		return 1 - Math.exp(-2 * Math.PI * cutoff / sampleRate);
	}

	function alphaToCutoff(alpha) {
		return -(sampleRate / (2 * Math.PI)) * Math.log(1 - alpha);
	}

	function amplitudeToDb(amplitude) {
		if (amplitude <= 0) {
			return -96; // l'ampiezza nulla corrisponde a -∞ dB
		}
		return Math.max(-96, 20 * Math.log10(amplitude));
	}

	function dbToAmplitude(db) {
		return Math.pow(10, db / 20);
	}

	const hstep = Math.pow(2, 1 / 12);

	function getContourTable() {
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
	let contourTable = getContourTable();


	const now = () => new Date().getTime();
	let exp = {
		createHammingWindow, normalize,
		fft, fftSize, windowSize, overlap, hopSize,
		doPhaseVocoder, simplifiedPhaseVocoder,
		simplifiedAnalysisAtPoint, simplifiedResynthesize,
		// complexSpectrumToPhaseVocoder, phaseVocoderToComplexSpectrum,
		simplified_complexSpectrumToPhaseVocoder, simplified_phaseVocoderToComplexSpectrum,
		frequencyToPhaseDelta,
		bandToFrequency,
		transpose,
		
		
		spectralTransform,
		resetPhases,
		linearSpeedRescale,
		lfoAmpRescale,
		delayLengthRescale,
		tractionRescale,
		lfoSpeedRescale,
		cutoffToAlpha,
		alphaToCutoff,
		amplitudeToDb,
		dbToAmplitude,
		contourTable,
		mergeModes,
		now
	};
	return exp;
}


