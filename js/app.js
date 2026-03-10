const app = {
    questions: [],
    answers: {},
    currentIndex: 0,
    domainMap: { 'N':'神经质', 'E':'外向性', 'O':'开放性', 'A':'宜人性', 'C':'尽责性' },
    
    // Gist 配置信息（从本地存储读取）
    gistConfig: {
        id: localStorage.getItem('gist_id') || '',
        token: localStorage.getItem('gist_token') || ''
    },

    async init() {
        // 1. 暗号访问校验逻辑
        const urlParams = new URLSearchParams(window.location.search);
        const keyFromUrl = urlParams.get('key');
        const CORRECT_KEY = '11115555'; // 你的访问暗号

        if (keyFromUrl === CORRECT_KEY) {
            localStorage.setItem('access_key', keyFromUrl);
        }

        if (localStorage.getItem('access_key') !== CORRECT_KEY) {
            document.body.innerHTML = `
                <div style="text-align:center; margin-top:100px; font-family:sans-serif;">
                    <h1>🔒 受保护的内容</h1>
                    <p>请输入正确链接访问，或在下方输入暗号：</p>
                    <input type="password" id="pwd" style="padding:10px; border-radius:5px; border:1px solid #ccc;">
                    <button onclick="const k=document.getElementById('pwd').value; if(k==='${CORRECT_KEY}'){localStorage.setItem('access_key',k); location.reload();}else{alert('错误');}" style="padding:10px 20px; cursor:pointer;">进入</button>
                </div>`;
            return;
        }

        // 2. 加载基础题库和进度
        try {
            const response = await fetch('data/questions.json');
            this.questions = await response.json();
            
            // 优先尝试从 Gist 云端加载进度
            if (this.gistConfig.id && this.gistConfig.token) {
                console.log("正在尝试从云端同步进度...");
                await this.loadFromGist();
            } else {
                this.answers = JSON.parse(localStorage.getItem('ipip_answers')) || {};
            }
            
            // 定位到第一道未答题
            this.currentIndex = this.questions.findIndex(q => !this.answers[q.Number] && this.answers[q.Number] !== 'skip');
            if(this.currentIndex === -1) this.currentIndex = this.questions.length - 1;

            this.initProgressBar();
            this.renderQuestion();
        } catch (error) {
            document.getElementById('question-card').innerHTML = `<div style="color:red; text-align:center;">初始化失败，请检查题库路径或网络。<br>${error}</div>`;
        }
    },

    // --- Gist 云端同步：拉取数据 ---
    async loadFromGist() {
        try {
            const res = await fetch(`https://api.github.com/gists/${this.gistConfig.id}`, {
                headers: { 'Authorization': `token ${this.gistConfig.token}` }
            });
            if (!res.ok) throw new Error("Gist ID 或 Token 无效");
            const data = await res.json();
            const content = data.files['ipip_answers.json'].content;
            this.answers = JSON.parse(content);
            // 同步一份到本地做备份
            localStorage.setItem('ipip_answers', content);
            console.log("✅ 云端同步成功");
        } catch (e) {
            console.error("❌ 云端加载失败，使用本地备份", e);
            this.answers = JSON.parse(localStorage.getItem('ipip_answers')) || {};
        }
    },

    // --- Gist 云端同步：保存数据 (PATCH) ---
    async saveToGist() {
        if (!this.gistConfig.id || !this.gistConfig.token) return;
        try {
            await fetch(`https://api.github.com/gists/${this.gistConfig.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${this.gistConfig.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: {
                        'ipip_answers.json': {
                            content: JSON.stringify(this.answers)
                        }
                    }
                })
            });
            console.log("☁️ 进度已实时保存至云端");
        } catch (e) {
            console.error("❌ 云端保存失败", e);
        }
    },

    // --- 设置 Gist 弹窗 ---
    setupGist() {
        const id = prompt("请输入你的 Gist ID:", this.gistConfig.id);
        const token = prompt("请输入你的 GitHub Token:", this.gistConfig.token);
        if (id && token) {
            localStorage.setItem('gist_id', id);
            localStorage.setItem('gist_token', token);
            alert("配置已保存，正在刷新同步进度...");
            location.reload();
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
        
        // 自动触发云端同步（异步进行，不阻塞翻页）
        this.saveToGist();

        setTimeout(() => this.goNext(), 300);
    },

    skipQuestion() {
        const qNumber = this.questions[this.currentIndex].Number;
        this.answers[qNumber] = 'skip';
        localStorage.setItem('ipip_answers', JSON.stringify(this.answers));
        
        this.saveToGist(); // 同步跳过状态
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

    exportSaveCode() {
        if (Object.keys(this.answers).length === 0) {
            alert("你还没有答题记录哦！");
            return;
        }
        const saveCode = btoa(JSON.stringify(this.answers));
        navigator.clipboard.writeText(saveCode).then(() => {
            alert("✅ 进度码已复制到剪贴板！");
        }).catch(() => {
            prompt("请手动复制下方代码：", saveCode);
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
                this.saveToGist(); // 导入后顺便同步到云端
                alert("🎉 进度恢复成功！");
                location.reload(); 
            }
        } catch (e) {
            alert("❌ 进度码损坏！");
        }
    },

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
        let csv = "\uFEFF题号,分面,方向,原始分,计分,题目\n";
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