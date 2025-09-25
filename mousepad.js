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
		speed: { class: 'speed-arrow', zIndex: 110 },
		cursor: { class: 'cursor', zIndex: 120 },
		info: { class: 'info', zIndex: 130 },
		lfo: { class: 'lfo-view', zIndex: 140 },
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
		// amp: { bgcolor: '#e0e0ff', show: '.wave, .cursor, .info,  .speed-arrow' },
		drag: { bgcolor: '#ffffff', show: '.wave, .cursor, .info' },
		//speed: { bgcolor: '#f0f0ff', show: '.wave, .cursor, .info, .speed-arrow' },
		motion: { bgcolor: '#fff0f0', show: '.wave, .motion-view, .info, .cursor, .motion-controls' },
		effects: { bgcolor: '#fff0f0', show: '.wave, .effects-view, .info, .cursor, .effects-controls' },
		settings: { bgcolor: '#ffffff', show: '.wave, .info, .settings-controls' }
	};

	let mode = null;
	function setMode(_mode) {
		if (mode == _mode)
			return;

		mode = curstatus.mode = _mode;
		$('.padmode').removeClass('on');
		$('.padmode[data-mode="' + mode + '"]').addClass('on');
		if (!modes[mode])
			return;
		padStatus.mode = mode;
		curstatus.mode = mode;
		$('.hideable').not(modes[mode].show).toggleClass('hidden', true);
		$('.hideable').filter(modes[mode].show).toggleClass('hidden', false);

		if (mode=='motion') {
			designLinShape();
			designLFOShape();
		}
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
	}

	const savestatus = () => Object.assign(oldstatus, curstatus);
	let oldstatus = {};

	function init() {
		initUI();
		reposition();
		setMode('drag');
	}


	function initUI() {
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

		$(document).on("mousemove mousedown mouseup click", function (evt) {
			let where = 'out';
			let canvas = canvases.wave.jc;
			if (!canvas)
				return;
			let x = mousex = evt.clientX - canvas.offset().left;
			let y = mousey = evt.clientY - canvas.offset().top;
			if (leftband.contains(x, y))
				where = 'left';
			else if (topband.contains(x, y))
				where = 'top';
			else if (space.contains(x, y))
				where = 'in';

			curstatus.left = (evt.buttons & 1) == 1;// || (evt.type == 'click') || (evt.type == 'mousedown');
			curstatus.right = (evt.buttons & 2) == 2;
			curstatus.x = x;
			curstatus.y = y;
			curstatus.where = where;
			curstatus.shift = evt.shiftKey;
			curstatus.alt = evt.altKey;
			curstatus.control = evt.ctrlKey;
			curstatus.meta = evt.metaKey;
			checkStatusChange();
		});


		$('.padmode').on('click', function () {
			let mode = $(this).attr('data-mode');

			setMode(mode);
		});


		$('#traction').on('input', function () {
			const traction = parseFloat($(this).val());
			vocoderWorker.postMessage({ type: 'set-status', data: { traction } })
		});

		$('#luminosity').on('change', evt => {
			padStatus.lum = 1 - $('#luminosity').val();
			redrawCenterWaves();
		})

		$('#contrast').on('change', evt => {
			padStatus.cont = $('#contrast').val() - 0;
			redrawCenterWaves();
		});

		$('.motion-controls [par]').on('input change', function (evt) {
			let par = $(this).attr('par');
			let val = $(this).val();
			// console.log(`set ${par}=${val}`);
			let data = {};
			data[par] = val;

			vocoderWorker.postMessage({ type: 'set-status', data })
			designLFOShape();
			designLinShape();
		});
		$('[name="delay-mode"], #left-delay, #right-delay, #delay-feedback, #delay-lopass, #delay-mix').on('input change', function (evt) {
			console.log(' delay params');
			updateDelayParams();
		});
	}


	function checkStatusChange() {
		for (var k in curstatus) {
			if (curstatus[k] != oldstatus[k]) {
				update();
				savestatus();
				debugStatus();
			}
		}
	}




	function update(force) {
		let mode = curstatus.mode;

		$('.canvas-container').css('background-color', modes[mode].bgcolor);
		// if (mode == 'drag' && curstatus.shift) {
		// 	setMode('speed');
		// 	return;
		// }
		// if (mode == 'speed' && !curstatus.shift) {
		// 	setMode('pos');
		// 	return;
		// }
		if (curstatus.where == 'in') {
			if (mode == 'drag') {
				if (curstatus.left && !curstatus.shift) {
					dragging = true;
					padStatus.mx = (curstatus.x - space.left) / space.width;
					padStatus.my = -(curstatus.y - space.bottom) / space.height;
					let forcepos = curstatus.control;
					vocoderWorker.postMessage({ type: 'set-status', data: { targetx: padStatus.mx, targety: padStatus.my, dragging, forcepos } })
				}
				else {
					dragging = false;
					vocoderWorker.postMessage({ type: 'set-status', data: { dragging } })
				}
			}
		}
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
		let mousepadSpace = $('.pad-area');
		let container = $('.canvas-container');
		w = Math.min(mousepadSpace.width(), mousepadSpace.height()) - 5;
		let left = (mousepadSpace.width() - w) / 2;
		let top = (mousepadSpace.height() - w) / 2;
		top = 0;
		$('canvas.dynamic', container).remove();

		topband = rect(BANDW, 0, w - BANDW, BANDW);
		leftband = rect(0, BANDW, BANDW, w - BANDW);
		space = rect(BANDW, BANDW, w - BANDW, w - BANDW);
		container.css({
			left: left,
			top: top,
			width: w,
			height: w
		})

		$('#top-drop-bar').css({ top: topband.top, left: topband.left, width: topband.width, height:topband.height });
		$('#left-drop-bar').css({ top: leftband.top, left: leftband.left, width: leftband.width, height:leftband.height });
		$('.panel-controls').css({ paddingLeft: left, width: w });

		for (let k in canvases) {
			let desc = canvases[k];
			let jc = $(`<canvas 
				id="mousepad-canvas-${k}" 
				class="mousepad hideable" 
				width="${w}" height="${w}" 
				style="z-index:${desc.zIndex}"></canvas>`)
				.appendTo(container)
				.addClass('dynamic')
				.addClass(desc.class);
			desc.jc = jc;
			desc.c = jc[0];
			desc.ctx = desc.c.getContext('2d');
			desc.ctx.clearRect(0, 0, w, w)
		}
		$('.subpanel').css({ paddingLeft: BANDW+1, paddingTop: BANDW+1 })
		redraw();
	}

	function redraw() {
		// clearWave();
		canvases.wave.ctx.clearRect(0, 0, w, w);
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
		let c = canvases.wave.ctx;
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

	function updateDelayParams() {
		//[name="delay-mode"], #left-delay, #right-delay, #delay-feedback, #delay-lopass, #delay-mix'
		let mode = $('[name="delay-mode"]:checked').val();
		let ldelay = delayLengthRescale($('#left-delay').val()-0);
		let rdelay = delayLengthRescale($('#right-delay').val()-0);
		let feedback = $('#delay-feedback').val()-0;
		let lopass = $('#delay-lopass').val()-0;
		let mix = $('#delay-mix').val()-0;
		vocoderOscillatorNode.port.postMessage({ type: 'set-delay', data: {
				mode,
				ldelay,
				rdelay,
				feedback,
				lopass,
				mix
		}});
	}

	// function redrawSpeedCanvas() {
	// 	let { left, top, width, height, cx, cy } = space;
	// 	let c = canvases.speed.ctx;
	// 	c.lineWidth = 1;
	// 	c.strokeStyle = '#808080';
	// 	c.clearRect(0, 0, w, w);

	// 	line(c, left, cy, left + width, cy);
	// 	line(c, cx, top, cx, top + height);

	// 	drawArrow(c, cx, cy, curstatus.x, cy, { color: '#0056b3' })
	// 	drawArrow(c, cx, cy, cx, curstatus.y, { color: '#0056b3' })
	// }

	function redrawInfo() {

	}

	const DSIZE = 130;
	function designLFOShape() { 
		const NPERCYCLE=120;
		const NCYCLES=12;
		const GW = .85;
		let canvas = $('#lfo-shape-canvas');
		let w = canvas.width(), h = canvas.height();
		canvas[0].width = w;
		canvas[0].height = h;
		let ctx = canvas[0].getContext('2d');
		//const SPC = 5;
		//let bbh = h - SPC * 2;
		let bb =  rect(w-DSIZE, (h-DSIZE)/2, DSIZE, DSIZE);

		ctx.strokeStyle="gray";

		ctx.beginPath();
		ctx.moveTo(bb.left, bb.cy);
		ctx.lineTo(bb.right, bb.cy);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(bb.cx, bb.bottom);
		ctx.lineTo(bb.cx, bb.top);
		ctx.stroke();
		
		ctx.strokeStyle="#007bff";
		ctx.fillStyle="#007bff";
		let ph=0, step=Math.PI*2/NPERCYCLE;
		let shape = $('[par="lfowave"]').val()-0;
		let deltaph = $('[par="lfodeltaph"]').val()-0;
		let steps = $('[par="steps"]').val()-0;

		let x = lfowaveX(shape, ph);
		let y = lfowaveY(shape, ph, deltaph);

		ctx.beginPath();
		ctx.moveTo(bb.cx+GW*x*DSIZE/2, bb.cy-GW*y*DSIZE/2);
		for (let i=0; i<NPERCYCLE*NCYCLES; i++) {
			ph += step;
			let x = lfowaveX(shape, ph);
			let y = lfowaveY(shape, ph, deltaph);
			let gx = bb.cx+GW*x*DSIZE/2;
			let gy = bb.cy-GW*y*DSIZE/2;
			ctx.lineTo(gx, gy);
		}
		ctx.stroke();

		if (steps>0) {
			ph = 0;
			for(let i=0; i<NCYCLES*steps; i++) {
				let x = lfowaveX(shape, ph);
				let y = lfowaveY(shape, ph, deltaph);
				let gx = bb.cx+GW*x*DSIZE/2;
				let gy = bb.cy-GW*y*DSIZE/2;
				ctx.beginPath();
				ctx.arc(gx, gy, 4, 0, 2 * Math.PI);
				ctx.fill();
				ph += 2*Math.PI/steps;
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
		let bb =  rect(w-DSIZE, (h-DSIZE)/2, DSIZE, DSIZE);

		ctx.strokeStyle="gray";

		ctx.beginPath();
		ctx.moveTo(bb.left, bb.cy);
		ctx.lineTo(bb.right, bb.cy);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(bb.cx, bb.bottom);
		ctx.lineTo(bb.cx, bb.top);
		ctx.stroke();
		
		ctx.strokeStyle="#007bff";
		ctx.fillStyle="#007bff";

		let sx = linearSpeedRescale($('#x-speed').val()-0);
		let sy = linearSpeedRescale($('#y-speed').val()-0);
		if (waveX)
			sx = sx/waveX.length;
		if (waveY)
			sy = sy/waveY.length;
		if (sx!=0 || sy!=0) {
			let angle = Math.atan2(sy, sx);
			let x = bb.cx + Math.cos(angle) * GW * DSIZE / 2;
			let y = bb.cy - Math.sin(angle) * GW * DSIZE / 2;
			drawArrow(ctx, bb.cx, bb.cy, x, y, { color: '#0056b3' });
		}
	}

	function showOscStatus(s) {
		curOscStatus = s;
		let c = canvases.cursor.ctx;
		c.clearRect(0, 0, w, w);
		c.lineWidth = 2;
		c.strokeStyle = '#a00000';
		c.fillStyle = '#a00000';

		let { left, top, right, bottom, width, height } = space;
		let x = left + s.posx * width;
		let y = bottom - s.posy * height;

		c.beginPath();
		c.moveTo(x, top);
		c.lineTo(x, bottom);
		c.stroke();
		c.beginPath();
		c.moveTo(left, y);
		c.lineTo(right, y);
		c.stroke();

		let lx = left + (s.posx + s.lfox) * width;
		let ly = bottom - (s.posy + s.lfoy) * height;
		c.beginPath();
		c.arc(lx, ly, 3, 0, 2 * Math.PI);
		c.stroke();
		c.fill();



		if (!dragging && waves.x.data && waves.y.data) {
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
		c.font = '30px sans-serif';
		c.fillStyle = '#0056b3';
		let x = 20 + space.left;
		let y = 50 + space.top;
		c.clearRect(0, 0, w, w);
		for (let line of txt.split('\n')) {
			c.fillText(line, x, y);
			y += 50;
		}
		canvases.info.jc.fadeOut(3000, () => canvases.info.jc.stop());
	}



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
		showOscStatus,
		getStatus: () => padStatus,
		setStatus: x => Object.assign(padStatus, x),
		designLFOShape,
		designLinShape
	}
})();