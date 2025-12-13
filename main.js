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
let presetName;
let isSuspended = true;
let demoWaves;
let mergeMode = 'mix';
// let fullscreen = false;
let player = false;
let vertical = window.innerHeight > window.innerWidth;
let presetListPage = false;
let recorder;
let reverb;
let spectralData;

const blue = '#007bff', lightGray = '#c0c0c0', darkGray = '#606060';
const wavePrefix = 'waves/';

let voc_requested = 0;
let voc_received = 0;

const wlabel = x => x ? x.replace(/_/g, ' ').replace(/-/g, ' ') : ''
//const $par = parameterName => $('[par="'+parameterName+'"]');
function $par(parameterNames, container) {
	let expList = parameterNames.split(',').map(x => `[par="${x.trim()}"]`);
	return $(expList.join(','), container);
}

function $parval(name, container) {
	let ctrl = $(`[par="${name}"]`, container);
	let v = ctrl.val();
	if (ctrl.attr('isString') !== undefined)
		return v;
	if (ctrl.attr('isBoolean') !== undefined)
		return (v == '1' || v == 'true');

	// is Number
	return v - 0;
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

// function setFullscreen(value) {
// 	fullscreen = value;
// 	// if (fullscreen)
// 	// 	document.documentElement.requestFullscreen();
// 	// else
// 	// 	document.exitFullscreen();
// 	$('body').toggleClass('fullscreen', value);
// 	setTimeout(() => mousepad.setFullscreen(value), 10);
// }

function getUrlParams() {
	let p = {}
	let urlParams = new URLSearchParams(window.location.search);
	for (let param of urlParams.entries()) {
		p[param[0]] = param[1];
	}
	return p;
}
const urlParams = getUrlParams();

(function () {
	let oscCreated = Promise.withResolvers();
	let oscInitialized = Promise.withResolvers();
	let workerCreated = Promise.withResolvers();
	let workerInitialized = Promise.withResolvers();


	let masterGainNode;


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
		// $('.btn-fullscreen.fs-open').on('click', () => setFullscreen(true));
		// $('.btn-fullscreen.fs-close').on('click', () => setFullscreen(false));

		initKeys();
		animate.init();
	}

	async function initUI() {
		$('#btn-pause').on('click', togglePause);
		$par('amp').on('input', function () {
			const value = parseFloat($(this).val());
			let amp = dbToAmplitude(value);
			//vocoderWorker.postMessage({ type: 'set-status', data: { scale: amp } });
			masterGainNode.gain.setTargetAtTime(amp, audioContext.currentTime, 0.01);
			$('#amp-value').text(value.toFixed(1) + ' dB');
		});



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
			let [value, label, tx, ty, tm] = mm;
			$(`<option value="${value}">${label}</option>`).appendTo(mmsel);
		}

		let content = $('.help-on-line .content');
		$.get("help/help-ita.html", function (data) {
			content.append(data);
		});
		$.get("help/help-eng.html", function (data) {
			content.append(data);
		});
		// content.load('help/help-ita.html');
		// content.load('help/help-eng.html');
		content.on('click', '.switch img', function () {
			let lang = $(this).attr('lang');
			content.attr('lang', lang);
		});
		if (urlParams.player != undefined) {
			$('body').addClass('player');
			player = true;
		}
		onResize();
		if (urlParams.preset) {
			async function f() {
				await new Promise(resolve => setTimeout(resolve, 500));
				await loadPresetByName(urlParams.preset);
				await new Promise(resolve => setTimeout(resolve, 500));
				if (urlParams.autoplay != undefined)
					togglePause();
			};
			f(); // no await
		}
		if (urlParams.presetlist != undefined || (urlParams.player != undefined && urlParams.preset === undefined))
			showPresetList();

		$('#btn-rec').on('click', toggleRecording);

		$('#rec-clear').on('click', function (evt) {
			recorder.clear();
		});
		$('#rec-save').on('click', function (evt) {

		});
		$('#rec-to-x').on('click', function (evt) {
			recorder.setRecording(false);
			$('body').toggleClass('recording', false);
			setWaveFromRecorder('x');
		});
		$('#rec-to-y').on('click', function (evt) {
			recorder.setRecording(false);
			$('body').toggleClass('recording', false);
			setWaveFromRecorder('y');
		});

	}

	function toggleRecording() {
		let on = recorder.isRecording();
		on = !on;
		recorder.setRecording(on)
		$('body').toggleClass('recording', on);
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

	async function initVocoderOscillator() {
		log('in initVocoderOscillator');
		await audioContext.audioWorklet.addModule('vocoder-osc.worklet.js');

		let outputChannelCount = [];
		outputChannelCount[VOCODER_DRY_OUTPUT] = 1;
		outputChannelCount[VOCODER_WET_OUTPUT] = 2;

		vocoderOscillatorNode = new AudioWorkletNode(audioContext, 'phase-vocoder-processor', {
			numberOfInputs: 0,
			numberOfOutputs: 2,
			outputChannelCount
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

			const lib = initCommon(fftSize, overlap, audioContext.sampleRate);
			Object.assign(window, lib);
			mousepad.updateMotionUI();

			reverb = await initReverb(audioContext);

			await initVocoderWorker();
			await initVocoderOscillator();



			// main gain
			masterGainNode = audioContext.createGain();
			masterGainNode.gain.value = 1.0;

			// recorder
			recorder = await initRecorder(audioContext, $('#show-recorder')[0]);

			vocoderOscillatorNode.connect(reverb.inputNode, VOCODER_WET_OUTPUT, 0);
			vocoderOscillatorNode.connect(recorder.node, VOCODER_DRY_OUTPUT, RECORDER_DRY_INPUT);
			reverb.outputNode.connect(masterGainNode);
			masterGainNode.connect(recorder.node, 0, RECORDER_WET_INPUT);
			masterGainNode.connect(audioContext.destination);

		}
		catch (e) {
			log(e);
			alert('Errore: ' + e);
		}
	}

	function togglePause() {
		if (isSuspended) {
			audioContext.resume();
			$('#btn-pause-text').text('pause');
			isSuspended = false;
			sendAllParameters();
			mousepad.forcePosition();

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
			voc_requested++;
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
			voc_received++;
			//console.log(`voc_requested: ${voc_requested}, voc_received: ${voc_received}`)

		}
		if (d.type == 'graph-data') {
			let graphData = d.data;
			//log({graphData});
			window.graphData = graphData;
			drawMeters(graphData);
		}
		if (d.type == 'spectral-data') {
			spectralData = d.data;
			if (Math.random()*1000<1)
				console.log({spectralData});
		}
		if (d.type == 'error') {

		}

	}

	//let drawMeterMax = 0;
	let drawMeterXMax = 0;
	let drawMeterYMax = 0;
	let drawMeterCMax = 0;
	const MAX_DECAY = 1 - .003;

	function drawMeters(data) {
		// if (drawMeterMax == Infinity) // non so perché ma succede
		// 	drawMeterMax = 1;
		// drawMeterMax = Math.max(data.max, drawMeterMax * MAX_DECAY, .0001);

		let x = data.x.reduce((max, x) => Math.max(max, x), 0);
		let y = data.y.reduce((max, y) => Math.max(max, y), 0);
		let c = data.m.reduce((max, m) => Math.max(max, m), 0);
		drawMeterXMax = Math.max(x, drawMeterXMax * MAX_DECAY, .0001);
		drawMeterYMax = Math.max(y, drawMeterYMax * MAX_DECAY, .0001);
		drawMeterCMax = Math.max(c, drawMeterCMax * MAX_DECAY, .0001);
		let drawColor = data.cx ? '#c0c0c0' : '#007bff';
		let mode = $par("merge-mode").val();
		let entry = mergeModes.find(x => x[0] == mode);
		let [value, label, tx, ty, tm] = entry;

		if (mode == 'xcy') {
			drawMeter($('.meter .cx')[0], data.x, tx, blue, drawMeterXMax);
			drawCountour($('.meter .cx')[0], data.cx, darkGray, drawMeterXMax);

			drawMeter($('.meter .cy')[0], data.y, ty, lightGray, drawMeterYMax);
			drawCountour($('.meter .cy')[0], data.cy, blue, drawMeterYMax);

			drawMeter($('.meter .cxy')[0], data.m, tm, lightGray, drawMeterCMax);
			drawCountour($('.meter .cxy')[0], data.cm, blue, drawMeterCMax);
		}
		else if (mode == 'cxy') {
			drawMeter($('.meter .cx')[0], data.x, tx, lightGray, drawMeterXMax);
			drawCountour($('.meter .cx')[0], data.cx, blue, drawMeterXMax);

			drawMeter($('.meter .cy')[0], data.y, ty, blue, drawMeterYMax);
			drawCountour($('.meter .cy')[0], data.cy, darkGray, drawMeterYMax);

			drawMeter($('.meter .cxy')[0], data.m, tm, lightGray, drawMeterCMax);
			drawCountour($('.meter .cxy')[0], data.cm, blue, drawMeterCMax);
			//drawCountour($('.meter .cxy')[0], data.cm, '#007bff');			
		}
		else {
			drawMeter($('.meter .cx')[0], data.x, tx, blue, drawMeterXMax);
			drawMeter($('.meter .cy')[0], data.y, ty, blue, drawMeterYMax);
			drawMeter($('.meter .cxy')[0], data.m, tm, blue, drawMeterCMax);
			// drawCountour($('.meter .cx')[0], data.cx, '#007bff');
			// drawCountour($('.meter .cy')[0], data.cy, '#007bff');
			// drawCountour($('.meter .cxy')[0], data.cm, '#007bff');
			//drawCountour($('.meter .cxy')[0], data.cm, lightGray, drawMeterCMax);
			//drawCountour($('.meter .cxy')[0], data.cm, '#007bff');			
		}
	}

	const toDB = x => 20 * Math.log10(x);
	const MINDB = -12;
	const LOG_Y = false;
	function drawMeter(canvas, data, title, color, max) {
		// if (max===undefined)
		// 	max = drawMeterMax;
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

		if (LOG_Y) {
			const gmax = 0;
			const gmin = MINDB;
			for (let i = 0; i < data.length; i++) {
				let ynorm = toDB(data[i] / max);
				let ypos = (1 - (ynorm - gmin) / (gmax - gmin)) * h;
				ctx.beginPath();
				ctx.moveTo(i, h);
				ctx.lineTo(i, ypos);
				ctx.stroke();
			}
		}
		else {
			for (let i = 0; i < data.length; i++) {
				let ynorm = data[i] / max;
				let ypos = (1 - ynorm) * h;
				ctx.beginPath();
				ctx.moveTo(i, h);
				ctx.lineTo(i, ypos);
				ctx.stroke();
			}

		}
	}

	function drawCountour(canvas, data, color, max) {
		if (!data)
			return;
		let w = canvas.width, h = canvas.height;
		let ctx = canvas.getContext('2d');
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		//max = 256;
		const gmax = 0;
		const gmin = MINDB;
		ctx.beginPath();
		for (let i = 0; i < data.length; i++) {
			let ynorm = toDB(data[i] / max);
			let ypos = (1 - (ynorm - gmin) / (gmax - gmin)) * h;
			if (i == 0)
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

	async function setWaveFromRecorder(index) {
		const data = recorder.getDryRecord();
		if (data.length <= 0)
			return;
		if (index == 'y') {
			waveY = data.slice();
			mousepad.setWave(index, waveY);
		}
		else {
			waveX = data.slice();
			mousepad.setWave(index, waveX);
		}

		let payload = {
			type: 'set-wave',
			index: index,
			buffer: data.buffer
		};
		vocoderWorker.postMessage(payload, [payload.buffer]);

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
	// 		console.error(error); throw error;
	// 	}
	// }

	async function loadPresetByName(name) {
		let presetlist = await fetch('presets/list.json');
		presetlist = await presetlist.json();
		let p = presetlist.find(x => x.name == name);
		if (!p)
			return;
		let url = `presets/${p.file}.s25`
		await loadPreset(url);
	}


	async function showPresetList() {
		presetListPage = true;
		let presetlist = await fetch('presets/list.json');
		presetlist = await presetlist.json();
		let pl = $('.preset-list').show().removeClass('hidden');

		for (let p of presetlist) {
			let li = $('<li></li>').appendTo($('ul', pl));
			let a = $(`<a>${p.name}</a>`).appendTo(li);
			const url = new URL(window.location.href);
			url.searchParams.set('preset', p.name);
			//url.searchParams.set('autoplay', '1');
			url.searchParams.delete('presetlist');
			a.attr('href', url.toString());
		}
		let p = presetlist.find(x => x.name == name);
		if (!p)
			return;
		await loadPreset(url);
	}


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
		if (mergeMode == 'xcy' || mergeMode == 'cxy')
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
		restoreDataV2(json);
		setTimeout(sendAllParameters, 1);
		vocoderWorker.postMessage({ type: 'set-status', data: { clearDelay: true } })

		return true;

	}

	// function restoreData(obj) {
	// 	if (obj.version && obj.version == 2)
	// 		return restoreDataV2(obj);

	// 	mousepad.setWave('x', waveX, obj.xname);
	// 	$('.xwavename').text(wlabel(obj.xname));
	// 	mousepad.setWave('y', waveY, obj.yname);
	// 	$('.ywavename').text(wlabel(obj.yname));

	// 	let xpayload = {
	// 		type: 'set-wave',
	// 		index: 'x',
	// 		buffer: waveX.buffer
	// 	};
	// 	vocoderWorker.postMessage(xpayload);

	// 	let ypayload = {
	// 		type: 'set-wave',
	// 		index: 'y',
	// 		buffer: waveY.buffer
	// 	};
	// 	vocoderWorker.postMessage(ypayload);

	// 	$par('amp').val(obj.amp);
	// 	$par('amp').trigger('input');
	// 	$par("merge-mode").val(obj.mergeMode).trigger('input');
	// 	$par("merge-mix").val(obj.mergeParam).trigger('input');

	// 	if (obj.motion) {
	// 		for (let par in obj.motion) {
	// 			if (obj.motion[par] !== null) {
	// 				$par(par).val(obj.motion[par]);
	// 			}
	// 		}
	// 	}
	// 	if (obj.effect) {
	// 		for (let par in obj.effect) {
	// 			if (obj.effect[par] !== null) {
	// 				if (par == 'delayMode') {
	// 					$(`[name="delay-mode"]`).prop('checked', false);
	// 					$(`[name="delay-mode"][value="${obj.effect[par]}"]`).prop('checked', true);
	// 				} else {
	// 					$par(par).val(obj.effect[par]);
	// 				}
	// 			}
	// 		}
	// 	}
	// 	if (obj.pad) {
	// 		mousepad.setStatus(obj.pad);
	// 	}
	// 	if (obj.osc) {
	// 		Object.assign(oscInStatus, obj.osc);
	// 		vocoderWorker.postMessage({ type: 'set-status', data: oscInStatus });
	// 	}
	// 	mousepad.redraw();
	// 	setTimeout(() => function () {
	// 		$('[par]').trigger('change');
	// 	});

	// }

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
		mousepad.setTarget(obj.par.targetx, obj.par.targety);
		mousepad.redraw();
		setTimeout(function () {
			$('[par]').trigger('input');
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
			let val = $parval(par);
			d.par[par] = val;
		})

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
			console.log({ evt, c: cnt++ });
			let c = (evt.key || '').toLowerCase();
			console.log(`key: [${c}]`, evt.shiftKey)
			if (('[p][d][m][e][s][x][y][#][f1][#][tab]').indexOf(c) >= 0)
				evt.preventDefault();

			if (c == 'x' && evt.altKey) randomWave('x');
			else if (c == '#')
				$('.debug-monitor').toggleClass('hidden');
			else if (c == 'y' && evt.altKey) randomWave('y');
			else if (c == 'x' && evt.shiftKey) openModal(loadXWaveDiv, "Load X wave", null, "Close");
			else if (c == 'y' && evt.shiftKey) openModal(loadYWaveDiv, "Load Y wave", null, "Close");
			else if (c == 'p' && evt.shiftKey) $('#load-preset').trigger('click')

			else if (c == 'p' || c == ' ') togglePause();
			else if (c == 'd') mousepad.setMode('drag');
			// if (c == 's') mousepad.setMode('settings');
			else if (c == 'e') mousepad.setMode('effects');
			else if (c == 'm') mousepad.setMode('motion');
			else if (c == 'f1') mousepad.setMode('help');
			else if (c == 'tab') {
				const nextmode = { drag: 'motion', motion: 'effects', effects: 'help', help: 'drag' };
				mousepad.setMode(nextmode[mousepad.getMode()]);
			}
			else if (c == 's'  && evt.ctrlKey && evt.shiftKey) mousepad.setMode('spectre');
			else if (c == 'r') toggleRecording();
		});
	}


	window.addEventListener("resize", onResize);
	let resizeTimeout = null;

	function onResize() {
		clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(() => {
			vertical = window.innerHeight > window.innerWidth;
			$('body').toggleClass('vertical', vertical);
			// if (vertical && !fullscreen)
			// 	setFullscreen(true);


			// this.setTimeout(function () {
			// 	mousepad.reposition();
			// 	console.log("Resize concluso:", window.innerWidth, "x", window.innerHeight);
			// });

		})
	}

	$(() => init());

})();


window.setpar = function (data) {
	vocoderWorker.postMessage({ type: 'set-status', data })
}


