const app = {
    questions: [],
    answers: {},
    currentIndex: 0,
    domainMap: { 'N':'神经质', 'E':'外向性', 'O':'开放性', 'A':'宜人性', 'C':'尽责性' },

    async init() {
        try {
            const response = await fetch('data/questions.json');
            this.questions = await response.json();
            this.answers = JSON.parse(localStorage.getItem('ipip_answers')) || {};
            
            this.currentIndex = this.questions.findIndex(q => !this.answers[q.Number] && this.answers[q.Number] !== 'skip');
            if(this.currentIndex === -1) this.currentIndex = this.questions.length - 1;

            this.initProgressBar();
            this.renderQuestion();
        } catch (error) {
            document.getElementById('question-card').innerHTML = `<div style="color:red; text-align:center;">请在本地服务器环境下运行，或使用下方单文件打包版。<br>${error}</div>`;
        }
    },

    initProgressBar() {
        let html = '';
        for(let i = 0; i < this.questions.length; i++) {
            html += `<div class="prog-seg" id="seg-${this.questions[i].Number}"></div>`;
        }
        document.getElementById('progress-bar').innerHTML = html;
    },

    renderQuestion() {
        if (this.currentIndex >= this.questions.length) {
            this.showResults();
            return;
        }

        const q = this.questions[this.currentIndex];
        const currentAnswer = this.answers[q.Number];
        const labels = { 1: "非常不同意", 3: "一般/不确定", 5: "非常同意" };

        const html = `
            <div class="q-number">题目进度： ${this.currentIndex + 1} / ${this.questions.length}</div>
            <div class="q-title">${q.Item}</div>
            <div class="q-anchor">${q.Anchor}</div>
            <div class="options-area">
                <div class="row-half">
                    ${[1.5, 2.5, 3.5, 4.5].map(v => `
                        <div class="opt-btn ${currentAnswer === v ? 'selected' : ''}" onclick="app.selectOption(${q.Number}, ${v}, this)">${v}</div>
                    `).join('')}
                </div>
                <div class="row-int">
                    ${[1, 2, 3, 4, 5].map(v => `
                        <div class="opt-btn ${currentAnswer === v ? 'selected' : ''}" onclick="app.selectOption(${q.Number}, ${v}, this)">
                            ${v} ${labels[v] ? `<span class="label">${labels[v]}</span>` : `<span class="label" style="opacity:0;">占位</span>`}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        document.getElementById('question-card').innerHTML = html;
        
        document.getElementById('prev-btn').style.visibility = (this.currentIndex === 0) ? 'hidden' : 'visible';
        
        const nextBtn = document.getElementById('next-btn');
        const skipBtn = document.getElementById('skip-btn');
        
        if (currentAnswer && currentAnswer !== 'skip') {
            nextBtn.style.display = 'block';
            skipBtn.style.display = 'none';
        } else {
            nextBtn.style.display = (currentAnswer === 'skip') ? 'block' : 'none';
            skipBtn.style.display = 'block';
        }

        this.updateProgress();
    },

    selectOption(qNumber, value, element) {
        this.answers[qNumber] = value;
        localStorage.setItem('ipip_answers', JSON.stringify(this.answers));
        
        document.querySelectorAll('.opt-btn').forEach(btn => btn.classList.remove('selected'));
        element.classList.add('selected');
        
        this.updateProgress();
        setTimeout(() => this.goNext(), 300);
    },

    skipQuestion() {
        const qNumber = this.questions[this.currentIndex].Number;
        this.answers[qNumber] = 'skip';
        localStorage.setItem('ipip_answers', JSON.stringify(this.answers));
        this.goNext();
    },

    goPrev() { if(this.currentIndex > 0) { this.currentIndex--; this.renderQuestion(); } },
    
    goNext() { 
        this.currentIndex++; 
        if(this.currentIndex >= this.questions.length) this.showResults(); 
        else this.renderQuestion(); 
    },

    updateProgress() {
        let answeredCount = 0;
        this.questions.forEach(q => {
            const seg = document.getElementById(`seg-${q.Number}`);
            if(!seg) return;
            const ans = this.answers[q.Number];
            seg.className = 'prog-seg'; 
            if (ans === 'skip') {
                seg.classList.add('skip');
            } else if (ans !== undefined) {
                seg.classList.add('done');
                answeredCount++;
            }
        });
        document.getElementById('progress-text').innerText = `已答 ${answeredCount} / ${this.questions.length} 题`;
    },

    // ================= 新增：导入导出进度码功能 =================
    exportSaveCode() {
        if (Object.keys(this.answers).length === 0) {
            alert("你还没有答题记录哦！");
            return;
        }
        const saveCode = btoa(JSON.stringify(this.answers));
        navigator.clipboard.writeText(saveCode).then(() => {
            alert("✅ 进度码已复制到剪贴板！\n你可以通过微信发到手机上，在手机上点击【导入进度码】来恢复进度。");
        }).catch(() => {
            prompt("你的浏览器不支持自动复制，请手动复制下方代码：", saveCode);
        });
    },

    importSaveCode() {
        const code = prompt("请粘贴你的进度码：");
        if (!code) return;
        
        try {
            const importedAnswers = JSON.parse(atob(code));
            if (typeof importedAnswers === 'object') {
                this.answers = importedAnswers;
                localStorage.setItem('ipip_answers', JSON.stringify(this.answers));
                alert("🎉 进度恢复成功！页面将刷新加载新进度。");
                location.reload(); 
            }
        } catch (e) {
            alert("❌ 进度码格式不正确或已损坏！");
        }
    },
    // =========================================================

    calculateScores() {
        const itemResults = [];
        const domainStats = { N: {sum:0, count:0}, E: {sum:0, count:0}, O: {sum:0, count:0}, A: {sum:0, count:0}, C: {sum:0, count:0} };

        this.questions.forEach(q => {
            let ans = this.answers[q.Number];
            if (ans && ans !== 'skip') {
                let scored = q.Sign === "_" ? 6 - ans : ans;
                const domainLetter = q.Facet.charAt(0);
                if (domainStats[domainLetter]) {
                    domainStats[domainLetter].sum += scored;
                    domainStats[domainLetter].count += 1;
                }
                itemResults.push({ Number: q.Number, Facet: q.Facet, Sign: q.Sign, Raw: ans, Scored: scored, Item: q.Item });
            } else {
                itemResults.push({ Number: q.Number, Facet: q.Facet, Sign: q.Sign, Raw: 'Skipped', Scored: 'N/A', Item: q.Item });
            }
        });
        return { itemResults, domainStats };
    },

    showResults() {
        document.getElementById('quiz-screen').style.display = 'none';
        document.getElementById('result-screen').style.display = 'block';

        const { domainStats } = this.calculateScores();
        let domainHtml = "";
        for (let d in domainStats) {
            if(domainStats[d].count > 0) {
                let avg = (domainStats[d].sum / domainStats[d].count).toFixed(2);
                domainHtml += `<tr><td><strong>${this.domainMap[d]}</strong></td><td>${domainStats[d].sum}</td><td>${avg}</td></tr>`;
            }
        }
        document.querySelector('#domain-table tbody').innerHTML = domainHtml;
    },

    triggerDownload(content, filename, type) {
        const blob = new Blob([content], { type: type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    exportCSV() {
        const { itemResults } = this.calculateScores();
        let csv = "\uFEFF题号(Number),分面(Facet),方向(Sign),原始分(Raw),计分(Scored),题目(Item)\n";
        itemResults.forEach(r => csv += `${r.Number},${r.Facet},${r.Sign},${r.Raw},${r.Scored},${r.Item.replace(/,/g, "，")}\n`);
        this.triggerDownload(csv, "IPIP_NEO_Results.csv", "text/csv;charset=utf-8;");
    },

    exportJSON() {
        this.triggerDownload(JSON.stringify(this.calculateScores(), null, 2), "IPIP_NEO_Report.json", "application/json");
    },

    exportMarkdown() {
        const { domainStats } = this.calculateScores();
        let md = `# 大五人格测试结果\n\n| 特质 | 总分 | 平均分 |\n| :--- | :---: | :---: |\n`;
        for (let d in domainStats) {
            if(domainStats[d].count > 0) md += `| ${this.domainMap[d]} | ${domainStats[d].sum} | ${(domainStats[d].sum / domainStats[d].count).toFixed(2)} |\n`;
        }
        this.triggerDownload(md, "IPIP_NEO_AI_Prompt.md", "text/markdown;charset=utf-8;");
    }
};

window.addEventListener('DOMContentLoaded', () => app.init());