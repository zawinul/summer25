animate = (function () {
    function init() {
        requestAnimationFrame(doit);

    }

    function doit(time) {
        //...
        
        vocoderWorker.postMessage({
            type: 'req-spectral-data',
            transform: true
        });
        requestAnimationFrame(doit);
    }

    return {
        init
    }
})();