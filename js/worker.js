// js/worker.js
// Web Worker for offloading heavy scoring calculations from the main UI thread

self.onmessage = function(e) {
    const { questions, ansObj, doubtObj, scoreMode } = e.data;
    const is03 = (scoreMode === '0-3');
    const itemResults = [];
    const domainStats = {};
    const facetStats = {};

    questions.forEach(q => {
        let ans = ansObj[q.Number];
        if (ans !== undefined && ans !== 'skip') {
            // Reverse scoring: 6-ans for 1-5 scale, 3-ans for 0-3 scale
            let scored = q.Sign === "_" ? (is03 ? 3 - ans : 6 - ans) : ans;
            
            // Domain stats (use full domain string as key)
            const dCode = q.Domain || q.Facet.charAt(0);
            if (!domainStats[dCode]) domainStats[dCode] = { sum: 0, count: 0 };
            domainStats[dCode].sum += scored;
            domainStats[dCode].count += 1;
            
            // Facet stats (e.g. N1, N2 or "Impulsivity")
            if (!facetStats[q.Facet]) facetStats[q.Facet] = { sum: 0, count: 0 };
            facetStats[q.Facet].sum += scored;
            facetStats[q.Facet].count += 1;

            const doubt = doubtObj[q.Number] || '';
            itemResults.push({ Number: q.Number, Facet: q.Facet, Sign: q.Sign, Raw: ans, Scored: scored, Doubt: doubt, Item: q.Item });
        }
    });

    // Send the results back
    self.postMessage({ itemResults, domainStats, facetStats });
};
