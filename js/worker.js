self.onmessage = function(e) {
    const { questions, ansObj, doubtObj, scoreMode } = e.data;
    const itemResults = [];
    const domainStats = {};
    const facetStats = {};

    questions.forEach(q => {
        let ans = ansObj[q.Number];
        if (ans !== undefined && ans !== 'skip') {
            // Reverse scoring bases
            let reverseBase = 6; // default for 1-5
            if (scoreMode === '0-3') reverseBase = 3;
            else if (scoreMode === '1-6') reverseBase = 7;
            
            let scored = q.Sign === "_" ? (reverseBase - ans) : ans;
            
            // Domain stats (use full domain string as key)
            const dCode = q.Domain || (q.Facet ? q.Facet.charAt(0) : 'Other');
            if (!domainStats[dCode]) domainStats[dCode] = { sum: 0, count: 0 };
            domainStats[dCode].sum += scored;
            domainStats[dCode].count += 1;
            
            // Facet stats — guard against undefined Facet
            const facetKey = q.Facet || dCode;
            if (!facetStats[facetKey]) facetStats[facetKey] = { sum: 0, count: 0 };
            facetStats[facetKey].sum += scored;
            facetStats[facetKey].count += 1;

            const doubt = doubtObj[q.Number] || '';
            itemResults.push({ Number: q.Number, Facet: facetKey, Sign: q.Sign, Raw: ans, Scored: scored, Doubt: doubt, Item: q.Item });
        }
    });

    // Send the results back
    self.postMessage({ itemResults, domainStats, facetStats });
};
