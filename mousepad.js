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
	const VCANVAS = 1;
	const CURSORCANVAS = 3;

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
		canvases[VCANVAS].hide();
	}


	$(document).on("keydown keyup", function (e) {
		switch (e.key) {
			case "Shift":
				savestatus();
				curstatus.shift = e.type === "keydown";
				update();
				break;
			case "Control":
				savestatus();
				curstatus.control = e.type === "keydown";
				update();
				break;
			case "Alt":
				savestatus();
				curstatus.alt = e.type === "keydown";
				update();
				break;
			case "Meta": // Windows su PC, Command su Mac
				savestatus();
				curstatus.meta = e.type === "keydown";
				update();
		}
	});

	$(document).on("mousemove click", function (evt) {
		let where = 'out';
		let canvas = canvases[0];
		let x = mousex = evt.clientX - canvas.offset().left;
		let y = mousey = evt.clientY - canvas.offset().top;
		if (leftband.contains(x,y))
			where = 'left';
		else if (topband.contains(x,y))
			where = 'top';
		else if (space.contains(x,y))
			where = 'in';

		curstatus.left = evt.buttons & 1;
		curstatus.right = evt.buttons & 2;
		if (curstatus.where!=where || curstatus.x!=x || curstatus.y!=y) {
			savestatus();
			curstatus.x = x;
			curstatus.y = y;
			curstatus.where = where;
			update();
		}
	});

	const M_LEFT=1;
	const M_RIGHT=2;
	const M_SHIFT=4;
	const M_CONTROL=8;
	const M_ALT=16;
	const M_META = 32;
	const M_LEFTBAR = 64;
	const M_TOPBAR = 128;
	const M_CENTER = 256;
	const kmask = c=> 
		(c.left?M_LEFT:0) +
		(c.right?M_RIGHT:0) +
		(c.shift?M_SHIFT:0) +
		(c.control?M_CONTROL:0) +
		(c.alt?M_ALT:0) +
		(c.meta?M_META:0) +
		(c.where=='left'?M_LEFTBAR:0) +
		(c.where=='top'?M_TOPBAR:0) +
		(c.where=='in'?M_CENTER:0);

	const isCursorView = (c)=>kmask(c) == M_CENTER;
	const isCursorSet = (c)=>kmask(c) == M_CENTER+M_LEFT;
	
	function update() {
		//console.log('update', curstatus.shift, curstatus.where);
		if (curstatus.shift && !oldstatus.shift)
			canvases[VCANVAS].show();
		
		if (!curstatus.shift  && oldstatus.shift)
			canvases[VCANVAS].hide();
		
		let m = kmask(curstatus);
		//console.log(m);
		let oldm = kmask(oldstatus);
		if (isCursorSet(curstatus)) {
			canvases[CURSORCANVAS].show();
			let normx = (curstatus.x - space.left)/space.width;
			let normy = (curstatus.y - space.top)/space.height;
			vocoderWorker.postMessage({ action: 'set', value: { posx: normx, posy: normy } })
		}
		// let canvas = canvases[0];
		// let x = mousex = evt.clientX - canvas.offset().left;
		// let y = mousey = evt.clientY - canvas.offset().top;
		// let mode = $('#move-mode').val();

		// if (evt.shiftKey) {
		// 	canvases[VCANVAS].show();
		// 	redrawKnob();
		// 	mode = 'vxvy';
		// }
		// else {
		// 	mode = 'xy';
		// 	canvases[VCANVAS].hide();
		// }
		// if (!evt.buttons)
		// 	return;

		// if (mmcount++ > 100) {
		// 	mmcount = 0;
		// 	console.log({ evt });
		// 	window.evt = evt;
		// }
		// if (mode == 'xy') {
		// 	if (oscillator) {
		// 		let normx = (x - space.left) / space.width;
		// 		let normy = (y - space.top) / space.height;
		// 		console.log(normx, normy);
		// 		oscillator.port.postMessage({ action: 'set', value: { posx: normx, posy: normy } });
		// 	}
		// }

		// if (mode == 'vxvy') {
		// 	if (oscillator) {
		// 		let normx = (x - space.cx) / (space.width / 2);
		// 		let normy = (y - space.cy) / (space.height / 2);
		// 		let rad = Math.sqrt(normx * normx + normy * normy);
		// 		let alpha = Math.atan2(normy, normx);
		// 		rad = Math.pow(rad, 20);
		// 		oscillator.port.postMessage({
		// 			action: 'set',
		// 			value: {
		// 				fposx: rad * Math.cos(alpha),
		// 				fposy: rad * Math.sin(alpha),
		// 			}
		// 		});
		// 	}
		// }
		
	}

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
		r.contains = (x,y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
		return r;
	}

	function reposition() {
		let container = $('.arena');
		w = Math.min(container.width(), container.height())-5;
		let left = (container.width() - w) / 2;
		let top = (container.height() - w) / 2;
		top=0;
		container.empty();

		topband = rect(BANDW, 0, w - BANDW, BANDW);
		leftband = rect(0, BANDW, BANDW, w - BANDW);
		space = rect(BANDW, BANDW, w - BANDW, w - BANDW);

		for (let i = 0; i < NCANVAS; i++) {
			canvases[i] = $(`<canvas 
				id="mousepad${i}" 
				class="mousepad" 
				width="${w}" height="${w}" 
				style="left:${left}px;top:${top}px;width:${w}px;height:${w}px; z-index:${100 + i * 10}"></canvas>`)
				.appendTo(container)
				// .on('mousemove', evt => onMouseMove(evt))
				// .on('click', evt => onMouseClick(evt));

			ctx[i] = canvases[i][0].getContext('2d');
			ctx[i].clearRect(0, 0, w, w)
		}
		redraw();
	}

	function redraw() {
		clearWave();
		ctx[WAVECANVAS].clearRect(0,0,w,w);
		redrawBandWave('x');
		redrawBandWave('y');
		redrawCenterWave('x');
		redrawCenterWave('y');
		redrawKnob();
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
		let globalrange = globalmax-globalmin;
		if (globalrange==0)
			globalrange = 1;

		return { min, max, globalmin, globalmax,globalrange}
	}

	function redrawBandWave(index) {
		let c = ctx[WAVECANVAS];
		let data = waves[index].data;
		if (!data)
			return;
		let len = data.length;
		let left = BANDW, right = w, extent = w - BANDW;
		let {min, max, globalmin, globalmax, globalrange} = getMinMax(data, extent);
		let v0 = BANDW;
		let v1 = 0;
		//c.clearRect(0,0,w,w);
		c.lineWidth = 1;
		c.strokeStyle = 'black';

		let gmin = min.map(v=>v0 + (v - globalmin) * (v1 - v0) / globalrange);
		let gmax = max.map(v=>v0 + (v - globalmin) * (v1 - v0) / globalrange);
		for (let i = 0; i < extent; i++) {
			c.beginPath();
			if (index == 'x') {
				c.moveTo(left + i, gmin[i]);
				c.lineTo(left + i, gmax[i]);
			}
			else {
				c.moveTo(gmin[i], left + i);
				c.lineTo(gmax[i], left + i);

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
		
		let data = waves[index].data.map(x=>Math.abs(x));
		let len = data.length;

		let extent = space.width;
		let {min, max, globalmin, globalmax, globalrange} = getMinMax(data, extent);
		let v0 = 0;
		let v1 = 1;
		//c.clearRect(0,0,w,w);
		c.lineWidth = 1;
		c.strokeStyle = 'black';

		let alphamax = max.map(v=>v/globalmax);
		for (let i = 0; i < extent; i++) {
			let alpha = alphamax[i];
			alpha = Math.pow(alpha*alpha*alpha, 2);
			c.globalAlpha = alpha;
			c.beginPath();
			if (index == 'x') {
				c.moveTo(space.left + i, space.top);
				c.lineTo(space.left + i, space.bottom);
			}
			else {
				c.moveTo(space.left, space.top + i);
				c.lineTo(space.right, space.top + i);

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

	function redrawKnob() {
		let { left, top, width, height, cx, cy } = space;
		let c = ctx[VCANVAS];
		c.lineWidth = 1;
		c.strokeStyle = '#808080';
		c.clearRect(0, 0, w, w);

		line(c, left, cy, left + width, cy);
		line(c, cx, top, cx, top + height);

		c.beginPath();
		// draw *1 circle
		c.arc(cx, cy, width / 4, 0, 2 * Math.PI);
		c.stroke();

		c.strokeStyle = '#00a000';
		line(c, cx, cy, mousex, mousey);


	}

	function redrawInfo() {

	}

	function setPos(x, y) {
		let c = ctx[CURSORCANVAS];
		c.clearRect(0, 0, w, w);
		c.lineWidth = 1;

		c.strokeStyle = '#008000';
		let { left, top, width, height } = space;
		c.beginPath();
		c.moveTo(left + x * width, top);
		c.lineTo(left + x * width, top + height);
		c.stroke();
		c.beginPath();
		c.moveTo(left, top + y * height);
		c.lineTo(left + width, top + y * height);
		c.stroke();

	}

	// let mmcount = 0;
	// function onMouseClick(evt) {
	// 	evt.stopPropagation();
	// 	onMouseMove(evt);
	// }

	// function onMouseMove(evt) {
	// 	evt.stopPropagation();
	// 	let canvas = canvases[0];
	// 	let x = mousex = evt.clientX - canvas.offset().left;
	// 	let y = mousey = evt.clientY - canvas.offset().top;
	// 	let mode = $('#move-mode').val();

	// 	if (evt.shiftKey) {
	// 		canvases[VCANVAS].show();
	// 		redrawKnob();
	// 		mode = 'vxvy';
	// 	}
	// 	else {
	// 		mode = 'xy';
	// 		canvases[VCANVAS].hide();
	// 	}
	// 	if (!evt.buttons)
	// 		return;

	// 	if (mmcount++ > 100) {
	// 		mmcount = 0;
	// 		console.log({ evt });
	// 		window.evt = evt;
	// 	}
	// 	if (mode == 'xy') {
	// 		if (oscillator) {
	// 			let normx = (x - space.left) / space.width;
	// 			let normy = (y - space.top) / space.height;
	// 			console.log(normx, normy);
	// 			oscillator.port.postMessage({ action: 'set', value: { posx: normx, posy: normy } });
	// 		}
	// 	}

	// 	if (mode == 'vxvy') {
	// 		if (oscillator) {
	// 			let normx = (x - space.cx) / (space.width / 2);
	// 			let normy = (y - space.cy) / (space.height / 2);
	// 			let rad = Math.sqrt(normx * normx + normy * normy);
	// 			let alpha = Math.atan2(normy, normx);
	// 			rad = Math.pow(rad, 20);
	// 			oscillator.port.postMessage({
	// 				action: 'set',
	// 				value: {
	// 					fposx: rad * Math.cos(alpha),
	// 					fposy: rad * Math.sin(alpha),
	// 				}
	// 			});
	// 		}
	// 	}

	// }





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
		redrawWave: redrawBandWave,
		redrawKnob,
		redrawInfo,
		setWave,
		setPos
	}
})();