mousepad = (function () {



	let BANDW = 50;
	let topband, leftband, space;
	let waves = { x: {}, y: {} };
	let xrange, yrange;
	let w;
	let mousex, mousey;
	let dragging = false;
	let canvases = {
		wave: { class: 'wave', zIndex: 100 },
		wavebar: { class: 'wavebar', zIndex: 100 },
		cursor: { class: 'cursor', zIndex: 120 },
		cursorpoint: { class: 'cursorpoint', zIndex: 120 },
		info: { class: 'info', zIndex: 130 },
		spectre: { class: 'spectre', zIndex: 140 }
	};

	const padStatus = {
		mode: 'drag',
		lum: .5,
		cont: 4,
		xrange: [0, 1],
		yrange: [0, 1],
		mousex, mousey,
		mx: 0,
		my: 0,
		speedx: 0,
		speedy: 0,
		amp: 0, //dB
		mix: .5,
	}
	let curOscStatus = {};

	const modes = {
		drag: { bgcolor: '#ffffff', show: '.wave, .wavebar, .cursor, .cursorpoint' },
		help: { bgcolor: '#fffff0', show: '.wave, .wavebar, .cursor, .cursorpoint, .help-on-line' },
		motion: { bgcolor: '#fff0f0', show: '.wave, .wavebar, .cursor, .cursorpoint, .motion-controls' },
		motion_temp: { bgcolor: '#fff0f0', show: '.wave, .wavebar, .cursor, .cursorpoint, .motion-controls' },
		effects: { bgcolor: '#fff0f0', show: '.wave, .wavebar, .cursor, .cursorpoint, .effects-controls' },
		effects_temp: { bgcolor: '#fff0f0', show: '.wave, .wavebar, .cursor, .cursorpoint, .effects-controls' },
		spectre: { bgcolor: '#fff0f0', show: '.spectre' },
		// settings: { bgcolor: '#ffffff', show: '.wave, .wavebar, .settings-controls' }
	};

	let mode = null;
	let dragInfo =
		`- click and drag to move the cursor
	- ctrl+click to move cursor instantly
	- hold <shift> to set motion parameters`;
	let showInfoCount = 0;
	function setMode(_mode) {
		if (!_mode)
			return;

		if (_mode == 'drag' && !isSuspended && !player) {
			if (showInfoCount++ < 5)
				showInfo(dragInfo, true);
		}
		else
			clearInfo();

		if (mode == _mode)
			return;

		mode = curstatus.mode = _mode;
		$('body').attr('mode', mode);

		let m2 = mode.replace('_temp', '');
		console.log('m2=' + m2);
		$('.padmode').removeClass('on');
		$('.padmode[data-mode="' + m2 + '"]').addClass('on');
		if (!modes[mode])
			return;
		padStatus.mode = mode;
		curstatus.mode = mode;
		$('.hideable').not(modes[mode].show).toggleClass('hidden', true);
		$('.hideable').filter(modes[mode].show).toggleClass('hidden', false);

		// if (mode == 'motion') {
		// 	designLinShape();
		// 	designLFOShape();
		// }

		if (mode=='spectre')
			spectreCanvas();
		checkStatusChange();
	}

	let curstatus = {
		x: 0,
		y: 0,
		left: false,
		right: false,
		center: false,
		where: 'out',
		shift: false,
		control: false,
		alt: false,
		meta: false,
		inputType: 'mouse'
	}

	const savestatus = () => Object.assign(oldstatus, curstatus);
	let oldstatus = {};

	function init() {
		initUI();
		reposition();
		setMode('drag');
	}


	function initUI() {
		initIrSelector();

		$(document).on("keydown keyup", function (e) {
			switch (e.key) {
				case "Shift":
					savestatus();
					curstatus.shift = e.type === "keydown";
					checkStatusChange();
					break;
				case "Control":
					savestatus();
					curstatus.control = e.type === "keydown";
					checkStatusChange();
					break;
				case "Alt":
					savestatus();
					curstatus.alt = e.type === "keydown";
					checkStatusChange();
					break;
				case "Meta": // Windows su PC, Command su Mac
					savestatus();
					curstatus.meta = e.type === "keydown";
					checkStatusChange();
			}
		});

		// $(document).on("mousemove mousedown mouseup click pointerdown pointermove pointercancel pointerup pointerout", function (evt) {
		// 	// console.log(`Mouse or pointer event: ${evt.type}`);
			
		// 	if (player && !presetListPage && mode == 'drag') {
		// 		evt.preventDefault();
		// 		evt.stopPropagation();
		// 	}

		// 	let where = 'out';
		// 	let canvas = canvases.wave.jc;
		// 	if (!canvas)
		// 		return;
		// 	let x = mousex = evt.clientX - canvas.offset().left;
		// 	let y = mousey = evt.clientY - canvas.offset().top;
		// 	if (leftband.contains(x, y))
		// 		where = 'left';
		// 	else if (topband.contains(x, y))
		// 		where = 'top';
		// 	else if (space.contains(x, y))
		// 		where = 'in';

		// 	curstatus.left = (evt.buttons & 1) == 1;// || (evt.type == 'click') || (evt.type == 'mousedown');
		// 	curstatus.right = (evt.buttons & 2) == 2;
		// 	curstatus.x = x;
		// 	curstatus.y = y;
		// 	curstatus.where = where;
		// 	curstatus.shift = evt.shiftKey;
		// 	curstatus.alt = evt.altKey;
		// 	curstatus.control = evt.ctrlKey;
		// 	curstatus.meta = evt.metaKey;
		// 	curstatus.pointerType = 'mouse';
		// 	checkStatusChange();
		// });

		// $(document).on("pointerdown pointermove pointerup", function (evt) {
		// 	evt.preventDefault();
		// 	let where = 'out';
		// 	let canvas = canvases.wave.jc;
		// 	if (!canvas)
		// 		return;
		// 	let x = mousex = evt.clientX - canvas.offset().left;
		// 	let y = mousey = evt.clientY - canvas.offset().top;
		// 	if (leftband.contains(x, y))
		// 		where = 'left';
		// 	else if (topband.contains(x, y))
		// 		where = 'top';
		// 	else if (space.contains(x, y))
		// 		where = 'in';

		// 	// curstatus.left = (evt.buttons & 1) == 1;// || (evt.type == 'click') || (evt.type == 'mousedown');
		// 	// curstatus.right = (evt.buttons & 2) == 2;
		// 	curstatus.x = x;
		// 	curstatus.y = y;
		// 	curstatus.where = where;
		// 	curstatus.shift = evt.shiftKey;
		// 	curstatus.alt = evt.altKey;
		// 	curstatus.control = evt.ctrlKey;
		// 	curstatus.meta = evt.metaKey;
		// 	curstatus.pointerType = evt.pointerType;
		// 	//console.log(`Pointer event: ${evt.type}, type=${evt.pointerType}`, curstatus);
		// 	checkStatusChange();
		// })

		$('.padmode').on('click', function () {
			let mode = $(this).attr('data-mode');

			setMode(mode);
		});

		for (let axis of ['x', 'y']) {
			let parname = 'speedmult' + axis;
			let sel = $(`[par="${parname}"]`);
			for (let val = 0; val <= 8; val++) {
				sel.append(`<option value="${val}">${axis.toUpperCase()} = ${val}</option>`);
			}
			sel.val(1);
		}

		// $('#traction').on('input', function () {
		// 	const traction = parseFloat($(this).val());
		// 	vocoderWorker.postMessage({ type: 'set-status', data: { traction } })
		// });

		// $('#luminosity').on('change', evt => {
		// 	padStatus.lum = 1 - $('#luminosity').val();
		// 	redrawCenterWaves();
		// })

		// $('#contrast').on('change', evt => {
		// 	padStatus.cont = $('#contrast').val() - 0;
		// 	redrawCenterWaves();
		// });

		$('.motion-controls [par]').on('input change', function (evt) {
			let par = $(this).attr('par');
			//let val = $(this).val();
			let val = $parval(par);
			// console.log(`set ${par}=${val}`);
			let data = {};
			data[par] = val;

			vocoderWorker.postMessage({ type: 'set-status', data })
			updateMotionUI();
		});




		$('.effects-controls [par]').on('input change', updateEffectsParams);
		$('[name="delay-mode"]').on('click', function (evt) {
			let delayMode = $('[name="delay-mode"]:checked').val();
			$par('delay-mode').val(delayMode).trigger('change');
		});

		$('.enable-feature').on('click', function (evt) {
			let t = this;
			setTimeout(function () {
				let val = t.checked;
				let dest = $(t).attr('dest');
				$par(dest).val(val + '').trigger('change');
			}, 10);
		});

		for (let i = -12; i <= 12; i++)
			$(`<option value="${i}" label="${i}"></option>`).appendTo('#transpose-values');
	}


	function checkStatusChange() {
		let needsUpdate = false;
		for (var k in curstatus) {
			if (curstatus[k] != oldstatus[k]) {
				needsUpdate = true;
				break;
			}
		}
		if (needsUpdate) {
			update();
			savestatus();
			debugStatus();
		}
	}

	function updateMotionParams() {
		let params = $('.motion-controls [par]').toArray().map(x => $(x).attr('par'));
		let data = {};
		for (let par of params) {
			let val = $parval(par);
			data[par] = val;
		}
		vocoderWorker.postMessage({ type: 'set-status', data })
	}

	function updateMotionUI() {
		let p = $par("speedx");
		let x = linearSpeedRescale(p.val() - 0);
		$('.spaceright', p.parent()).text(x.toFixed(3) + ' *');

		p = $par("speedy");
		x = linearSpeedRescale(p.val() - 0);
		$('.spaceright', p.parent()).text(x.toFixed(3) + ' *');

		p = $par("traction");
		x = Math.round((p.val() - 0) * 100).toFixed(1);
		$('.spaceright', p.parent()).text(x + ' %');

		p = $par("lfofreq");
		x = lfoSpeedRescale(p.val() - 0);
		$('.spaceright', p.parent()).text(x.toFixed(2) + ' Hz');

		p = $par("lfoxamp");
		x = lfoAmpRescale(p.val() - 0);
		$('.spaceright', p.parent()).text(x.toFixed(3));

		p = $par("lfoyamp");
		x = lfoAmpRescale(p.val() - 0);
		$('.spaceright', p.parent()).text(x.toFixed(3));

		p = $par("lfodeltaph");
		x = (p.val() - 0) * 180 / Math.PI;
		$('.spaceright', p.parent()).text("±" + Math.round(x) + '°');

		designLFOShape();
		designLinShape();
	}


	function setTarget(targetX, targetY) {
		curstatus.x = space.left + targetX * space.width;
		curstatus.y = space.bottom - targetY * space.height;
		forcePosition();
	}

	function update(force) {
		let mode = curstatus.mode;

		if (dragging) {
			let targetx = (curstatus.x - space.left) / space.width;
			let targety = -(curstatus.y - space.bottom) / space.height;
			$par('targetx').val(targetx);
			$par('targety').val(targety);
			if (!curstatus.left)
				dragging = false;
			vocoderWorker.postMessage({ type: 'set-status', data: { targetx, targety, dragging } });
			return;
		}

		if (curstatus.where == 'in') {
			if (mode == 'drag') {
				if (curstatus.shift) {
					setMode('motion_temp');
				}
				// if (curstatus.alt) {
				// 	setMode('effects_temp');
				// }
				let act = curstatus.left || (curstatus.inputType == 'touch');
				if (act && !curstatus.shift) {
					dragging = true;
					let targetx = (curstatus.x - space.left) / space.width;
					let targety = -(curstatus.y - space.bottom) / space.height;
					$par('targetx').val(targetx);
					$par('targety').val(targety);
					let data = { targetx, targety, dragging };
					if (curstatus.control) {
						data.forcex = true;
						data.forcey = true;
					}
					vocoderWorker.postMessage({ type: 'set-status', data })
					clearInfo();
				}
				else {
					dragging = false;
					vocoderWorker.postMessage({ type: 'set-status', data: { dragging } })
				}
			}
		}

		if (curstatus.where == 'left' && curstatus.left && !oldstatus.left) { 
			let targety = -(curstatus.y - space.bottom) / space.height;
			vocoderWorker.postMessage({ type: 'set-status', data: {targety, forcey: true} })
			console.log('just clicked on left');
		}


		if (curstatus.where == 'top' && curstatus.left && !oldstatus.left) { 
			let targetx = (curstatus.x - space.left) / space.width;
			vocoderWorker.postMessage({ type: 'set-status', data: {targetx, forcex: true} })
			console.log('just clicked on top '+targetx);
		}
		if (mode == 'motion_temp') {
			if (!curstatus.shift) {
				setMode('drag');
			}
		}
		// if (mode=='effects_temp') {
		// 	if (!curstatus.alt) {
		// 		setMode('drag');
		// 	}
		// }
	}

	function forcePosition() {
		let targetx = $parval('targetx');
		let targety = $parval('targety');
		vocoderWorker.postMessage({ type: 'set-status', data: { targetx, targety, dragging: false, forcex: true, forcey: true } });
	}

	function debounce(func, timeout = 300) {
		let timer;
		return (...args) => {
			clearTimeout(timer);
			timer = setTimeout(() => { func.apply(this, args); }, timeout);
		};
	}

	function _redrawCenterWaves() {
		canvases.wave.ctx.clearRect(BANDW, BANDW, w - BANDW, w - BANDW);
		redrawCenterWave('x');
		redrawCenterWave('y');
	}

	const redrawCenterWaves = debounce(_redrawCenterWaves, 100);

	function setWave(index, wave) {
		index = (index.toLowerCase() == 'y') ? 'y' : 'x';
		waves[index] = {
			data: wave,
			len: wave.length,
			range: [0, wave.length]
		};
		redraw();
	}

	function rect(left, top, width, height) {
		let r = { left, top, width, height };
		r.bottom = top + height;
		r.right = left + width;
		r.cx = left + width / 2;
		r.cy = top + height / 2;
		r.contains = (x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
		return r;
	}

	function reposition() {
		let wh = window.outerHeight, ww = window.outerWidth;
		let left, top;
		let outer = $('.pad-area');
		let inner = $('.canvas-container');
		if (vertical) {
			w = ww;
			left = 0;
			top = 0;
		}
		else {
			w = Math.min(outer.width(), outer.height()) - 30;
			let bottom = (outer.height() - w) / 2;
			if (bottom < 30)
				bottom = 30;
			top = outer.height() - w - bottom;
			if (top < 0)
				top = 0;
			left = (outer.width() - w) / 2;
		}

		$('canvas.dynamic', inner).remove();

		// $('.btn-fullscreen').css({ width: BANDW - 8, height: BANDW - 8 });
		topband = rect(BANDW, 0, w - BANDW, BANDW);
		leftband = rect(0, BANDW, BANDW, w - BANDW);
		space = rect(BANDW, BANDW, w - BANDW, w - BANDW);
		inner.css({
			left: left,
			top: top,
			width: w,
			height: w
		});
		if (vertical)
			outer.css({
				left: left,
				top: top,
				width: w,
				height: w,
				minHeight: w
			});


		$('#top-drop-bar').css({ top: topband.top, left: topband.left, width: topband.width, height: topband.height });
		$('#left-drop-bar').css({ top: leftband.top, left: leftband.left, width: leftband.width, height: leftband.height });
		$('.panel-controls').css({ paddingLeft: left, width: w });

		for (let k in canvases) {
			let desc = canvases[k];
			let jc = $(`<canvas 
				id="mousepad-canvas-${k}" 
				class="mousepad hideable" 
				width="${w}" height="${w}" 
				style="z-index:${desc.zIndex}"></canvas>`)
				.appendTo(inner)
				.addClass('dynamic')
				.addClass(desc.class);
			desc.jc = jc;
			desc.c = jc[0];
			desc.ctx = desc.c.getContext('2d');
			desc.ctx.clearRect(0, 0, w, w)
		}
		$('.subpanel').css({ paddingLeft: BANDW + 1, paddingTop: BANDW + 1 })
		redraw();
		$('body').css('opacity', 1);
	}

	function redraw() {
		// clearWave();
		canvases.wave.ctx.clearRect(0, 0, w, w);
		canvases.wavebar.ctx.clearRect(0, 0, w, w);
		redrawBandWave('x');
		redrawBandWave('y');
		redrawCenterWave('x');
		redrawCenterWave('y');
		// redrawSpeedCanvas();
		redrawInfo();
	}

	// function clearWave() {
	// 	let c = ctx123[WAVECANVAS];
	// 	c.clearRect(0, 0, w, w);
	// }

	function getMinMax(data, n) {

		let min = [], max = [], globalmin = 999999, globalmax = -999999;
		let len = data.length;
		for (let i = 0; i < n; i++) {
			min[i] = 0;
			max[i] = 0;
		}
		for (let i = 0; i < len; i++) {
			let p = Math.round(i * n / len);
			let s = data[i];
			if (s < min[p]) {
				min[p] = s;
				if (s < globalmin)
					globalmin = s;
			}
			if (s > max[p]) {
				max[p] = s;
				if (s > globalmax)
					globalmax = s;
			}
		}
		let globalrange = globalmax - globalmin;
		if (globalrange == 0)
			globalrange = 1;

		return { min, max, globalmin, globalmax, globalrange }
	}

	function redrawBandWave(index) {
		let c = canvases.wavebar.ctx;
		let data = waves[index].data;
		if (!data)
			return;
		let len = data.length;
		let start, end, extent = w - BANDW;
		let { min, max, globalmin, globalmax, globalrange } = getMinMax(data, extent);
		let v0, v1;
		if (index == 'x') {
			v0 = BANDW - 5;
			v1 = 0 + 5;
			start = BANDW;
			end = w;
		}
		else {
			v0 = BANDW - 5;
			v1 = 0 + 5;
			end = BANDW;
			start = w;
		}

		//c.clearRect(0,0,w,w);
		c.lineWidth = 1;
		//c.strokeStyle = 'black';
		c.strokeStyle = '#007bff';

		let gmin, gmax;
		if (index == 'x') {
			gmin = min.map(v => v0 + (v - globalmin) * (v1 - v0) / globalrange);
			gmax = max.map(v => v0 + (v - globalmin) * (v1 - v0) / globalrange);
		}
		else {
			gmin = min.map(v => v0 + (v - globalmin) * (v1 - v0) / globalrange);
			gmax = max.map(v => v0 + (v - globalmin) * (v1 - v0) / globalrange);
		}

		for (let i = 0; i < extent; i++) {
			c.beginPath();
			if (index == 'x') {
				c.moveTo(start + i, gmin[i]);
				c.lineTo(start + i, gmax[i]);
			}
			else {
				c.moveTo(gmin[i], start - i);
				c.lineTo(gmax[i], start - i);

			}
			c.stroke();
		}

		c.lineWidth = 1;
		c.strokeStyle = 'black';
		c.strokeRect(space.left, space.top, space.width, space.height)
		//c.fillRect(space.left, space.top, space.width, space.height)
		// c.fillStyle = '#f8f8f8';

	}

	function redrawCenterWave(index) {
		let c = canvases.wave.ctx;
		if (!waves[index].data)
			return;

		let data = waves[index].data.map(x => Math.abs(x));
		let len = data.length;

		let extent = space.width;
		let { min, max, globalmin, globalmax, globalrange } = getMinMax(data, extent);
		let v0 = 0;
		let v1 = 1;
		//c.clearRect(0,0,w,w);
		c.lineWidth = 1;
		c.strokeStyle = 'black';
		// c.strokeStyle = '#007bff';
		//c.strokeStyle = '#a0a0a0';
		let alphamax = max.map(v => v / globalmax);

		for (let i = 0; i < extent; i++) {
			let alpha = alphamax[i];
			alpha = Math.pow(alpha, padStatus.cont);
			alpha = alpha * padStatus.lum;
			c.globalAlpha = Math.max(0, Math.min(alpha, 1));
			c.beginPath();
			if (index == 'x') {
				c.moveTo(space.left + i, space.top);
				c.lineTo(space.left + i, space.bottom);
			}
			else {
				c.moveTo(space.left, space.bottom - i);
				c.lineTo(space.right, space.bottom - i);
			}
			c.stroke();
		}
		c.globalAlpha = 1;

	}

	function line(c, x1, y1, x2, y2) {
		c.beginPath();
		c.moveTo(x1, y1);
		c.lineTo(x2, y2);
		c.stroke();
	}

	function updateEffectsParams() {

		const revDryWet = $parval("revsend") - 0;
		let balance = revDryWet <= -35.5 ? 0 : dbToAmplitude(revDryWet);
		if (!$parval('enable-reverb'))
			balance = 0;
		reverb.setDryWet(balance);
		$('#reverb-value').text(revDryWet <= -35.5 ? '-' : revDryWet.toFixed(0) + ' dB');

		let revTypeName = $('[par="revtype"]').val();
		if (revTypeName != updateEffectsParams.revTypeName) {
			updateEffectsParams.revTypeName = revTypeName;
			reverb.loadIR(revTypeName);
		}



		//[name="delay-mode"], #left-delay, #right-delay, #delay-feedback, #delay-lopass, #delay-mix'
		let delayMode = $par('delay-mode').val();
		let ldelay = delayLengthRescale($parval("ldelay"));
		let rdelay = delayLengthRescale($parval("rdelay"));
		let feedback = $parval("feedback");
		let lopass = $parval("lopass");
		let mix = $parval("delmix");
		if (!$parval("enable-delay"))
			mix = 0;

		$('#left-delay-value').text(ldelay.toFixed(3) + ' ms');
		$('#right-delay-value').text(rdelay.toFixed(3) + ' ms');
		$('#delay-feedback-value').text(feedback.toFixed(3) + ' %');
		$('#delay-lopass-value').text(alphaToCutoff(lopass).toFixed(1) + ' Hz');
		$('#delay-mix-value').text(mix.toFixed(3) + ' %');

		$('#transpose-x-value').text($parval('transposeX'));
		$('#transpose-y-value').text($parval('transposeY'));
		$('#transpose-m-value').text($parval('transposeM'));

		vocoderOscillatorNode.port.postMessage({
			type: 'set-delay', data: {
				mode: delayMode,
				ldelay,
				rdelay,
				feedback,
				lopass,
				mix,
			}
		});

		vocoderWorker.postMessage({
			type: 'set-status', data: {
				transposeX: $parval('transposeX'),
				transposeY: $parval('transposeY'),
				transposeM: $parval('transposeM'),
			}
		});
	}


	function redrawInfo() {

	}

	const DSIZE = 130;
	function designLFOShape() {
		const NPERCYCLE = 1000;
		const NCYCLES = 1;
		const GW = .85;
		let canvas = $('#lfo-shape-canvas');
		let w = canvas.width(), h = canvas.height();
		canvas[0].width = w;
		canvas[0].height = h;
		let ctx = canvas[0].getContext('2d');
		//const SPC = 5;
		//let bbh = h - SPC * 2;
		let bb = rect(w - DSIZE, (h - DSIZE) / 2, DSIZE, DSIZE);

		ctx.strokeStyle = "gray";

		ctx.beginPath();
		ctx.moveTo(bb.left, bb.cy);
		ctx.lineTo(bb.right, bb.cy);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(bb.cx, bb.bottom);
		ctx.lineTo(bb.cx, bb.top);
		ctx.stroke();

		ctx.strokeStyle = "#007bff";
		ctx.fillStyle = "#007bff";
		let ph = 0, step = Math.PI * 2 / NPERCYCLE;
		let shape = $par("lfowave").val() - 0;
		let deltaph = $par("lfodeltaph").val() - 0;
		let steps = $par("steps").val() - 0;
		let speedmultx = $par("speedmultx").val() - 0;
		let speedmulty = $par("speedmulty").val() - 0;

		let x = lfowaveX(shape, ph * speedmultx, deltaph);
		let y = lfowaveY(shape, ph * speedmulty, deltaph);

		for (let i = 0; i < NPERCYCLE * NCYCLES; i++) {
			ph += step;
			let x = lfowaveX(shape, ph * speedmultx, deltaph);
			let y = lfowaveY(shape, ph * speedmulty, deltaph);
			let gx = bb.cx + GW * x * DSIZE / 2;
			let gy = bb.cy - GW * y * DSIZE / 2;
			// ctx.beginPath();
			// //ctx.moveTo(bb.cx + GW * x * DSIZE / 2, bb.cy - GW * y * DSIZE / 2);
			// ctx.moveTo(gx, gy);
			// ctx.lineTo(gx, gy+1);
			// ctx.stroke();
			ctx.fillRect(gx, gy, 1, 1);
		}

		if (steps > 0) {
			ph = 0;
			for (let i = 0; i < NCYCLES * steps; i++) {
				let x = lfowaveX(shape, ph * speedmultx, deltaph);
				let y = lfowaveY(shape, ph * speedmulty, deltaph);
				let gx = bb.cx + GW * x * DSIZE / 2;
				let gy = bb.cy - GW * y * DSIZE / 2;
				ctx.beginPath();
				ctx.arc(gx, gy, 4, 0, 2 * Math.PI);
				ctx.fill();
				ph += 2 * Math.PI / steps;
			}
		}
		//ctx.strokeRect(bb.left, bb.top, bb.width, bb.height);
	}

	function designLinShape() {
		const GW = .85;
		let canvas = $('#lin-shape-canvas');
		let w = canvas.width(), h = canvas.height();
		canvas[0].width = w;
		canvas[0].height = h;
		let ctx = canvas[0].getContext('2d');
		const SPC = 5;
		let bb = rect(w - DSIZE, (h - DSIZE) / 2, DSIZE, DSIZE);

		ctx.strokeStyle = "gray";

		ctx.beginPath();
		ctx.moveTo(bb.left, bb.cy);
		ctx.lineTo(bb.right, bb.cy);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(bb.cx, bb.bottom);
		ctx.lineTo(bb.cx, bb.top);
		ctx.stroke();

		ctx.strokeStyle = "#007bff";
		ctx.fillStyle = "#007bff";

		let vx = $par("speedx").val() - 0;
		let vy = $par("speedy").val() - 0;
		let sx = linearSpeedRescale(vx);
		let sy = linearSpeedRescale(vy);
		if (waveX)
			sx = sx / waveX.length;
		if (waveY)
			sy = sy / waveY.length;
		if (sx != 0 || sy != 0) {
			let angle = Math.atan2(sy, sx);
			let x = bb.cx + Math.cos(angle) * GW * DSIZE / 2;
			let y = bb.cy - Math.sin(angle) * GW * DSIZE / 2;
			drawArrow(ctx, bb.cx, bb.cy, x, y, { color: '#0056b3' });
		}
	}

	function showOscStatus(s) {
		curOscStatus = s;
		let x, y, lx, ly;
		let c = canvases.cursor.ctx;
		let cp = canvases.cursorpoint.ctx;
		c.clearRect(0, 0, w, w);

		c.lineWidth = 2;
		c.strokeStyle = '#a00000';
		c.fillStyle = '#a00000';

		// center area
		{
			let { left, top, right, bottom, width, height } = space;
			x = left + s.posx * width;
			y = bottom - s.posy * height;
			const limit01 = v => v < 0 ? v + 1 : (v > 1 ? v - 1 : v);
			lx = left + limit01(s.posx + s.lfox) * width;
			ly = bottom - limit01(s.posy + s.lfoy) * height;

			c.beginPath();
			c.moveTo(x, top);
			c.lineTo(x, bottom);
			c.stroke();
			c.beginPath();
			c.moveTo(left, y);
			c.lineTo(right, y);
			c.stroke();
		}

		// top band
		{
			let { left, top, right, bottom, width, height, cx, cy } = topband;
			c.beginPath();
			c.moveTo(lx, cy - height * .3);
			c.lineTo(lx, cy + height * .3);
			c.stroke();
		}

		// left band 
		{
			let { left, top, right, bottom, width, height, cx, cy } = leftband;
			c.beginPath();
			c.moveTo(cx - width * .3, ly);
			c.lineTo(cx + width * .3, ly);
			c.stroke();
		}


		cp.fillStyle = "rgba(0, 0, 0, 0.05)";
		cp.globalCompositeOperation = "destination-out";
		cp.fillRect(0, 0, w, w);
		cp.globalCompositeOperation = "source-over";

		cp.strokeStyle = '#a00000';
		cp.fillStyle = '#a00000';
		cp.beginPath();
		cp.arc(lx, ly, 3, 0, 2 * Math.PI);
		cp.stroke();
		cp.fill();


		let lin = $parval('enable-linear');
		if (lin /*&& !dragging*/ && waves.x.data && waves.y.data) {
			let gfx = waves.x.data ? oscOutStatus.incx / waves.x.data.length : -1;
			let gfy = waves.y.data ? -oscOutStatus.incy / waves.y.data.length : -1;
			let angle = Math.atan2(gfy, gfx);


			let points = lineSquareIntersections(space, x, y, angle)
			if (points.length == 2) {
				c.save();
				c.lineWidth = 1;
				c.strokeStyle = '#700000';
				c.setLineDash([5, 15]);

				// c.beginPath();
				// c.moveTo(p1[0], p1[1]);
				// c.lineTo(p2[0], p2[1]);
				// c.stroke();
				c.beginPath();
				c.moveTo(points[0].x, points[0].y);
				c.lineTo(points[1].x, points[1].y);
				c.stroke();

				c.restore();
			}
		}

		if (dragging) {
			let { left, top, right, bottom, width, height } = space;
			c.save();
			c.fillStyle = '#0056b3';
			c.strokeStyle = '#0056b3';
			let tx = left + (oscInStatus.targetx) * width;
			let ty = bottom - (oscInStatus.targety) * height;
			c.beginPath();
			c.arc(tx, ty, 3, 0, 2 * Math.PI);
			c.stroke();
			c.fill();

			c.beginPath();
			c.moveTo(tx, ty)
			c.lineTo(x, y);
			c.setLineDash([2, 2]);
			c.lineWidth = 1;
			c.stroke();
			c.restore();
		}
		debugStatus();
	}

	function lineSquareIntersections(rect, px, py, angle) { // thanks to GPT
		const m = Math.tan(angle);
		const points = [];

		// lati verticali
		[rect.left, rect.left + rect.width].forEach(xSide => {
			const y = py + m * (xSide - px);
			if (y >= rect.top && y <= rect.top + rect.height) {
				points.push({ x: xSide, y });
			}
		});

		// lati orizzontali (evitare divisione per 0)
		if (Math.abs(m) > 1e-10) {
			[rect.top, rect.top + rect.height].forEach(ySide => {
				const x = px + (ySide - py) / m;
				if (x >= rect.left && x <= rect.left + rect.width) {
					points.push({ x, y: ySide });
				}
			});
		}

		// alla fine points conterrà 2 intersezioni
		return points;
	}

	function drawArrow(ctx, x1, y1, x2, y2, opts = {}) { // thanks to GPT
		const {
			color = '#111',
			width = 4,
			headLength = 12,
			headAngle = Math.PI / 8,
			lineDash = [],
			cap = 'round'
		} = opts;

		// Direzione linea
		const dx = x2 - x1;
		const dy = y2 - y1;
		const angle = Math.atan2(dy, dx);

		ctx.save();
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.lineWidth = width;
		ctx.setLineDash(lineDash);
		ctx.lineCap = cap;
		ctx.lineJoin = 'round';

		// Corpo della freccia
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();

		// Punta della freccia (triangolo isoscele)
		const x3 = x2 - headLength * Math.cos(angle - headAngle);
		const y3 = y2 - headLength * Math.sin(angle - headAngle);
		const x4 = x2 - headLength * Math.cos(angle + headAngle);
		const y4 = y2 - headLength * Math.sin(angle + headAngle);

		ctx.beginPath();
		ctx.moveTo(x2, y2);
		ctx.lineTo(x3, y3);
		ctx.lineTo(x4, y4);
		ctx.closePath();
		ctx.fill();

		ctx.restore();
	}

	function debugStatus() {
		let d = {}
		for (let k in oscInStatus)
			d['i.' + k] = oscInStatus[k];
		for (let k in oscOutStatus)
			d['o.' + k] = oscOutStatus[k];

		function getVal(k) {
			if (typeof (d[k]) == 'number') return d[k].toFixed(4);
			return d[k];
		}
		let txt = Object.keys(d).map(x => `${x.padStart(12, ' ')}: ${getVal(x)}`).join('\n');
		$('.debug-monitor').text(txt);

	}

	function showInfo(txt, forced) {
		if (txt == showInfo.lastTxt && !forced)
			return;
		showInfo.lastTxt = txt;
		canvases.info.jc.stop();
		canvases.info.jc.fadeIn(0);
		let c = canvases.info.ctx;
		c.font = '20px sans-serif';
		c.fillStyle = '#0056b3';
		let x = 20 + space.left;
		let y = 50 + space.top;
		c.clearRect(0, 0, w, w);
		for (let line of txt.split('\n')) {
			c.fillText(line, x, y);
			y += 30;
		}
	}

	function clearInfo() {
		canvases.info.jc.fadeOut(3000, () => canvases.info.jc.stop());
	}

	async function initIrSelector() {
		let irs = await fetch('rev-ir-lr.json').then(r => r.json());
		let sel = $('[par="revtype"]');
		for (let i = 0; i < irs.length; i++) {
			sel.append(`<option value="${irs[i]}">${irs[i]}</option>`);
		}
		sel.val(irs[0]);
	}


	function setFullscreen(value) {
		reposition();
	}

	// function onAnyPointerEvent(e) {
	// 	if (e.type.startsWith('pointer')) {
	// 		console.log(`Pointer event: ${e.type}, type=${e.pointerType}`, e);
	// 	}

	// }

	// window.addEventListener('pointerdown', onAnyPointerEvent);
	// window.addEventListener('pointermove', onAnyPointerEvent);
	// window.addEventListener('pointerup', onAnyPointerEvent);
	// window.addEventListener('pointercancel', onAnyPointerEvent);
	// window.addEventListener('pointerenter', onAnyPointerEvent);
	// window.addEventListener('pointerleave', onAnyPointerEvent);
	// window.addEventListener('pointerover', onAnyPointerEvent);
	// window.addEventListener('pointerout', onAnyPointerEvent);




	let resizeTimeout = null;
	window.addEventListener("resize", function () {
		clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(() => {
			reposition();
			console.log("Resize concluso:", window.innerWidth, "x", window.innerHeight);
		}, 200);
	});

	return {
		init, reposition, redraw,
		redrawInfo,
		setWave,
		setMode,
		getMode: () => mode,
		showOscStatus,
		getStatus: () => padStatus,
		setStatus: x => Object.assign(padStatus, x),
		updateMotionUI,
		updateEffectsParams,
		updateMotionParams,
		clearInfo,
		forcePosition,
		setFullscreen,
		setTarget

	}
})();