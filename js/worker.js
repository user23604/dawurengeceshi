// js/worker.js
// Web Worker for offloading heavy scoring calculations from the main UI thread

self.onmessage = function(e) {
    const { questions, ansObj, doubtObj } = e.data;
    const itemResults = [];
    const domainStats = { 
        N: {sum:0, count:0}, E: {sum:0, count:0}, 
        O: {sum:0, count:0}, A: {sum:0, count:0}, 
        C: {sum:0, count:0} 
    };
    const facetStats = {};

    questions.forEach(q => {
        let ans = ansObj[q.Number];
        if (ans && ans !== 'skip') {
            let scored = q.Sign === "_" ? 6 - ans : ans;
            
            // Domain stats
            domainStats[q.Facet.charAt(0)].sum += scored;
            domainStats[q.Facet.charAt(0)].count += 1;
            
            // Facet stats (e.g. N1, N2)
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
