let customMerge = (function () {



    let initScript, procScript;
    let initFunction = function (cfg) { };
    let procFunction = function (cfg) {
        let { fx, ax, fy, ay,f, a, mix } = cfg;
        for (let i = 0; i < fx.length; i++) {
            f[i] = fx[i]*(1-mix) + fy[i]*mix;
            a[i] = ax[i]*(1-mix) + ay[i]*mix;
        }
    };
    let cfg = {
        global: {},
        t0: Date.now(),
        count: 0,
        mix: .5,
        s1: .5,
        s2: .5
    };

    function init(_fftSize, _overlap, _sampleRate) {
        cfg.fftSize = _fftSize;
        cfg.overlap = _overlap;
        cfg.sampleRate = _sampleRate;
        cfg.t0 = Date.now();
        cfg.fx = new Float32Array(cfg.fftSize).fill(0);
        cfg.fy = new Float32Array(cfg.fftSize).fill(0);
        cfg.ax = new Float32Array(cfg.fftSize).fill(0);
        cfg.ay = new Float32Array(cfg.fftSize).fill(0);
        cfg.f = new Float32Array(cfg.fftSize).fill(0);
        cfg.a = new Float32Array(cfg.fftSize).fill(0);
    }

    function setup(_initScript, _procScript) {
        try {
            const vars = Object.keys(cfg).join(', ');
            const initText = `let { ${vars} } = _;\n_=null;\n\n${initScript}\n`;
            const _initFunction = new Function('_', initText);

            const procText = `let { ${vars} } = _;\n_=null;\n\n${procScript}\n`;
            const _procFunction = new Function('_', procText);
            log('Custom merge setup', initScript, procScript);

            _initFunction(cfg);
            _procFunction(cfg);

            // tutto ok, salvo gli script originali (per debug o reset)
            initScript = _initScript;
            procScript = _procScript;
            initFunction = _initFunction;
            procFunction = _procFunction;
        }
        catch(e) {
            log('Errore in custom merge setup:', e);
        }
    };

    function doIt(frame1, frame2, outFrame, mousex, mousey, merge, slider1, slider2) {
        let magnitudes = outFrame.magnitudes;
        let {fx, fy, ax, ay, f, a} = cfg;
        cfg.mix = merge;
        cfg.s1 = slider1;
        cfg.s2 = slider2;
        for (let i = 0; i < magnitudes.length; i++) {
            let dph1 = frame1.deltaPh[i];
            let dph2 = frame2.deltaPh[i];

            fx[i] = calcolaFrequenzaDaDifferenzaFase(i, dph1);
            fy[i] = calcolaFrequenzaDaDifferenzaFase(i, dph2);
            ax[i] = frame1.magnitudes[i];
            ay[i] = frame2.magnitudes[i];
        }
        f.fill(0);
        a.fill(0);
        outFrame.magnitudes.fill(0);
        cfg.t = Date.now() - cfg.t0;
        cfg.count++;
        Object.assign(cfg, {
            mousex, mousey, merge, slider1, slider2,
        });
        procFunction(cfg);
        for (let i = 0; i < cfg.f.length; i++) {
            const [ band, phaseDelta ] = calcolaIndiceEDifferenzaFaseDaFrequenza(f[i]);
            const oldm = outFrame.magnitudes[band];
            if (oldm>0) {
                let d = (phaseDelta*a[i] + outFrame.deltaPh[band]*oldm)/(a[i]+oldm);
                d = normalize(d);
                outFrame.deltaPh[band] = d;
                outFrame.magnitudes[band] = a[i]+oldm;
            } else {
                outFrame.deltaPh[band] = phaseDelta;
                outFrame.magnitudes[band] = a[i];
            }
        }
    }

    return {
        init, setup, doIt
    }
})();