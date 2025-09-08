mousepad = (function () {
	let canvases = [];


	let NCANVAS = 4;
	let BANDW = 50;
	let topband, leftband, space;
	let ctx = [];
	let waves = { x: {}, y: {} };
	let xrange, yrange;
	let w;
	let mousex, mousey;
	const WAVECANVAS = 0;
	const SPEEDCANVAS = 1;
	const INFOCANVAS = 2;
	const CURSORCANVAS = 3;
	let dragging = false;

	const padStatus = {
		mode: 'pos',
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
		amp: { bgcolor: '#e0e0ff' },
		pos: { bgcolor: '#ffffff' },
		speed: { bgcolor: '#f0f0ff' },
		lfox: { bgcolor: '#fff0f0' },
		lfoy: { bgcolor: '#fff0f0' },
		lum: { bgcolor: '#ffffff' }
	};

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

		reposition();
		setMode('pos');
	}


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

	$('.padmode').on('click', function () {
		let mode = $(this).attr('data-mode');

		setMode(mode);
	});

	function checkStatusChange() {
		for (var k in curstatus) {
			if (curstatus[k] != oldstatus[k]) {
				update();
				savestatus();
				debugStatus();
			}
		}
	}

	$(document).on("mousemove mousedown mouseup click", function (evt) {
		if (evt.type!='mousemove')
			console.log({mouseevent:[evt.type, evt.buttons]})
		let where = 'out';
		let canvas = canvases[0];
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



	function update(force) {
		let setSpeed = s => s.mode == 'speed' || (s.mode == 'pos' && s.shift);
		let setAmp = s => s.mode == 'amp';
		let mode = curstatus.mode;

		$('.canvas-container').css('background-color', modes[mode].bgcolor);


		if (curstatus.where == 'in') {
			if (mode == 'pos') {
				if (curstatus.left && !curstatus.shift) {
					dragging = true;
					padStatus.mx = (curstatus.x - space.left) / space.width;
					padStatus.my = -(curstatus.y - space.bottom) / space.height;
					vocoderWorker.postMessage({ type: 'set-status', data: { targetx: padStatus.mx, targety: padStatus.my, dragging } })
				}
				else {
					dragging = false;
					vocoderWorker.postMessage({ type: 'set-status', data: { dragging } })
				}
			}

			if (mode == 'speed' || (mode == 'pos' && curstatus.shift)) {
				$('.canvas-container').css('background-color', modes['speed'].bgcolor);

				if (!setSpeed(oldstatus))
					ctx[SPEEDCANVAS].clearRect(0, 0, w, w);

				canvases[SPEEDCANVAS].toggleClass('hidden', false);
				const CSPACE = .05;
				const MAXP = 2, MINP = -8;
				if (curstatus.left) {
					function getv(norm) {
						if (norm < 0)
							return -getv(-norm);
						if (norm < CSPACE)
							return 0;
						norm = (norm - CSPACE) / (1 - CSPACE);
						const logVal = MINP + norm * (MAXP - MINP);
						const val = Math.pow(2, logVal);
						return val;
					}
					let x = (curstatus.x - space.cx) / (space.width / 2);
					let y = -(curstatus.y - space.cy) / (space.height / 2);

					padStatus.speedx = getv(x);
					padStatus.speedy = getv(y);
					vocoderWorker.postMessage({ type: 'set-status', data: { speedx: padStatus.speedx, speedy: padStatus.speedy } })

					redrawSpeedCanvas();
					showInfo('X speed = ' + padStatus.speedx.toFixed(4) + '*\nY speed = ' + padStatus.speedy.toFixed(3) + '*');
				}
			}
			else
				canvases[SPEEDCANVAS].toggleClass('hidden', true);

			if (mode == 'amp') {
				$('.canvas-container').css('background-color', modes['amp'].bgcolor);

				if (!setAmp(oldstatus))
					ctx[SPEEDCANVAS].clearRect(0, 0, w, w);

				canvases[SPEEDCANVAS].toggleClass('hidden', false);
				if (curstatus.left) {
					let x = (curstatus.x - space.left) / space.width;
					let y = -(curstatus.y - space.cy) / (space.height / 2);
					let ampDb = y * 48;
					let amp = dbToAmplitude(ampDb)
					padStatus.mix = x;
					padStatus.amp = ampDb;
					//vocoderWorker.postMessage({ type: 'set-status', data: { scale: amp, mix: x } });

					$('#slider-amp').val(ampDb).trigger('input');
					$('#merge-param').val(x).trigger('input');
					redrawSpeedCanvas();
					showInfo('amp = ' + ampDb.toFixed(1) + ' dB\nbalance = ' + (x * 2 - 1).toFixed(3));

				}
			}


			if (mode == 'lum') {
				if (curstatus.left && curstatus.where == 'in') {
					let x = (curstatus.x - space.left) / space.width;
					let y = (curstatus.y - space.top) / space.height;
					padStatus.lum = 0.2 + y;
					padStatus.cont = 1 + x * 5;
					redrawCenterWaves();
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
		ctx[WAVECANVAS].clearRect(BANDW, BANDW, w - BANDW, w - BANDW);
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
		let mousepadSpace = $('.arena');
		let container = $('.canvas-container');
		w = Math.min(mousepadSpace.width(), mousepadSpace.height()) - 5;
		let left = (mousepadSpace.width() - w) / 2;
		let top = (mousepadSpace.height() - w) / 2;
		top = 0;
		container.empty();

		topband = rect(BANDW, 0, w - BANDW, BANDW);
		leftband = rect(0, BANDW, BANDW, w - BANDW);
		space = rect(BANDW, BANDW, w - BANDW, w - BANDW);
		container.css({
			left: left,
			top: top,
			width: w,
			height: w
		})
		$('.panel-controls').css({paddingLeft: left, width: w});
		
		for (let i = 0; i < NCANVAS; i++) {
			canvases[i] = $(`<canvas 
				id="mousepad${i}" 
				class="mousepad" 
				width="${w}" height="${w}" 
				style="z-index:${100 + i * 10}"></canvas>`)
				.appendTo(container)

			ctx[i] = canvases[i][0].getContext('2d');
			ctx[i].clearRect(0, 0, w, w)
		}
		redraw();
	}

	function redraw() {
		clearWave();
		ctx[WAVECANVAS].clearRect(0, 0, w, w);
		redrawBandWave('x');
		redrawBandWave('y');
		redrawCenterWave('x');
		redrawCenterWave('y');
		redrawSpeedCanvas();
		redrawInfo();
	}

	function clearWave() {
		let c = ctx[WAVECANVAS];
		c.clearRect(0, 0, w, w);
	}

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
		let c = ctx[WAVECANVAS];
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
		let c = ctx[WAVECANVAS];
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

	function redrawSpeedCanvas() {
		let { left, top, width, height, cx, cy } = space;
		let c = ctx[SPEEDCANVAS];
		c.lineWidth = 1;
		c.strokeStyle = '#808080';
		c.clearRect(0, 0, w, w);

		line(c, left, cy, left + width, cy);
		line(c, cx, top, cx, top + height);

		drawArrow(ctx[SPEEDCANVAS], cx, cy, curstatus.x, cy, { color: '#0056b3' })
		drawArrow(ctx[SPEEDCANVAS], cx, cy, cx, curstatus.y, { color: '#0056b3' })
	}

	function redrawInfo() {

	}

	function showOscStatus(s) {
		curOscStatus = s;
		let c = ctx[CURSORCANVAS];
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
		c.arc(lx, ly, 3, 0, 2*Math.PI);
		c.stroke();
		c.fill();

		if (!dragging) {
			//if (s.speedx != 0 && s.speedy != 0) {
			let gfx = s.speedx / waves.x.data.length;
			let gfy = -s.speedy / waves.y.data.length;
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
		let s = Object.assign({}, curstatus, curOscStatus);
		function getVal(k) {
			if (typeof (s[k]) == 'number') return s[k].toFixed(4);
			return s[k];
		}
		let txt = Object.keys(s).map(x => `${x.padStart(10, ' ')}: ${getVal(x)}`).join('\n');
		$('.debug-monitor').text(txt);

	}

	function showInfo(txt) {
		let c = ctx[INFOCANVAS];
		c.font = '30px sans-serif';
		c.fillStyle = '#0056b3';
		let x = 20 + space.left;
		let y = 50 + space.top;
		c.clearRect(0, 0, w, w);
		for (let line of txt.split('\n')) {
			c.fillText(line, x, y);
			y += 50;
		}
	}

	function setMode(mode) {

		$('.padmode').removeClass('on');
		$('.padmode[data-mode="' + mode + '"]').addClass('on');
		if (!modes[mode])
			return;
		padStatus.mode = mode;
		curstatus.mode = mode;
		canvases[SPEEDCANVAS].toggleClass('hidden', mode != 'speed');
		canvases[CURSORCANVAS].toggleClass('hidden', false);

		checkStatusChange();
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
		setStatus: x => Object.assign(padStatus, x)
	}
})();