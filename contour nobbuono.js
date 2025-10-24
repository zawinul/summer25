(function () {
    let fftSize, sampleRate, nSections,n;
    function initCountour(_fftSize, _sampleRate, _nSections) {
        n = fftSize = _fftSize;
        sampleRate = _sampleRate;
        nSections = _nSections;

    }

    function sectionAverages(yValues, bounds) {
        const N = yValues.length;

        function interpY(x) {
            if (x <= 0) return yValues[0];
            if (x >= n-1) return yValues[n-1];
            const left = Math.floor(x);
            const t = x - left;
            return yValues[left] * (1 - t) + yValues[left + 1] * t;
        }

        const results = [];

        for (let s = 0; s < bounds.length - 1; s++) {
            const xStart = bounds[s].x;
            const xEnd = bounds[s + 1].x;
            const yStart = interpY(xStart);
            const yEnd = interpY(xEnd);

            // Indici (posizioni reali, possono essere frazionarie)
            const iStart = xStart;
            const iEnd = xEnd;

            // Somma pesata (integrazione numerica a tratti lineari)
            let area = 0;
            let prevX = xStart;
            let prevY = yStart;
            const startIndex = Math.floor(iStart) + 1;
            const endIndex = Math.floor(iEnd);

            // Parti intere interne all'intervallo
            for (let i = startIndex; i <= endIndex; i++) {
                const x = i;
                const y = yValues[i];
                area += 0.5 * (prevY + y) * (x - prevX);
                prevX = x;
                prevY = y;
            }

            // Aggiungi l'ultimo tratto fino a xEnd
            area += 0.5 * (prevY + yEnd) * (xEnd - prevX);

            // Media = area / larghezza intervallo
            const avg = area / (xEnd - xStart);
            results.push({x:(xStart+xEnd)/2, y:avg});
        }

        return results;
    }

    function getCountour(data) {

    }
})();
