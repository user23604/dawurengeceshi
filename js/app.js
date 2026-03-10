const app = {
    questions: [],
    answers: {},
    currentIndex: 0,
    domainMap: { 'N':'神经质', 'E':'外向性', 'O':'开放性', 'A':'宜人性', 'C':'尽责性' },
    
    gistConfig: {
        id: localStorage.getItem('gist_id') || '',
        token: localStorage.getItem('gist_token') || ''
    },

    async init() {
        // 暗号逻辑
        const urlParams = new URLSearchParams(window.location.search);
        const keyFromUrl = urlParams.get('key');
        const CORRECT_KEY = '11115555';

        if (keyFromUrl === CORRECT_KEY) localStorage.setItem('access_key', keyFromUrl);

        if (localStorage.getItem('access_key') !== CORRECT_KEY) {
            document.body.innerHTML = `
                <div style="text-align:center; margin-top:100px; font-family:sans-serif; padding: 20px;">
                    <h2>🔒 受保护的内容</h2>
                    <p style="color:#666; margin-bottom:20px;">请输入暗号进入测试：</p>
                    <input type="password" id="pwd" style="padding:12px; width:80%; max-width:200px; border-radius:5px; border:1px solid #ccc; font-size:16px;">
                    <br><br>
                    <button onclick="const k=document.getElementById('pwd').value; if(k==='${CORRECT_KEY}'){localStorage.setItem('access_key',k); location.reload();}else{alert('密码错误');}" style="padding:12px 30px; cursor:pointer; background:#2196f3; color:#fff; border:none; border-radius:5px; font-size:16px;">进入</button>
                </div>`;
            return;
        }

        // 注册滑动事件
        this.initSwipeGesture();

        try {
            const response = await fetch('data/questions.json');
            this.questions = await response.json();
            
            if (this.gistConfig.id && this.gistConfig.token) {
                await this.loadFromGist();
            } else {
                this.answers = JSON.parse(localStorage.getItem('ipip_answers')) || {};
            }
            
            this.currentIndex = this.questions.findIndex(q => !this.answers[q.Number] && this.answers[q.Number] !== 'skip');
            if(this.currentIndex === -1) this.currentIndex = this.questions.length - 1;

            this.initProgressBar();
            this.renderQuestion();
        } catch (error) {
            console.error(error);
            document.getElementById('question-card').innerHTML = `<div style="color:red; text-align:center;">数据加载失败。<br>${error}</div>`;
        }
    },

    // --- 新增：手势滑动逻辑 ---
    initSwipeGesture() {
        let touchstartX = 0;
        let touchstartY = 0;
        
        document.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
            touchstartY = e.changedTouches[0].screenY;
        }, {passive: true});

        document.addEventListener('touchend', e => {
            const touchendX = e.changedTouches[0].screenX;
            const touchendY = e.changedTouches[0].screenY;
            
            // 防误触：判断是横向滑还是纵向滚网页
            if (Math.abs(touchendX - touchstartX) > Math.abs(touchendY - touchstartY)) {
                // 滑动距离超过 80 像素触发
                if (touchendX < touchstartX - 80) {
                    // 向左滑：如果有答案则下一题，没答案则视为跳过
                    const ans = this.answers[this.questions[this.currentIndex].Number];
                    if (ans && ans !== 'skip') {
                        this.goNext();
                    } else {
                        this.skipQuestion();
                    }
                }
                if (touchendX > touchstartX + 80) {
                    // 向右滑：上一题
                    this.goPrev();
                }
            }
        }, {passive: true});
    },

    async loadFromGist() {
        try {
            const res = await fetch(`https://api.github.com/gists/${this.gistConfig.id}`, {
                headers: { 'Authorization': `token ${this.gistConfig.token}` }
            });
            if (!res.ok) throw new Error("验证失败");
            const data = await res.json();
            const content = data.files['ipip_answers.json'].content;
            this.answers = JSON.parse(content);
            localStorage.setItem('ipip_answers', content);
        } catch (e) {
            console.error("云端加载失败", e);
            this.answers = JSON.parse(localStorage.getItem('ipip_answers')) || {};
        }
    },

    async saveToGist() {
        if (!this.gistConfig.id || !this.gistConfig.token) return;
        try {
            await fetch(`https://api.github.com/gists/${this.gistConfig.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `token ${this.gistConfig.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { 'ipip_answers.json': { content: JSON.stringify(this.answers) } } })
            });
        } catch (e) { console.error("云端保存失败", e); }
    },

    setupGist() {
        const id = prompt("请输入你的 Gist ID:", this.gistConfig.id);
        const token = prompt("请输入你的 GitHub Token (ghp_开头):", this.gistConfig.token);
        if (id && token) {
            localStorage.setItem('gist_id', id);
            localStorage.setItem('gist_token', token);
            alert("配置保存成功！页面即将刷新并加载云端进度。");
            location.reload();
        }
    },

    initProgressBar() {
        let html = '';
        for(let i = 0; i < this.questions.length; i++) html += `<div class="prog-seg" id="seg-${this.questions[i].Number}"></div>`;
        document.getElementById('progress-bar').innerHTML = html;
    },

    renderQuestion() {
        if (this.currentIndex >= this.questions.length) return this.showResults();

        const q = this.questions[this.currentIndex];
        const currentAnswer = this.answers[q.Number];
        const labels = { 1: "非常不同意", 3: "一般/不确定", 5: "非常同意" };

        document.getElementById('question-card').innerHTML = `
            <div class="q-number">题目进度： ${this.currentIndex + 1} / ${this.questions.length}</div>
            <div class="q-title">${q.Item}</div>
            <div class="q-anchor">${q.Anchor}</div>
            <div class="options-area">
                <div class="row-half">
                    ${[1.5, 2.5, 3.5, 4.5].map(v => `<div class="opt-btn ${currentAnswer === v ? 'selected' : ''}" onclick="app.selectOption(${q.Number}, ${v}, this)">${v}</div>`).join('')}
                </div>
                <div class="row-int">
                    ${[1, 2, 3, 4, 5].map(v => `<div class="opt-btn ${currentAnswer === v ? 'selected' : ''}" onclick="app.selectOption(${q.Number}, ${v}, this)">${v} ${labels[v] ? `<span class="label">${labels[v]}</span>` : `<span class="label" style="opacity:0;">占位</span>`}</div>`).join('')}
                </div>
            </div>
        `;
        
        document.getElementById('prev-btn').style.visibility = (this.currentIndex === 0) ? 'hidden' : 'visible';
        if (currentAnswer && currentAnswer !== 'skip') {
            document.getElementById('next-btn').style.display = 'block';
            document.getElementById('skip-btn').style.display = 'none';
        } else {
            document.getElementById('next-btn').style.display = (currentAnswer === 'skip') ? 'block' : 'none';
            document.getElementById('skip-btn').style.display = 'block';
        }
        this.updateProgress();
    },

    selectOption(qNumber, value, element) {
        this.answers[qNumber] = value;
        localStorage.setItem('ipip_answers', JSON.stringify(this.answers));
        document.querySelectorAll('.opt-btn').forEach(btn => btn.classList.remove('selected'));
        element.classList.add('selected');
        this.updateProgress();
        this.saveToGist(); // 后台静默保存到云端
        setTimeout(() => this.goNext(), 300);
    },

    skipQuestion() {
        this.answers[this.questions[this.currentIndex].Number] = 'skip';
        localStorage.setItem('ipip_answers', JSON.stringify(this.answers));
        this.saveToGist(); // 同步跳过状态到云端
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
            if (ans === 'skip') seg.classList.add('skip');
            else if (ans !== undefined) { seg.classList.add('done'); answeredCount++; }
        });
        document.getElementById('progress-text').innerText = `已答 ${answeredCount} / ${this.questions.length} 题`;
    },

    exportSaveCode() {
        if (Object.keys(this.answers).length === 0) return alert("暂无记录！");
        const code = btoa(JSON.stringify(this.answers));
        navigator.clipboard.writeText(code).then(() => alert("✅ 进度码已复制！")).catch(() => prompt("手动复制：", code));
    },

    importSaveCode() {
        const code = prompt("粘贴进度码：");
        if (!code) return;
        try {
            this.answers = JSON.parse(atob(code));
            localStorage.setItem('ipip_answers', JSON.stringify(this.answers));
            this.saveToGist();
            location.reload(); 
        } catch (e) { alert("❌ 损坏的进度码"); }
    },

    calculateScores() {
        const itemResults = [];
        const domainStats = { N: {sum:0, count:0}, E: {sum:0, count:0}, O: {sum:0, count:0}, A: {sum:0, count:0}, C: {sum:0, count:0} };

        this.questions.forEach(q => {
            let ans = this.answers[q.Number];
            if (ans && ans !== 'skip') {
                let scored = q.Sign === "_" ? 6 - ans : ans;
                domainStats[q.Facet.charAt(0)].sum += scored;
                domainStats[q.Facet.charAt(0)].count += 1;
                itemResults.push({ Number: q.Number, Facet: q.Facet, Sign: q.Sign, Raw: ans, Scored: scored, Item: q.Item });
            }
        });
        return { itemResults, domainStats };
    },

    showResults() {
        document.getElementById('quiz-screen').style.display = 'none';
        document.getElementById('result-screen').style.display = 'block';
        const { domainStats } = this.calculateScores();
        let html = "";
        for (let d in domainStats) {
            if(domainStats[d].count > 0) html += `<tr><td><strong>${this.domainMap[d]}</strong></td><td>${domainStats[d].count}</td><td>${domainStats[d].sum}</td></tr>`;
        }
        document.querySelector('#domain-table tbody').innerHTML = html;
    },

    exportCSV() {
        let csv = "\uFEFF题号,分面,方向,原始分,计分,题目\n";
        this.calculateScores().itemResults.forEach(r => csv += `${r.Number},${r.Facet},${r.Sign},${r.Raw},${r.Scored},${r.Item.replace(/,/g, "，")}\n`);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        link.download = "IPIP_NEO_Results.csv";
        link.click();
    }
};

window.addEventListener('DOMContentLoaded', () => app.init());