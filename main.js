//"use strict";

const fftSize = 4096;
const overlap = 4;
let audioContext;
let vocoderWorker;
let waveX, waveY;

let oscInStatus = {};
let oscOutStatus = {};
let loadPresetDiv, loadXWaveDiv, loadYWaveDiv;
let vocoderOscillatorNode;

function amplitudeToDb(amplitude) {
	if (amplitude <= 0) {
		return -96; // l'ampiezza nulla corrisponde a -∞ dB
	}
	return Math.max(-96, 20 * Math.log10(amplitude));
}

function dbToAmplitude(db) {
	return Math.pow(10, db / 20);
}

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


	let amplitudeNode;
	let reverbNode;
	let reverbSendNode;
	let mainOutputNode;


	const jsonTerminator = '###\n'

	async function init() {
		await initUI();
		initWaveSelector();
		initIrSelector();
		mousepad.init();
		await initAudio();
		onMergeModeChange();
		await updateReverbIr();
		initKeys();
	}

	async function initUI() {
		$('#btn-pause').on('click', togglePause);
		$('#slider-amp').on('input', function () {
			const value = parseFloat($(this).val());
			// if (amplitudeNode) {
			// 	// Usiamo setTargetAtTime per un cambio di volume più morbido
			// 	amplitudeNode.gain.setTargetAtTime(value, audioContext.currentTime, 0.01);
			// }
			let amp = dbToAmplitude(value);
			vocoderWorker.postMessage({ type: 'set-status', data: { scale: amp } });

			$('#amp-value').text(value.toFixed(1) + ' dB');
		});


		$('#slider-reverb').on('input', function () {
			const value = parseFloat($(this).val());
			if (reverbSendNode) {
				let gain = value < -95.9 ? 0 : dbToAmplitude(value);
				reverbSendNode.gain.setTargetAtTime(gain, audioContext.currentTime, 0.01);
			}
			$('#reverb-value').text(value.toFixed(0) + ' dB');
		});


		$('.wavename').on('change', function (evt) {
			let url = $(this).val();
			let index = $(this).attr('data-index');
			loadAudio(url, index);
		});
		$('#merge-param, #merge-mode').on('change', onMergeModeChange);
		$('#merge-param').on('input', onMergeModeChange);

		loadPresetDiv = $('#modal-load-preset').detach();
		$('#save-preset').on('click', evt => savePreset());
		$('#load-preset').on('click', evt => openModal(loadPresetDiv, "Load a preset", null, "Close"));
		$('#load-preset-button', loadPresetDiv).on('click', async function (evt) {
			let { name, content } = await loadFile("s25");
			if (name != null) {
				let filename = name.split('/').slice(-1)[0];
				filename = filename.split('.');
				filename = filename.slice(0, filename.length - 1).join('.');
				$('#preset-area .name').text(filename);
				restoreBytes(content);
				closeModals();

			}
		})
		let presetlist = await fetch('presets/list.json');
		presetlist = await presetlist.json();
		let listContainer = $('#select-preset', loadPresetDiv);
		for (let p of presetlist) {
			$(`<option value="${p.file}">${p.name}</option>`).appendTo(listContainer)
		}
		listContainer.val(null).on('change', async function () {
			let file = $(this).val();
			if (file) {
				let url = `presets/${file}.s25`
				await loadPreset(url);
				closeModals();
			}
		});
		loadXWaveDiv = $('#modal-load-wave').detach();
		loadYWaveDiv = loadXWaveDiv.clone();
		let wmodals = { x: loadXWaveDiv, y: loadYWaveDiv };
		let wavelist = await fetch('waves/list.json');
		wavelist = await wavelist.json();
		for (let index in wmodals) {
			let c = wmodals[index];
			let wContainer = $('#select-wave', c);
			for (let p of wavelist)
				$(`<option value="${p.file}">${p.name}</option>`).appendTo(wContainer);

			wContainer.val(null).on('change', async function () {
				let file = $(this).val();
				if (file) {
					let url = `waves/${file}`
					await loadWave(index, url);
					closeModals();
				}
			});

			wContainer.val(null);
		}

		$('#load-x-wave').on('click', function (evt) {
			openModal(loadXWaveDiv, "Load X wave", null, "Close");
		});
		$('#load-y-wave').on('click', function (evt) {
			openModal(loadYWaveDiv, "Load Y wave", null, "Close");
		});

		initWaveDragAndDrop('x', $('.load-wave-drag-area', loadXWaveDiv));
		initWaveDragAndDrop('y', $('.load-wave-drag-area', loadYWaveDiv));
		initWaveDragAndDrop('x', $('#top-drop-bar'));
		initWaveDragAndDrop('y', $('#left-drop-bar'));
		initPresetDragAndDrop($('#load-preset-drag-area', loadPresetDiv));

	}

	async function loadWave(index, url) {
		let resp = await fetch(url);
		let parts = url.split('/');
		parts = parts[parts.length - 1]
		parts = parts.split('.');
		let name = parts.slice(0, parts.length - 1).join('.');
		let buf = await resp.arrayBuffer();
		await setWave(index, buf, name);
	}

	function uiMessage(msg) {
		if (uiMessage.timeout)
			clearTimeout(uiMessage.timeout);
		uiMessage.timeout = setTimeout(() => {
			$('#status').text('');
		}, 2000);
		$('#status').text(msg);
	}
	let isSuspended = true;

	async function initVocoderOscillator() {
		log('in initVocoderOscillator');
		await audioContext.audioWorklet.addModule('vocoder-osc.worklet.js');
		vocoderOscillatorNode = new AudioWorkletNode(audioContext, 'phase-vocoder-processor', {
			numberOfOutputs: 1,
			outputChannelCount: [2] // <--- 
		});
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
			uiMessage('Errore nel worker vocoder');
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

			uiMessage('AudioContext creato. Inizializzazione worker vocoder...');
			const lib = initCommon(fftSize, overlap, audioContext.sampleRate);
			Object.assign(window, lib);		
	
			await initVocoderWorker();
			await initVocoderOscillator();

			// Ampli
			amplitudeNode = audioContext.createGain();
			amplitudeNode.gain.value = 1;

			// Reverb
			reverbNode = audioContext.createConvolver();
			// loadImpulseResponse("ir/Samplicity - Bricasti IRs version 2023-10, left-right files, 48 Khz/1 Halls 05 Medium & Near, 48K L.wav", reverbNode);
			updateReverbIr();

			// Reverb Send
			reverbSendNode = audioContext.createGain();
			reverbSendNode.gain.value = 0;

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

			uiMessage('Pronto. Audio in esecuzione.');
			$('.wavename').trigger('change');

		}
		catch (e) {
			log(e);
			uiMessage('Errore: ' + e);
			alert('Errore: ' + e);
		}
	}

	async function updateReverbIr() {
		let name = $('#reverb-type').val();
		let url = 'ir/Samplicity - Bricasti IRs version 2023-10, left-right files, 44.1 Khz/' + name + '.wav';
		const response = await fetch(url);
		const arrayBuffer = await response.arrayBuffer();
		reverbNode.buffer = await audioContext.decodeAudioData(arrayBuffer);
	}

	function togglePause() {
		if (isSuspended) {
			audioContext.resume();
			$('#btn-pause-text').text('pause');
			isSuspended = false;
		}
		else {
			audioContext.suspend();
			$('#btn-pause-text').text('play');
			isSuspended = true;
		}
	}

	async function onOscillatorMessage(evt) {
		//log({ onOscillatorMessage: evt.data.type })
		let d = evt.data;
		if (d.type == 'new-frame-request') {
			vocoderWorker.postMessage({ type: 'new-frame-request' });
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
		if (d.type == 'osc-in-status') {
			oscInStatus = d.data;
		}
		if (d.type == 'osc-out-status') {
			oscOutStatus = d.data;
			mousepad.showOscStatus(oscOutStatus);
		}
		if (d.type == 'new-frame') {
			vocoderOscillatorNode.port.postMessage({
				type: 'new-frame',
				data: d.data
			});
			let size = Math.round($('.meter .cx').width());
			vocoderWorker.postMessage({
				type: 'graph-data-request',
				size: size
			});

		}
		if (d.type == 'graph-data') {
			let graphData = d.data;
			//log({graphData});
			window.graphData = graphData;
			drawMeters(graphData);
		}
		if (d.type == 'error') {

		}

	}

	function drawMeters(data) {
		drawMeter($('.meter .cx')[0], data.x, data.max);
		drawMeter($('.meter .cy')[0], data.y, data.max);
		drawMeter($('.meter .cxy')[0], data.merge, data.max);
	}

	function drawMeter(canvas, data, max) {
		let w = canvas.width, h = canvas.height;
		let ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, w, h);
		ctx.strokeStyle = '#000040';

		max = 256;
		for (let i = 0; i < data.length; i++) {
			let ynorm = data[i] / max;
			//ynorm = Math.max(Math.log(ynorm)*Math.log(.5), 0)
			let ynormDb = 20 * Math.log10(ynorm);
			let ypos = Math.max(Math.min(-ynormDb * 3, h), 0);
			ctx.beginPath();
			ctx.moveTo(i, h);
			ctx.lineTo(i, ypos);
			ctx.stroke();
		}
	}

	async function initWaveSelector() {
		let selectors = [$('.wavename.wx'), $('.wavename.wy')];
		let waves = await fetch('waves.json').then(r => r.json())
		for (let sel of selectors) {
			sel.empty();
			sel.append(`<option value="">none</option>`);
			for (let w of waves) {
				let [pref, name, url] = w;
				if (name.endsWith('.wav') || name.endsWith('.flac'))
					sel.append(`<option value="${url}">${pref} ${name}</option>`);

			}

		}
	}

	async function initIrSelector() {
		let irs = await fetch('rev-ir.json').then(r => r.json());
		let sel = $('#reverb-type');
		let val;
		for (let i = 0; i < irs.length; i++) {
			let w = irs[i];
			w = w.replace('.wav', '');
			sel.append(`<option value="${w}">${w}</option>`);
			if (i == 0)
				val = w;
		}
		sel.val(val);
		sel.on('change', () => updateReverbIr());
	}

	async function setWave(index, arrayBuffer, name) {
		let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
		if (audioBuffer.numberOfChannels > 1) {
			console.warn("L'audio non è mono. Si utilizza solo il primo canale.");
		}
		const monoChannelData = audioBuffer.getChannelData(0);
		if (index == 'y') {
			waveY = monoChannelData.slice()
			mousepad.setWave(index, waveY);
			$(`.wy .name`).text(name);
		}
		else {
			waveX = monoChannelData.slice();
			mousepad.setWave(index, waveX);
			$(`.wx .name`).text(name);
		}

		let payload = {
			type: 'set-wave',
			index: index,
			buffer: monoChannelData.buffer
		};
		vocoderWorker.postMessage(payload, [payload.buffer]);
	}

	async function loadAudio(url, index) {
		if (!audioContext) return;
		if (!url || url == '') return;
		uiMessage('Caricamento audio ' + index.toUpperCase() + ' in corso...');
		try {
			let lib = 'the-libre-sample-pack/master'
			let p = url.indexOf(lib);
			if (p >= 0) {
				let old = url;
				url = 'wav/the-libre-sample-pack' + old.substring(p + lib.length);
				console.log(`url changed from "${old}" to "${url}"`)
			}
			const response = await fetch(url);
			if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
			const arrayBuffer = await response.arrayBuffer();
			await setWave(index, arrayBuffer);
			// let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
			// if (audioBuffer.numberOfChannels > 1) {
			// 	console.warn("L'audio non è mono. Si utilizza solo il primo canale.");
			// }
			// const monoChannelData = audioBuffer.getChannelData(0);
			// if (index == 'y') {
			// 	waveY = monoChannelData.slice()
			// 	mousepad.setWave(index, waveY)
			// }
			// else {
			// 	waveX = monoChannelData.slice();
			// 	mousepad.setWave(index, waveX);
			// }

			// let payload = {
			// 	type: 'set-wave',
			// 	index: index,
			// 	buffer: monoChannelData.buffer
			// };
			// vocoderWorker.postMessage(payload, [payload.buffer]);
		}
		catch (error) {
			uiMessage(`Errore nel caricamento dell'audio: ${error.message}`);
			console.error(error); throw error;
		}
	}



	async function loadPreset(url) {
		let resp = await fetch(url);
		let buf = await resp.arrayBuffer();
		restoreBytes(buf);
	}

	function onMergeModeChange() {
		let mode = $('#merge-mode').val();
		let param = $('#merge-param').val();
		vocoderWorker.postMessage({ type: 'set-status', data: { mergeMode: mode, mergeMix: param } })
	}

	function loadFile(acceptedExtensions = null) {
		return new Promise((resolve, reject) => {
			// crea l'input al volo
			const input = document.createElement("input");
			input.type = "file";
			if (acceptedExtensions)
				input.accept = acceptedExtensions;

			input.style.display = "none";

			document.body.appendChild(input);

			input.addEventListener("change", () => {
				const file = input.files[0];
				if (!file) {
					document.body.removeChild(input);
					return { name: null, content: null }
				}

				const reader = new FileReader();
				reader.onload = e => {
					const arrayBuffer = e.target.result;
					resolve({
						name: file.name,
						content: arrayBuffer
					});
					document.body.removeChild(input);
				};
				reader.onerror = err => {
					reject(err);
					document.body.removeChild(input);
				};

				reader.readAsArrayBuffer(file);
			});

			// apri il file selector
			input.click();
		});
	}

	function initWaveDragAndDrop(index, div) {
		div.on('dragover', e => {
			e.preventDefault();
			div.toggleClass('dragover', true);
			console.log({ dragover: e })
		});

		div.on('dragleave', e => {
			e.preventDefault();
			div.toggleClass('dragover', false);
		});


		div.on('drop', async e => {
			e.preventDefault();
			div.toggleClass('dragover', false);

			const files = e.originalEvent.dataTransfer.files;
			if (files.length > 0) {
				const file = files[0];
				if (!file.type.startsWith("audio/")) {
					alert("Il file non è un audio!");
					return;
				}
				const arrayBuffer = await file.arrayBuffer();
				await setWave(index, arrayBuffer, file.name);
				closeModals();
				//const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
				// // Esempio: aggiungo il file al select come nuova opzione
				// const option = document.createElement('option');
				// option.textContent = file.name;
				// option.value = file.name;
				// select.appendChild(option);
				// select.value = file.name;

				// // Puoi anche leggere il contenuto del file
				// const reader = new FileReader();
				// reader.onload = () => {
				// 	console.log("Contenuto del file:", reader.result);
				// };
				// reader.readAsText(file);
			}
		})
	}


	function initPresetDragAndDrop(div) {

		div.on('dragover', e => {
			e.preventDefault();
			div.toggleClass('dragover', true);
		});

		div.on('dragleave', e => {
			e.preventDefault();
			div.toggleClass('dragover', false);
		});


		div.on('drop', async e => {
			e.preventDefault();
			div.toggleClass('dragover', false);

			const files = e.originalEvent.dataTransfer.files;
			if (files.length > 0) {
				const file = files[0];

				const arrayBuffer = await file.arrayBuffer();
				restoreBytes(arrayBuffer);
			}
			closeModals();
		})

	}


	async function restoreBytes(arrayBuffer) {
		const jsonBytes = new Uint8Array(arrayBuffer);

		for (let i = 0; i < fileMagic.length; i++) {
			if (jsonBytes[i] != fileMagic.charCodeAt(i)) {
				alert('File non valido');
				return;
			}
		}
		let jsonText = '', terminatorFound = false;
		let offset = fileMagic.length;
		for (; offset < jsonBytes.length; offset++) {
			jsonText += String.fromCharCode(jsonBytes[offset]);
			if (jsonText.endsWith(jsonTerminator)) {
				terminatorFound = true;
				offset++;
				break;
			}
		}
		jsonText = jsonText.substring(0, jsonText.length - jsonTerminator.length);
		let json = JSON.parse(jsonText);
		console.log(json);

		let xsize = json.xlength * Float32Array.BYTES_PER_ELEMENT;
		const xBuffer = arrayBuffer.slice(offset, offset + xsize);
		waveX = new Float32Array(xBuffer);
		offset += xsize;

		let ysize = json.ylength * Float32Array.BYTES_PER_ELEMENT;
		const yBuffer = arrayBuffer.slice(offset, offset + ysize);
		waveY = new Float32Array(yBuffer);
		restoreData(json);

	}

	function restoreData(obj) {
		mousepad.setWave('x', waveX);
		$('.wx .wavename').val(obj.xname);
		mousepad.setWave('y', waveY);
		$('.wy .wavename').val(obj.yname);

		let xpayload = {
			type: 'set-wave',
			index: 'x',
			buffer: waveX.buffer
		};
		vocoderWorker.postMessage(xpayload);

		let ypayload = {
			type: 'set-wave',
			index: 'y',
			buffer: waveY.buffer
		};
		vocoderWorker.postMessage(ypayload);

		$('#slider-amp').val(obj.amp).trigger('input');
		$('#slider-reverb').val(obj.reverb).trigger('input');
		$('#merge-mode').val(obj.mergeMode).trigger('input');
		$('#merge-param').val(obj.mergeParam).trigger('input');
		$('#reverb-type').val(obj.reverbType).trigger('change');
		$('#traction').val(obj.osc.traction);
		$('#luminosity').val(obj.pad.lum);
		$('#contrast').val(obj.pad.contrast);

		$('[par="lfofreq"]').val(obj.osc.lfofreq);
		$('[par="lfoxamp"]').val(obj.osc.lfoxamp);
		$('[par="lfoyamp"]').val(obj.osc.lfoyamp);
		$('[par="lfodeltaph"]').val(obj.osc.lfodeltaph);
		$('[par="lfodeltaph"]').val(obj.osc.lfodeltaph);
		$('[par="lfowave"]').val(obj.osc.lfowave);
		$('[par="lforatio"]').val(obj.osc.lforatio);
		$('[par="steps"]').val(obj.osc.steps);

		if (obj.pad) {
			mousepad.setStatus(obj.pad);
		}
		if (obj.osc) {
			Object.assign(oscInStatus, obj.osc);
			vocoderWorker.postMessage({ type: 'set-status', data: oscInStatus });
		}
		mousepad.redraw();

	}

	const fileMagic = '%S25P';

	function savePreset() {
		const now = new Date();
		const pad = (num) => String(num).padStart(2, '0');
		const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
		let fileName = `preset_${timestamp}`;
		fileName = prompt('preset name?', fileName);
		if (!fileName)
			return;

		let bytes = saveBytes();
		const fileBlob = new Blob(
			[bytes],
			{ type: 'application/s25' }
		);

		const link = document.createElement('a');
		link.href = URL.createObjectURL(fileBlob);
		link.download = fileName + '.s25';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(link.href);
	}

	function saveBytes() {
		let wx = waveX || new Float32Array(0);
		let wy = waveY || new Float32Array(0);

		let d = {
			amp: $('#slider-amp').val(),
			reverb: $('#slider-reverb').val(),
			mergeMode: $('#merge-mode').val(),
			mergeParam: $('#merge-param').val(),
			reverbType: $('#reverb-type').val()
		}
		Object.assign(d, {
			xlength: wx.length,
			xname: $('.wx input').val(),
			ylength: wy.length,
			yname: $('.wy input').val(),
		});
		d.pad = mousepad.getStatus();
		d.osc = oscInStatus;
		let txt = fileMagic + '\n' + JSON.stringify(d, null, 2) + '\n' + jsonTerminator;
		return concatenateBytes(txt, wx, wy);
	}

	function concatenateBytes(text, wx, wy) {
		const encoder = new TextEncoder();
		const textBytes = encoder.encode(text);
		const totalLength = textBytes.length + wx.byteLength + wy.byteLength;

		const resultBuffer = new ArrayBuffer(totalLength);
		const resultView = new Uint8Array(resultBuffer);
		let offset = 0;

		resultView.set(textBytes, offset);
		offset += textBytes.length;
		resultView.set(new Uint8Array(wx.buffer), offset);
		offset += wx.byteLength;
		resultView.set(new Uint8Array(wy.buffer), offset);
		return resultBuffer;
	}

	// modal
	function openModal(div, captionText = "Confermi?", btnOkText = "OK", btnCancelText = "Cancel") {
		return new Promise((resolve) => {
			const overlay = $('<div class="modal-overlay"></div>');
			const modal = $('<div class="modal-window"></div>').appendTo(overlay);
			const caption = $('<div class="modal-caption"></div>').text(captionText).appendTo(modal);
			const content = div.addClass('detachable').appendTo(modal);
			const buttons = $('<div class="modal-buttons"></div>').appendTo(modal);

			if (btnOkText) {
				const btnOk = $('<button>' + btnOkText + '</button>').appendTo(buttons);
				btnOk.on("click", () => {
					closeModals();
					resolve(true);
				});
			}
			if (btnCancelText) {
				const btnCancel = $('<button>' + btnCancelText + '</button>').appendTo(buttons);
				btnCancel.on("click", () => {
					closeModals();
					resolve(false);
				});
			}

			$('body').append(overlay);
		});
	}

	function closeModals() {
		$('.modal-overlay .detachable').detach();
		$('.modal-overlay').remove();
	}



	function initKeys() {
		let cnt = 0;
		$(document).on('keydown', evt => {
			// console.log({ evt: evt.key, c: cnt++ });
			let c = (evt.key || '').toLowerCase();
			if (('pdmes').indexOf(c) >= 0)
				evt.preventDefault();

			if (c == 'p') togglePause();
			//if (c == 'a') mousepad.setMode('amp');
			if (c == 'd') mousepad.setMode('drag');
			if (c == 's') mousepad.setMode('settings');
			if (c == 'e') mousepad.setMode('effects');
			if (c == 'm') mousepad.setMode('motion');
		});
	}
	$(() => init());

	window.setpar = function (data) {
		vocoderWorker.postMessage({ type: 'set-status', data })
	}


	window.vel = function (speedx, speedy) {
		setpar({ speedx, speedy });
	}



	$(document).ready(function () {
		$("#dropdownBtn").on("click", function (e) {
			e.stopPropagation(); // evita la propagazione del click
			$("#dropdownMenu").toggleClass("hidden");
		});

		// Chiudi il menu se clicchi fuori
		$(document).on("click", function () {
			$("#dropdownMenu").addClass("hidden");
		});
	});
});