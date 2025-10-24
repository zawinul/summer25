
function calcolaProfiloSpettrale(fftMagnitudes, resolution) {
    const LEFTSTEPS = 3;
    const RIGHTSTEPS = fftMagnitudes.length;
    const steps = LEFTSTEPS * Math.pow(RIGHTSTEPS/LEFTSTEPS, resolution);
    const fact = Math.log(fftMagnitudes.length)/Math.log(steps);
    if (calcolaProfiloSpettrale.oldres!=resolution) {
        console.log({steps, fact});
        calcolaProfiloSpettrale.oldres = resolution;
    }
    let stops = [0,1], curstop = 1;
    let x = fftMagnitudes;
    while(true) {
        curstop = Math.round(Math.max(curstop+1, curstop * fact));
        curstop = Math.min(curstop, x.length);
        stops.push(curstop);
        if (curstop >= x.length) 
            break;
    }
    let avg = new Array(stops.length).fill(0);
    let max = new Array(stops.length).fill(0);
    curstop = 0;
    for(let i=0;i<x.length;i++) {
        avg[curstop] += x[i];
        max[curstop] = Math.max(max[curstop], x[i]);
        if(i >= stops[curstop+1]) {
            avg[curstop] /= (stops[curstop+1] - stops[curstop]);
            curstop++;
        }
    }
    avg[curstop] = x[x.length-1];
    max[curstop] = x[x.length-1];
    let ret = new Array(x.length).fill(0);
    currstop=0;
    let left=0, right=1;
    let yleft=avg[left], yright=avg[right];
    for(let i=0;i<x.length;i++) {
        if (i>=right) {
            currstop++;
            left=stops[currstop];
            right=stops[currstop+1];
            yleft=avg[currstop]
            yright=avg[currstop+1];
            yleft=max[currstop]
            yright=max[currstop+1];
        }
        let y = yleft + (yright - yleft) * (i - left) / (right - left);
        ret[i] = y;
    }
    return ret;
}
calcolaProfiloSpettrale.oldres = -1;
/*
// Esempio di utilizzo:

// Supponiamo di avere le magnitudini della FFT in un array
// (qui generiamo dati casuali per l'esempio)
const magnitudiniFFT = new Float32Array(4096);
for (let i = 0; i < 2048; i++) {
    // Simuliamo dei picchi spettrali
    if (i > 100 && i < 120) magnitudiniFFT[i] = Math.random() * 0.8 + 0.1;
    if (i > 500 && i < 530) magnitudiniFFT[i] = Math.random() * 0.6 + 0.1;
    if (i > 1500 && i < 1550) magnitudiniFFT[i] = Math.random() * 0.4 + 0.05;
    else magnitudiniFFT[i] += Math.random() * 0.05;
}


const sampleRate = 44100;
const profiloSpettrale = calcolaProfiloSpettrale(magnitudiniFFT, sampleRate);

console.log("Profilo Spettrale Calcolato:", profiloSpettrale);
console.log("Lunghezza del Profilo:", profiloSpettrale.length);
*/