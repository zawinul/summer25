//"use strict";

const fftSize = 1024 * 4;
const overlap = 4;

let audioContext;
let vocoderWorker;
let waveX, waveY;
let waveXname, waveYname;
let oscInStatus = {};
let oscOutStatus = {};
let loadPresetDiv, loadXWaveDiv, loadYWaveDiv;
let vocoderOscillatorNode;
let reverbSendNode;
let reverbNode;
let presetName;
let isSuspended = true;
let demoWaves;
let mergeMode = 'mix';

const blue = '#007bff', lightGray = '#c0c0c0';
const wavePrefix = 'waves/';

const wlabel = x => x ? x.replace(/_/g, ' ').replace(/-/g, ' ') : ''
//const $par = parameterName => $('[par="'+parameterName+'"]');
function $par(parameterNames, container) {
	let expList = parameterNames.split(',').map(x => `[par="${x.trim()}"]`);
	return $(expList.join(','), container);
}

function $parval(name, container) {
	let ctrl = $(`[par="${name}"]`, container);
	let v = ctrl.val();
	if (ctrl.attr('isString') === undefined)
		return v - 0;
	else
		return v;
}

function log() {
	let pars = ['main'];
	for (let i = 0; i < arguments.length; i++) {
		pars.push(arguments[i]);
	}
	console.log(...pars);
}

// Funzioni per mostrare e nascondere lo spinner
function spinnerOn() {
	$('#spinner-overlay').show();
}

function spinnerOff() {
	$('#spinner-overlay').hide();
}

$(function () {
	let oscCreated = Promise.withResolvers();
	let oscInitialized = Promise.withResolvers();
	let workerCreated = Promise.withResolvers();
	let workerInitialized = Promise.withResolvers();


	let amplitudeNode;
	let mainOutputNode;


	const jsonTerminator = '###\n'

	async function init() {

		demoWaves = await fetch('waves/demoWaves.json').then(r => r.json())
		await initUI();
		//initWaveSelector();
		mousepad.init();
		await initAudio();
		onMergeModeChange();
		mousepad.updateEffectsParams();
		mousepad.updateMotionParams();
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


		// $('#slider-reverb').on('input', function () {
		// 	const value = parseFloat($(this).val());
		// 	if (reverbSendNode) {
		// 		let gain = value < -95.9 ? 0 : dbToAmplitude(value);
		// 		reverbSendNode.gain.setTargetAtTime(gain, audioContext.currentTime, 0.01);
		// 	}
		// 	$('#reverb-value').text(value.toFixed(0) + ' dB');
		// });


		// $('.wavename').on('change', function (evt) {
		// 	let url = $(this).val();
		// 	let index = $(this).attr('data-index');
		// 	loadAudio(url, index);
		// });
		$par("merge-mode,merge-mix,contourResolution").on('change', onMergeModeChange);
		$par("merge-mix,contourResolution").on('input', onMergeModeChange);

		loadPresetDiv = $('#modal-load-preset').detach();
		$('#save-preset').on('click', function (evt) {
			evt.stopPropagation();
			evt.preventDefault();
			savePreset();
			return false;
		});
		$('#load-preset').on('click', evt => openModal(loadPresetDiv, "Load a preset", null, "Close"));
		$('#load-preset-button', loadPresetDiv).on('click', async function (evt) {
			let { name, content } = await loadFile("s25");
			if (name != null) {
				let ok = restoreBytes(content);
				if (ok) {
					presetName = getFileName(name);
					$('#preset-area .name').text(presetName);
				}
				mousepad.setMode('drag', true);
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
		for (let index in wmodals) {
			let c = wmodals[index];
			let wContainer = $('#select-wave', c);
			for (let p of demoWaves) {
				let { file, name } = p;
				$(`<option value="${file}">${name}</option>`).appendTo(wContainer);
			}
			wContainer.val(null).on('change', async function () {
				let file = $(this).val();
				if (file) {
					let url = file.replace('./', wavePrefix);
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

		let wx = loadXWaveDiv.add('#top-drop-bar,.file-input.wx');
		initDragAndDrop(wx, onDropFile, onDropFileContent, 'wavex');

		let wy = loadYWaveDiv.add('#left-drop-bar,.file-input.wy');
		initDragAndDrop(wy, onDropFile, onDropFileContent, 'wavey');

		// initWaveDragAndDrop('x', $('.load-wave-drag-area', loadXWaveDiv));
		// initWaveDragAndDrop('y', $('.load-wave-drag-area', loadYWaveDiv));
		// initWaveDragAndDrop('x', $('#top-drop-bar'));
		// initWaveDragAndDrop('y', $('#left-drop-bar'));

		let p = loadPresetDiv.add('#preset-area');
		//initPresetDragAndDrop(p);
		initDragAndDrop(p, onDropFile, onDropFileContent, 'preset');

		let mmsel = $par("merge-mode");
		for (let mm of mergeModes) {
			let [value,label,tx,ty,tm] = mm;
			$(`<option value="${value}">${label}</option>`).appendTo(mmsel);
		}

		//$('.help-on-line .content').load('help-ita.html')
		$('.help-on-line .content').load('help-eng.html')
	}

	function onDropFile(file, params) {
		if (params == 'wavex' || params == 'wavey') {
			if (!file.type.startsWith("audio/")) {
				alert("Il file non è un audio!");
				return false;
			}
		}
		spinnerOn();
	}

	function getFileName(path) {
		try {
			let p = path.split('/');
			p = p[p.length - 1];
			p = p.split('\\');
			p = p[p.length - 1];
			p = p.split('.');
			p = p.slice(0, p.length - 1).join('.');
			return p;
		}
		catch (e) {
			console.log(e);
			return '';
		}
	}

	async function onDropFileContent(file, bytes, params) {
		closeModals();
		spinnerOn();
		if (params == 'wavex') {
			await setWave('x', bytes, getFileName(file.name));
		}
		if (params == 'wavey') {
			spinnerOn();
			await setWave('y', bytes, getFileName(file.name));
		}
		if (params == 'preset') {
			let ok = restoreBytes(bytes);
			if (ok) {
				presetName = getFileName(file.name);
				$('#preset-area .name').text(presetName);
				mousepad.setMode('drag', true);
			}
		}
		spinnerOff();
	}
	async function loadWave(index, url) {
		try {
			spinnerOn();
			let resp = await fetch(url);
			let buf = await resp.arrayBuffer();
			await setWave(index, buf, getFileName(url));
		} finally {
			spinnerOff();
		}
	}

	function uiMessage(msg) {
		if (uiMessage.timeout)
			clearTimeout(uiMessage.timeout);
		uiMessage.timeout = setTimeout(() => {
			$('#status').text('');
		}, 2000);
		$('#status').text(msg);
	}

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
			mousepad.updateMotionUI();


			await initVocoderWorker();
			await initVocoderOscillator();

			// Ampli
			amplitudeNode = audioContext.createGain();
			amplitudeNode.gain.value = 1;

			// Reverb
			reverbNode = audioContext.createConvolver();

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
			//$('.wavename').trigger('change');

		}
		catch (e) {
			log(e);
			uiMessage('Errore: ' + e);
			alert('Errore: ' + e);
		}
	}

	// async function updateReverbIr() {
	// 	let name = $('#reverb-type').val();
	// 	let url = 'ir/Samplicity - Bricasti IRs version 2023-10, left-right files, 44.1 Khz/' + name + '.wav';
	// 	const response = await fetch(url);
	// 	const arrayBuffer = await response.arrayBuffer();
	// 	reverbNode.buffer = await audioContext.decodeAudioData(arrayBuffer);
	// }

	function togglePause() {
		if (isSuspended) {
			audioContext.resume();
			$('#btn-pause-text').text('pause');
			isSuspended = false;
			sendAllParameters();

		}
		else {
			audioContext.suspend();
			$('#btn-pause-text').text('play');
			isSuspended = true;
		}
	}

	function sendAllParameters() {
		onMergeModeChange();
		mousepad.setMode('drag');
		mousepad.updateEffectsParams();
		mousepad.updateMotionParams();
		mousepad.updateMotionUI();
		mousepad.forcePosition();

	}
	window.sendAllParameters = sendAllParameters;
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

	let drawMeterMax = 0;
	function drawMeters(data) {
		drawMeterMax = Math.max(data.max,drawMeterMax*.999, .0001);
		let drawColor = data.cx ? '#c0c0c0': '#007bff';
		let mode = $par("merge-mode").val();
		let entry = mergeModes.find(x=>x[0]==mode);
		let [value,label,tx,ty,tm] = entry;

		if (mode=='xcy') {
			drawMeter($('.meter .cx')[0], data.x, tx, blue);
			drawMeter($('.meter .cy')[0], data.y, ty, lightGray);
			drawMeter($('.meter .cxy')[0], data.m, tm, blue);
			//drawCountour($('.meter .cx')[0], data.cx, '#007bff');
			drawCountour($('.meter .cy')[0], data.cy, blue);
			//drawCountour($('.meter .cxy')[0], data.cm, '#007bff');
		}
		else if (mode=='cxy') {
			drawMeter($('.meter .cx')[0], data.x, tx, lightGray);
			drawMeter($('.meter .cy')[0], data.y, ty, blue);
			drawMeter($('.meter .cxy')[0], data.m, tm, blue);
			drawCountour($('.meter .cx')[0], data.cx, blue);
			//drawCountour($('.meter .cy')[0], data.cy, '#007bff');
			//drawCountour($('.meter .cxy')[0], data.cm, '#007bff');			
		}
		else {
			drawMeter($('.meter .cx')[0], data.x, tx, blue);
			drawMeter($('.meter .cy')[0], data.y, ty, blue);
			drawMeter($('.meter .cxy')[0], data.m, tm, blue);
			// drawCountour($('.meter .cx')[0], data.cx, '#007bff');
			// drawCountour($('.meter .cy')[0], data.cy, '#007bff');
			// drawCountour($('.meter .cxy')[0], data.cm, '#007bff');
		}
	}

	const toDB = x=> 20 * Math.log10(x);
	const MINDB = -30
	;
	function drawMeter(canvas, data, title, color) {

		let w = canvas.width, h = canvas.height;
		let ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, w, h);
		ctx.strokeStyle = color;
		ctx.fillStyle = color;

		ctx.font = "20px Arial";
		ctx.textAlign = "right";  // allinea a destra rispetto alla x data
		ctx.textBaseline = "top"; // il punto di riferimento verticale è il top del testo

		ctx.strokeStyle = blue;
		ctx.fillStyle = blue;
		ctx.fillText(title, w - 5, 5);

		ctx.strokeStyle = color;
		ctx.fillStyle = color;

		//max = 256;
		const gmax = 0;
		const gmin = MINDB;
		for (let i = 0; i < data.length; i++) {
			let ynorm = toDB(data[i]/drawMeterMax);
			let ypos = (1-(ynorm-gmin)/(gmax-gmin)) * h;
			ctx.beginPath();
			ctx.moveTo(i, h);
			ctx.lineTo(i, ypos);
			ctx.stroke();
		}
	}

	function drawCountour(canvas, data, color) {
		if(!data)
			return;
		let w = canvas.width, h = canvas.height;
		let ctx = canvas.getContext('2d');
		ctx.strokeStyle = color;
		ctx.fillStyle   = color;
		//max = 256;
		const gmax = 0;
		const gmin = MINDB;
		ctx.beginPath();
		for (let i = 0; i < data.length; i++) {
			let ynorm = toDB(data[i]/drawMeterMax);
			let ypos = (1-(ynorm-gmin)/(gmax-gmin)) * h;
			if (i==0)
				ctx.moveTo(i, ypos);
			else
				ctx.lineTo(i, ypos);
		}
		ctx.stroke();

	}
	// async function initWaveSelector() {
	// 	let selectors = [$('.wavename.wx'), $('.wavename.wy')];
	// 	for (let sel of selectors) {
	// 		sel.empty();
	// 		sel.append(`<option value="">none</option>`);
	// 		for (let w of demoWaves) {
	// 			let [pref, name, url] = w;
	// 			if (name.endsWith('.wav') || name.endsWith('.flac'))
	// 				sel.append(`<option value="${url}">${pref} ${name}</option>`);
	// 		}
	// 	}
	// }

	function randomWave(index) {
		let w = demoWaves[Math.floor(Math.random() * demoWaves.length)];
		let { file, name } = w;
		let url = file.replace('./', wavePrefix);
		loadWave(index, url);
	}

	async function setWave(index, arrayBuffer, name) {
		if (index == 'y')
			waveYname = name;
		else
			waveXname = name;
		let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
		if (audioBuffer.numberOfChannels > 1) {
			console.warn("L'audio non è mono. Si utilizza solo il primo canale.");
		}
		const monoChannelData = audioBuffer.getChannelData(0);
		if (index == 'y') {
			waveY = monoChannelData.slice()
			mousepad.setWave(index, waveY);
			$(`.wy .name`).text(wlabel(name));
		}
		else {
			waveX = monoChannelData.slice();
			mousepad.setWave(index, waveX);
			$(`.wx .name`).text(wlabel(name));
		}

		let payload = {
			type: 'set-wave',
			index: index,
			buffer: monoChannelData.buffer
		};
		vocoderWorker.postMessage(payload, [payload.buffer]);

	}

	// async function loadAudio(url, index) {
	// 	if (!audioContext) return;
	// 	if (!url || url == '') return;
	// 	uiMessage('Caricamento audio ' + index.toUpperCase() + ' in corso...');
	// 	try {
	// 		let lib = 'the-libre-sample-pack/master'
	// 		let p = url.indexOf(lib);
	// 		if (p >= 0) {
	// 			let old = url;
	// 			url = 'wav/the-libre-sample-pack' + old.substring(p + lib.length);
	// 			console.log(`url changed from "${old}" to "${url}"`)
	// 		}
	// 		const response = await fetch(url);
	// 		if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
	// 		const arrayBuffer = await response.arrayBuffer();
	// 		await setWave(index, arrayBuffer, url);
	// 		// let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
	// 		// if (audioBuffer.numberOfChannels > 1) {
	// 		// 	console.warn("L'audio non è mono. Si utilizza solo il primo canale.");
	// 		// }
	// 		// const monoChannelData = audioBuffer.getChannelData(0);
	// 		// if (index == 'y') {
	// 		// 	waveY = monoChannelData.slice()
	// 		// 	mousepad.setWave(index, waveY)
	// 		// }
	// 		// else {
	// 		// 	waveX = monoChannelData.slice();
	// 		// 	mousepad.setWave(index, waveX);
	// 		// }

	// 		// let payload = {
	// 		// 	type: 'set-wave',
	// 		// 	index: index,
	// 		// 	buffer: monoChannelData.buffer
	// 		// };
	// 		// vocoderWorker.postMessage(payload, [payload.buffer]);
	// 	}
	// 	catch (error) {
	// 		uiMessage(`Errore nel caricamento dell'audio: ${error.message}`);
	// 		console.error(error); throw error;
	// 	}
	// }

	async function loadPreset(url) {
		spinnerOn();
		try {
			let resp = await fetch(url);
			let buf = await resp.arrayBuffer();
			let ok = restoreBytes(buf);
			if (ok) {
				presetName = getFileName(url);
				$('#preset-area .name').text(presetName);
				mousepad.setMode('drag');
			}
		} finally {
			spinnerOff();
		}
	}

	function onMergeModeChange() {
		mergeMode = $par("merge-mode").val();
		let mergeMix = $par("merge-mix").val();
		let contourResolution = $par("contourResolution").val();
		vocoderWorker.postMessage({ type: 'set-status', data: { mergeMode, mergeMix, contourResolution } });
		if (mergeMode=='xcy' || mergeMode=='cxy')
			$('.control-group.res-group').show();
		else
			$('.control-group.res-group').hide();
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

				spinnerOn();
				const reader = new FileReader();
				reader.onload = e => {
					const arrayBuffer = e.target.result;
					spinnerOff();
					resolve({
						name: file.name,
						content: arrayBuffer
					});
					document.body.removeChild(input);
				};
				reader.onerror = err => {
					spinnerOff();
					reject(err);
					document.body.removeChild(input);
				};

				reader.readAsArrayBuffer(file);
			});

			// apri il file selector
			input.click();
		});
	}

	function initDragAndDrop(div, onFile, onFileContent, params) {
		div.addClass('_drag_initialized_');
		div.on('dragover', e => {
			e.preventDefault();
			let container = $(e.target).closest('.draggable');
			container.toggleClass('dragover', true);
			//console.log({ dragover: e })
		});

		div.on('dragleave', e => {
			e.preventDefault();
			let container = $(e.target).closest('.draggable');
			container.toggleClass('dragover', false);
		});

		div.on('drop', async e => {
			e.preventDefault();
			let container = $(e.target).closest('.draggable');
			container.toggleClass('dragover', false);
			div.toggleClass('dragover', false);

			const files = e.originalEvent.dataTransfer.files;
			if (files.length > 0) {
				const file = files[0];
				if (onFile) {
					let ret = onFile(file, params);
					if (ret === false)
						return;
				}
				const arrayBuffer = await file.arrayBuffer();
				if (onFileContent) {
					let ret = onFileContent(file, arrayBuffer, params);
					if (ret === false)
						return;
				}
			}
		})
	}


	async function restoreBytes(arrayBuffer) {
		const jsonBytes = new Uint8Array(arrayBuffer);

		for (let i = 0; i < fileMagic.length; i++) {
			if (jsonBytes[i] != fileMagic.charCodeAt(i)) {
				alert('File non valido');
				return false;
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
		setTimeout(sendAllParameters, 1);

		return true;

	}

	function restoreData(obj) {
		if (obj.version && obj.version == 2)
			return restoreDataV2(obj);

		mousepad.setWave('x', waveX, obj.xname);
		$('.xwavename').text(wlabel(obj.xname));
		mousepad.setWave('y', waveY, obj.yname);
		$('.ywavename').text(wlabel(obj.yname));

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
		$par("merge-mode").val(obj.mergeMode).trigger('input');
		$par("merge-mix").val(obj.mergeParam).trigger('input');

		if (obj.motion) {
			for (let par in obj.motion) {
				if (obj.motion[par] !== null) {
					$par(par).val(obj.motion[par]);
				}
			}
		}
		if (obj.effect) {
			for (let par in obj.effect) {
				if (obj.effect[par] !== null) {
					if (par == 'delayMode') {
						$(`[name="delay-mode"]`).prop('checked', false);
						$(`[name="delay-mode"][value="${obj.effect[par]}"]`).prop('checked', true);
					} else {
						$par(par).val(obj.effect[par]);
					}
				}
			}
		}
		if (obj.pad) {
			mousepad.setStatus(obj.pad);
		}
		if (obj.osc) {
			Object.assign(oscInStatus, obj.osc);
			vocoderWorker.postMessage({ type: 'set-status', data: oscInStatus });
		}
		mousepad.redraw();
		setTimeout(() => function () {
			$('[par]').trigger('change');
		});

	}

	function restoreDataV2(obj) {
		mousepad.setWave('x', waveX, obj.xname);
		$('.xwavename').text(wlabel(obj.xname));
		mousepad.setWave('y', waveY, obj.yname);
		$('.ywavename').text(wlabel(obj.yname));

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

		let params = $('[par]').toArray();
		for (let ctrl of params) {
			let paramName = $(ctrl).attr('par');
			let v = obj.par[paramName];
			if (v === undefined)
				console.log(`nel file manca il parametro "${paramName}"`)
			else
				$(ctrl).val('' + v);
		}
		mousepad.redraw();
		setTimeout(() => function () {
			$('[par]').trigger('change');
			mousepad.forcePosition();
		}, 1);

	}

	const fileMagic = '%S25P';

	function savePreset() {
		let fileName = presetName;
		if (!fileName) {
			const now = new Date();
			const pad = (num) => String(num).padStart(2, '0');
			// const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
			const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
			fileName = `preset_${timestamp}`;
		}
		// fileName = prompt('preset name?', fileName);
		// if (!fileName)
		// 	return;

		let bytes = saveBytes();
		const fileBlob = new Blob(
			[bytes],
			{ type: 'application/s25' }
		);

		let dataURL = URL.createObjectURL(fileBlob);
		const link = document.createElement('a');
		link.href = dataURL;
		link.target = "anotherWin";
		link.download = fileName + '.s25';
		document.body.appendChild(link);
		link.addEventListener('click', (e) => {
			e.stopPropagation();
		}, { once: true });
		// setTimeout(()=>{
		// 	URL.revokeObjectURL(dataURL);
		// 	document.body.removeChild(link);
		// },10000)
		link.click();
	}

	function saveBytes() {
		let wx = waveX || new Float32Array(0);
		let wy = waveY || new Float32Array(0);
		let xname = $('.xwavename').text();
		let yname = $('.ywavename').text();

		let d = {
			version: 2,
			xlength: wx.length,
			xname,
			ylength: wy.length,
			yname,
			par: {}
		}

		// Object.assign(d, {
		// 	xlength: wx.length,
		// 	xname,
		// 	ylength: wy.length,
		// 	yname
		// });
		$('[par]').toArray().forEach(function (p) {
			p = $(p);
			let par = p.attr('par');
			let val = p.val();
			if (p.attr('isString') !== undefined)
				d.par[par] = val;
			else
				d.par[par] = val - 0;
		})
		// let padStatus = mousepad.getStatus();
		// d.par.targetx = padStatus.mx;
		// d.par.targety = padStatus.my;
		// d.motion = {
		// 	speedx: $('[par="speedx"]').val() - 0,
		// 	speedy: $('[par="speedy"]').val() - 0,
		// 	traction: $('[par="traction"]').val() - 0,
		// 	targetx: padStatus.mx,
		// 	targety: padStatus.my,
		// 	lfofreq: $('[par="lfofreq"]').val() - 0,
		// 	lfoxamp: $('[par="lfoxamp"]').val() - 0,
		// 	lfoyamp: $('[par="lfoyamp"]').val() - 0,
		// 	lfodeltaph: $('[par="lfodeltaph"]').val() - 0,
		// 	lfowave: $('[par="lfowave"]').val() - 0,
		// 	lforatio: $('[par="lforatio"]').val() - 0,
		// 	steps: $('[par="steps"]').val() - 0,
		// 	speedmultx: $('[par="speedmultx"]').val() - 0,
		// 	speedmulty: $('[par="speedmulty"]').val() - 0,
		// }
		// d.effect = {
		// 	reverb: $('[par="revsend"]').val() - 0,
		// 	revtype: $('[par="revtype"]').val() - 0,
		// 	delayMode: $('[name="delay-mode"]:checked').val() - 0,
		// 	ldelay: $('[par="ldelay"]').val() - 0,
		// 	rdelay: $('[par="rdelay"]').val() - 0,
		// 	feedback: $('[par="feedback"]').val() - 0,
		// 	lopass: $('[par="lopass"]').val() - 0,
		// 	delmix: $('[par="delmix"]').val() - 0,
		// }
		//d.pad = mousepad.getStatus();
		//d.osc = oscInStatus;
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
			console.log(`key: [${c}]`)
			if (('[p][d][m][e][s][x][y][#][f1][tab]').indexOf(c) >= 0)
				evt.preventDefault();

			if (c == 'p' || c == ' ') togglePause();
			if (c == 'd') mousepad.setMode('drag');
			// if (c == 's') mousepad.setMode('settings');
			if (c == 'e') mousepad.setMode('effects');
			if (c == 'm') mousepad.setMode('motion');
			if (c == 'f1') mousepad.setMode('help');
			if (c == 'x' && evt.altKey) randomWave('x');
			if (c == 'y' && evt.altKey) randomWave('y');
			if (c=='tab') {
				const nextmode = { drag:'motion', motion:'effects', effects:'help', help: 'drag' };
				mousepad.setMode(nextmode[mousepad.getMode()]);
			}
		});
	}
	$(() => init());

	window.setpar = function (data) {
		vocoderWorker.postMessage({ type: 'set-status', data })
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