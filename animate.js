animate = (function () {
    function init() {
        requestAnimationFrame(doit);

    }

    function doit(time) {
        //...
        console.log('doit');

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