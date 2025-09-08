
function initCommon(fftSize, overlap, sampleRate) {

	let debugdump = {}

	const doPhaseVocoder = true;
	const simplifiedPhaseVocoder = true;

	const twoPi = 2 * Math.PI;

	const windowSize = fftSize;
	const hopSize = windowSize / overlap;

	let lastPhases = new Float32Array(fftSize / 2 + 1).fill(0);
	const resetPhases = ()=>lastPhases.fill(0);

	const binCenterFreqHz = [];
	let hopSizeSec = hopSize / sampleRate;
	let hopSizeHz = sampleRate / hopSize;
	let freqPerBin = sampleRate / fftSize; // Frequenza di ogni bin in Hz
	for (let i = 0; i < fftSize / 2 + 1; i++)
		binCenterFreqHz[i] = i * freqPerBin;
	let fft = new FFT(fftSize);

	const window = createHammingWindow(windowSize);

	//const normalize = x => x > Math.PI ? x - twoPi : (x < -Math.PI ? x + twoPi : x);
	function normalize(x) {
		if (x > Math.PI)
			return x - twoPi;
		if (x < -Math.PI)
			return x + twoPi;
		return x;
	}


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

		let freq = binCenterFreqHz[k] + freqDeviationHz;
		return freq;
	}

	function frequencyToPhaseDelta(frequency, band) {
		let freqDeviationHz = frequency - binCenterFreqHz[band];
		let phaseDeviation = twoPi * freqDeviationHz / hopSizeHz;
		let expectedPhaseDelta = twoPi * hopSize * band / fftSize;
		let phaseDelta = expectedPhaseDelta + phaseDeviation;
		return phaseDelta;
	}

	function complexSpectrumToPhaseVocoder(complexSpectrum) {
		const magnitudes = new Float32Array(fftSize / 2 + 1);
		const currentPhases = new Float32Array(fftSize / 2 + 1);
		const frequencies = new Float32Array(fftSize / 2 + 1);

		for (let k = 0; k < fftSize / 2 + 1; k++) {
			const re = complexSpectrum[2 * k];
			const im = complexSpectrum[2 * k + 1];

			magnitudes[k] = Math.sqrt(re * re + im * im);
			currentPhases[k] = Math.atan2(im, re);

			// Calcola la differenza di fase rispetto al frame precedente
			let phaseDelta = currentPhases[k] - lastPhases[k];

			// Questa è la variazione di fase che ci aspetteremmo se la frequenza
			// del segnale fosse esattamente al centro del bin della FFT.
			let expectedPhaseDelta = twoPi * hopSize * k / fftSize;

			// 6. "Scarta" la fase (Phase Unwrapping)
			// Sottraiamo la variazione attesa e normalizziamo il risultato tra -π e +π
			// per trovare la deviazione reale dalla frequenza del bin.
			let phaseDeviation = phaseDelta - expectedPhaseDelta;
			phaseDeviation = phaseDeviation - twoPi * Math.round(phaseDeviation / twoPi);

			// const hopSize = windowSize / overlap;
			// const hopSizeSec = hopSize / sampleRate;
			// const hopSizeHz = sampleRate / hopSize;


			// 7. Calcola la frequenza reale
			// La frequenza reale è la frequenza del bin più la deviazione,
			// convertita da radianti a Hz.
			// const freqDeviationHz = (phaseDeviation * sampleRate) / (twoPi * hopSize);
			const freqDeviationHz = (phaseDeviation / twoPi) * hopSizeHz;

			frequencies[k] = binCenterFreqHz[k] + freqDeviationHz;

			// --- FINE LOGICA CHIAVE ---
		}
		lastPhases = currentPhases;
		return { magnitudes, frequencies };

	}

	function phaseVocoderToComplexSpectrum(magnitudes, frequencies) {

		//const currentPhases = new Float32Array(fftSize / 2 + 1);
		const complexSpectrum = fft.createComplexArray();

		// 1. Ricostruisci la fase e converti da polare a cartesiano
		for (let k = 0; k < magnitudes.length; k++) {


			let freqDeviationHz = frequencies[k] - binCenterFreqHz[k];
			let phaseDeviation = twoPi * freqDeviationHz / hopSizeHz;
			let expectedPhaseDelta = twoPi * hopSize * k / fftSize;
			let phaseDelta = expectedPhaseDelta + phaseDeviation;
			let currentPhase = lastPhases[k] + phaseDelta;
			if (currentPhase > twoPi)
				currentPhase -= twoPi;
			else if (currentPhase < -twoPi)
				currentPhase += twoPi;
			lastPhases[k] = currentPhase;
			complexSpectrum[2 * k] = magnitudes[k] * Math.cos(currentPhase);
			complexSpectrum[2 * k + 1] = magnitudes[k] * Math.sin(currentPhase);
		}

		return complexSpectrum;

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
	
	function simplifiedAnalysisAtPoint(signal, point, debugdump) {
		const len = signal.length;
		const modlen = x=>{while(x<0) x+=len; while(x>=len) x-=len; return x;};
		let window = simplifiedAnalysisAtPoint.window;
		if (!window)
			window = simplifiedAnalysisAtPoint.window = createHammingWindow(windowSize);

		let start1 = modlen(Math.round(point +len - windowSize / 2 - hopSize / 2));
		let start2 = modlen(start1 + hopSize);
		debugdump.start1 = start1;
		debugdump.start2 = start2;
		debugdump.point = point;

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
		debugdump.analized = analized;
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
		debugdump.aDeltaPh = deltaPh;
		return { magnitudes, deltaPh };
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
	
	let exp = {
		createHammingWindow, normalize,
		fft, fftSize, windowSize, overlap, hopSize,
		doPhaseVocoder, simplifiedPhaseVocoder,
		simplifiedAnalysisAtPoint, simplifiedResynthesize,
		complexSpectrumToPhaseVocoder, phaseVocoderToComplexSpectrum,
		simplified_complexSpectrumToPhaseVocoder, simplified_phaseVocoderToComplexSpectrum,
		frequencyToPhaseDelta,
		resetPhases,
		debugdump

	};
	return exp;
}


