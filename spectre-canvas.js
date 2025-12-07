function spectreCanvas() {
    const jcanvas = $('#mousepad-canvas-spectre');
    const canvas = jcanvas[0];
    const ctx = canvas.getContext('2d');
    const SIZE = jcanvas.width();
    const HANDLE_RADIUS = 6;
    const CLICK_TOLERANCE = 10; // Pixel di tolleranza per selezionare linee/punti

    let points = [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
    ];

    let draggingIndex = -1;
    let hoverIndex = -1; // Per cambiare cursore quando si è sopra un punto

    // --- Funzioni di Utilità per le Coordinate ---

    // Converte da coordinate normalizzate (0-1) a coordinate schermo (0-700)
    // Nota: La Y dello schermo è invertita (0 è in alto)
    function toScreen(p) {
        return {
            x: p.x * SIZE,
            y: SIZE - (p.y * SIZE)
        };
    }

    // Converte da coordinate schermo a coordinate normalizzate
    function toMath(x, y) {
        return {
            x: Math.max(0, Math.min(1, x / SIZE)),
            y: Math.max(0, Math.min(1, (SIZE - y) / SIZE))
        };
    }

    // Calcola distanza euclidea tra due punti schermo
    function dist(p1, p2) {
        return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
    }

    // --- Funzioni Geometriche ---

    // Calcola la distanza di un punto P da un segmento AB
    // Restituisce anche il punto di proiezione se cade nel segmento
    function distToSegment(p, a, b) {
        const l2 = dist(a, b) ** 2;
        if (l2 === 0) return { d: dist(p, a), proj: a };

        // t = proiezione normalizzata sul segmento
        let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
        t = Math.max(0, Math.min(1, t));

        const proj = {
            x: a.x + t * (b.x - a.x),
            y: a.y + t * (b.y - a.y)
        };

        return { d: dist(p, proj), proj: proj, t: t };
    }

    // --- Rendering ---

    function drawGrid() {
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Disegna griglia 10x10
        for (let i = 1; i < 10; i++) {
            let pos = i * (SIZE / 10);
            // Verticali
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos, SIZE);
            // Orizzontali
            ctx.moveTo(0, pos);
            ctx.lineTo(SIZE, pos);
        }
        ctx.stroke();

        // Assi principali
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, SIZE, SIZE);
    }

    function draw() {
        ctx.clearRect(0, 0, SIZE, SIZE);

        drawGrid();

        // 1. Disegna la linea spezzata
        if (points.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#007BFF'; // Blu
            ctx.lineWidth = 3;

            const start = toScreen(points[0]);
            ctx.moveTo(start.x, start.y);

            for (let i = 1; i < points.length; i++) {
                const p = toScreen(points[i]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }

        // 2. Disegna gli handle (punti)
        points.forEach((p, index) => {
            const sc = toScreen(p);

            ctx.beginPath();
            ctx.arc(sc.x, sc.y, HANDLE_RADIUS, 0, Math.PI * 2);

            // Stile diverso se hover o dragging
            if (index === draggingIndex) {
                ctx.fillStyle = '#ff0000';
                ctx.scale = 1.2;
            } else if (index === hoverIndex) {
                ctx.fillStyle = '#ff4d4d';
            } else {
                ctx.fillStyle = 'white';
            }

            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#333';
            ctx.stroke();
        });
    }

    // --- Gestione Eventi Mouse ---

    canvas.addEventListener('mousedown', (e) => {
        console.log('spectre mousedown');
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Controlla se abbiamo cliccato su un punto esistente
        for (let i = 0; i < points.length; i++) {
            const sPoint = toScreen(points[i]);
            if (dist({ x: mouseX, y: mouseY }, sPoint) <= HANDLE_RADIUS + 2) {
                draggingIndex = i;
                return;
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        console.log('spectre mousemove');
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const mathPos = toMath(mouseX, mouseY);

        // Gestione Dragging
        if (draggingIndex !== -1) {
            // Aggiorna posizione
            let newX = mathPos.x;
            let newY = mathPos.y;

            // Vincoli asse X: non scavalcare i vicini
            // Se è il primo punto
            if (draggingIndex > 0) {
                newX = Math.max(newX, points[draggingIndex - 1].x + 0.001); // piccolo offset per evitare sovrapposizione esatta
            }
            // Se è l'ultimo punto
            if (draggingIndex < points.length - 1) {
                newX = Math.min(newX, points[draggingIndex + 1].x - 0.001);
            }

            points[draggingIndex].x = newX;
            points[draggingIndex].y = newY;

            draw();
            return;
        }

        // Gestione Hover (solo per cambiare cursore)
        hoverIndex = -1;
        let cursor = 'default';

        // Controllo hover sui punti
        for (let i = 0; i < points.length; i++) {
            const sPoint = toScreen(points[i]);
            if (dist({ x: mouseX, y: mouseY }, sPoint) <= HANDLE_RADIUS + 2) {
                hoverIndex = i;
                console.log('spectre hoverIndex', hoverIndex);
                cursor = 'pointer';
                break;
            }
        }

        // Se non siamo su un punto, controlliamo se siamo sulla linea (per suggerire aggiunta)
        if (hoverIndex === -1) {
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = toScreen(points[i]);
                const p2 = toScreen(points[i + 1]);
                const info = distToSegment({ x: mouseX, y: mouseY }, p1, p2);
                if (info.d < CLICK_TOLERANCE) {
                    cursor = 'copy'; // Icona "+" o simile
                    break;
                }
            }
        }

        canvas.style.cursor = cursor;
        draw();
    });

    canvas.addEventListener('mouseup', () => {
        console.log('spectre mouseup');
        draggingIndex = -1;
    });

    canvas.addEventListener('mouseleave', () => {
        console.log('spectre mouseleave');
        draggingIndex = -1;
        hoverIndex = -1;
        draw();
    });

    // Doppio click per Aggiungere o Rimuovere
    canvas.addEventListener('dblclick', (e) => {
        console.log('spectre dblclick');
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 1. Controllo Rimozione: Click su un punto?
        for (let i = 0; i < points.length; i++) {
            const sPoint = toScreen(points[i]);
            if (dist({ x: mouseX, y: mouseY }, sPoint) <= HANDLE_RADIUS + 5) {
                // Non rimuovere primo o ultimo
                if (i > 0 && i < points.length - 1) {
                    points.splice(i, 1);
                    hoverIndex = -1; // Reset hover
                    draw();
                }
                return; // Stop qui
            }
        }

        // 2. Controllo Aggiunta: Click su un segmento?
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = toScreen(points[i]);
            const p2 = toScreen(points[i + 1]);
            const info = distToSegment({ x: mouseX, y: mouseY }, p1, p2);

            if (info.d < CLICK_TOLERANCE) {
                // Trovato segmento. Calcoliamo la X e Y matematica del punto proiettato
                const newMathPoint = toMath(info.proj.x, info.proj.y);

                // Inseriamo il punto nell'array all'indice corretto
                points.splice(i + 1, 0, newMathPoint);
                draw();
                return;
            }
        }
    });

    // Disegno iniziale
    draw();
}

setTimeout(x=>mousepad.setMode('spectre'), 2000);