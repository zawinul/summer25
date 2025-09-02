const fftSize = 4096;
const overlap = 4;
let audioContext;
let vocoderWorker;

$(function () {

	function log() {
		let pars = ['main'];
		for (let i = 0; i < arguments.length; i++) {
			pars.push(arguments[i]);
		}
		console.log(...pars);
	}


	let oscCreated = Promise.withResolvers();
	let oscInitialized = Promise.withResolvers();
	let workerCreated = Promise.withResolvers();
	let workerInitialized = Promise.withResolvers();


	let vocoderOscillatorNode;
	let amplitudeNode;
	let reverbNode;
	let reverbSendNode;
	let mainOutputNode;
	let waveX, waveY;

	const $status = $('#status');
	let isSuspended = true;

	async function initVocoderOscillator() {
		log('in initVocoderOscillator');
		await audioContext.audioWorklet.addModule('vocoder-osc.worklet.js');
		vocoderOscillatorNode = new AudioWorkletNode(audioContext, 'phase-vocoder-processor');
		vocoderOscillatorNode.port.onmessage = evt => onOscillatorMessage(evt);
		await oscCreated.promise;
		log('initVocoderOscillator: osc created');

		vocoderOscillatorNode.port.postMessage({
			type: 'init',
			sampleRate: audioContext.sampleRate,
			fftSize,
			overlap
		});
		await oscInitialized.promise;
		log('initVocoderOscillator: osc initialized');
	}

	async function initVocoderWorker() {
		if (vocoderWorker) {
			vocoderWorker.terminate();
		}

		vocoderWorker = new Worker('vocoder.js');

		vocoderWorker.onmessage = event => onVocoderMessage(event);

		vocoderWorker.onerror = function (error) {
			console.error('Errore worker:', error);
			$status.text('Errore nel worker vocoder');
		};


		await workerCreated.promise;
		log('Worker vocoder creato');


		vocoderWorker.postMessage({
			type: 'init',
			sampleRate: audioContext.sampleRate,
			fftSize,
			overlap
		});
		await workerInitialized.promise;
		log('Worker vocoder inizializzato');
	}



	async function initAudio() {
		if (audioContext) return;

		try {
			audioContext = new (window.AudioContext || window.webkitAudioContext)();
			await audioContext.suspend();

			$status.text('AudioContext creato. Inizializzazione worker vocoder...');

			await initVocoderWorker();
			await initVocoderOscillator();

			// Ampli
			amplitudeNode = audioContext.createGain();
			amplitudeNode.gain.value = $('#slider-amp').val();

			// Reverb
			reverbNode = audioContext.createConvolver();
			loadImpulseResponse("ir/Samplicity - Bricasti IRs version 2023-10, left-right files, 48 Khz/1 Halls 05 Medium & Near, 48K L.wav", reverbNode);

			// Reverb Send
			reverbSendNode = audioContext.createGain();
			reverbSendNode.gain.value = $('#slider-reverb').val() * 3;

			// main gain
			mainOutputNode = audioContext.createGain();
			mainOutputNode.gain.value = 1.0;

			vocoderOscillatorNode.connect(amplitudeNode);
			amplitudeNode.connect(mainOutputNode);

			vocoderOscillatorNode.connect(reverbSendNode);
			reverbSendNode.connect(reverbNode);
			reverbNode.connect(mainOutputNode);

			// exit
			mainOutputNode.connect(audioContext.destination);

			$status.text('Pronto. Audio in esecuzione.');
			$('.waveurl').trigger('change');

		}
		catch (e) {
			log(e);
			$status.text('Errore: ' + e);
			alert('Errore: ' + e);
		}
	}

	function togglePause() {
		if (isSuspended) {
			audioContext.resume();
			$('#btn-pause').text('Pause');
			isSuspended = false;
		}
		else {
			audioContext.suspend();
			$('#btn-pause').text('Play');
			isSuspended = true;
		}
	}

	async function onOscillatorMessage(evt) {
		//log({ onOscillatorMessage: evt.data.type })
		let d = evt.data;
		if (d.type == 'new-frame-request') {
			vocoderWorker.postMessage({type:'next-buffer'});
		}
		if (d.type == 'created') {
			oscCreated.resolve();
			log('osc created');
		}
		if (d.type == 'initialized') {
			oscInitialized.resolve();
			log('osc initialized');
		}
	}


	async function onVocoderMessage(evt) {
		//log({ onVocoderMessage: evt.data.type })
		let d = evt.data;
		if (d.type == 'init_complete') {
			workerInitialized.resolve();
			log('worker initialized');

		}
		if (d.type == 'created') {
			log('worker has been created');
			workerCreated.resolve();
		}
		if (d.type == 'osc-status') {

		}
		if (d.type == 'next-buffer') {

		}
		if (d.type == 'error') {

		}

	}

	async function loadAudio(url, index) {
		if (!audioContext) return;
		$status.text('Caricamento audio ' + index.toUpperCase() + ' in corso...');
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
			const arrayBuffer = await response.arrayBuffer();
			let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
			if (audioBuffer.numberOfChannels > 1) {
				console.warn("L'audio non è mono. Si utilizza solo il primo canale.");
			}
			const monoChannelData = audioBuffer.getChannelData(0);
			if (index == 'y') {
				waveY = monoChannelData.slice()
				mousepad.setWave(index, waveY)
			}
			else {
				waveX = monoChannelData.slice();
				mousepad.setWave(index, waveX);
			}

			let payload = {
				type: 'set-wave',
				index: index,
				buffer: monoChannelData.buffer
			};
			vocoderWorker.postMessage(payload, [payload.buffer]);
		}
		catch (error) {
			$status.text(`Errore nel caricamento dell'audio: ${error.message}`);
			console.error(error); throw error;
		}
	}


	async function loadImpulseResponse(url, convolver) {
		const response = await fetch(url);
		const arrayBuffer = await response.arrayBuffer();
		convolver.buffer = await audioContext.decodeAudioData(arrayBuffer);
	}


	// --- GESTIONE EVENTI UI ---

	// $btnStart.on('click', async () => {
	// 	if (!audioContext) {
	// 		await initAudio(); // La prima volta inizializza tutto
	// 	}

	// 	// Riprende l'AudioContext se era sospeso (policy dei browser)
	// 	if (audioContext.state === 'suspended') {
	// 		await audioContext.resume();
	// 	}

	// 	// Invia il messaggio 'start' al worker per iniziare a generare il suono
	// 	customOscillatorNode.port.postMessage({ action: 'start' });

	// 	$status.text('Audio in esecuzione.');
	// 	// $btnStart.prop('disabled', true);
	// 	// $btnPause.prop('disabled', false);
	// 	// $btnStop.prop('disabled', false);
	// });

	$('#btn-pause').on('click', togglePause);

	// $btnPause.on('click', () => {
	// 	if (!customOscillatorNode) return;
	// 	customOscillatorNode.port.postMessage({ action: 'pause' });
	// 	$status.text('Audio in pausa.');
	// 	$btnStart.prop('disabled', false);
	// 	$btnPause.prop('disabled', true);
	// });

	// $btnStop.on('click', () => {
	// 	if (!customOscillatorNode) return;
	// 	customOscillatorNode.port.postMessage({ action: 'stop' });
	// 	$status.text('Audio fermato. Clicca Start per ripartire.');
	// 	$btnStart.prop('disabled', false);
	// 	$btnPause.prop('disabled', true);
	// 	$btnStop.prop('disabled', true);
	// });

	// Gestione degli slider
	$('#slider-amp').on('input', function () {
		const value = parseFloat($(this).val());
		if (amplitudeNode) {
			// Usiamo setTargetAtTime per un cambio di volume più morbido
			amplitudeNode.gain.setTargetAtTime(value, audioContext.currentTime, 0.01);
		}
		$('#amp-value').text(value.toFixed(2));
	});


	$('#slider-reverb').on('input', function () {
		const value = parseFloat($(this).val());
		if (reverbSendNode) {
			reverbSendNode.gain.setTargetAtTime(value * 3, audioContext.currentTime, 0.01);
		}
		$('#reverb-value').text(value.toFixed(2));
	});

	$('.waveurl').on('change', function (evt) {
		let url = $(this).val();
		let index = $(this).attr('data-index');
		loadAudio(url, index);
	});


	mousepad.init();
	$(initAudio);
});