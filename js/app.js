const app = {
    questions: [],
    answers: {},
    currentIndex: 0,
    slideDirection: '', // 记录滑动方向用于播放动画
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

    // --- 优化：手势滑动逻辑 ---
    initSwipeGesture() {
        let touchstartX = 0;
        let touchstartY = 0;
        const threshold = 40; // 灵敏度大幅提升：只需滑动 40 像素即可触发
        
        document.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
            touchstartY = e.changedTouches[0].screenY;
        }, {passive: true});

        document.addEventListener('touchend', e => {
            const touchendX = e.changedTouches[0].screenX;
            const touchendY = e.changedTouches[0].screenY;
            
            // 防误触：判断是横向滑还是纵向滚网页
            if (Math.abs(touchendX - touchstartX) > Math.abs(touchendY - touchstartY)) {
                if (touchstartX - touchendX > threshold) {
                    // 向左滑：下一题 或 跳过
                    const ans = this.answers[this.questions[this.currentIndex].Number];
                    if (ans && ans !== 'skip') {
                        this.goNext();
                    } else {
                        this.skipQuestion();
                    }
                }
                if (touchendX - touchstartX > threshold) {
                    // 向右滑：上一题
                    this.goPrev();
                }
            }
        }, {passive: true});
    },

    async loadFromGist() {
        try {
            // 【关键修改】：加入时间戳 (t=...) 和 no-cache 请求头，强制 GitHub 不准用旧缓存
            const url = `https://api.github.com/gists/${this.gistConfig.id}?t=${new Date().getTime()}`;
            const res = await fetch(url, {
                headers: { 
                    'Authorization': `token ${this.gistConfig.token}`,
                    'Cache-Control': 'no-cache'
                }
            });
            if (!res.ok) throw new Error("验证失败或Token不正确");
            const data = await res.json();
            const content = data.files['ipip_answers.json'].content;
            this.answers = JSON.parse(content);
            localStorage.setItem('ipip_answers', content);
            console.log("✅ 云端同步成功（已绕过缓存）");
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

    // --- 彻底解决浏览器拦截：漂亮的自定义弹窗 ---
    setupGist() {
        // 先移除可能残余的旧弹窗
        let oldModal = document.getElementById('gist-modal');
        if (oldModal) oldModal.remove();

        const modalHtml = `
        <div id="gist-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; display:flex; justify-content:center; align-items:center;">
            <div style="background:#fff; padding:25px; border-radius:16px; width:85%; max-width:400px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                <h3 style="margin-top:0; font-size:20px; color:#111;">☁️ 配置云同步</h3>
                <p style="font-size:14px; color:#666; margin-bottom: 15px;">请输入配置以打通云端数据库：</p>
                <input type="text" id="g-id" placeholder="Gist ID" value="${this.gistConfig.id}" style="width:100%; padding:12px; margin-bottom:15px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box; font-size:14px;">
                <input type="text" id="g-token" placeholder="GitHub Token (ghp_...)" value="${this.gistConfig.token}" style="width:100%; padding:12px; margin-bottom:20px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box; font-size:14px;">
                <div style="display:flex; justify-content:flex-end; gap:12px;">
                    <button onclick="document.getElementById('gist-modal').remove()" style="padding:10px 18px; border:none; background:#f0f0f0; border-radius:8px; cursor:pointer; font-size:14px; color:#555;">取消</button>
                    <button onclick="app.saveGistConfig()" style="padding:10px 18px; border:none; background:#2196f3; color:#fff; border-radius:8px; cursor:pointer; font-size:14px; font-weight:bold;">保存并刷新</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    saveGistConfig() {
        const id = document.getElementById('g-id').value.trim();
        const token = document.getElementById('g-token').value.trim();
        if (id && token) {
            localStorage.setItem('gist_id', id);
            localStorage.setItem('gist_token', token);
            alert("✅ 配置保存成功！马上刷新并同步。");
            location.reload();
        } else {
            alert("❌ ID 和 Token 不能为空！");
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

        let html = `
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
        
        const card = document.getElementById('question-card');
        card.innerHTML = html;

        // --- 触发动画的核心逻辑 ---
        card.classList.remove('slide-in-right', 'slide-in-left', 'fade-in');
        void card.offsetWidth; // 魔法代码：强制浏览器重绘以触发动画
        
        if (this.slideDirection === 'left') {
            card.classList.add('slide-in-right'); // 题目从右侧滑进（下一题）
        } else if (this.slideDirection === 'right') {
            card.classList.add('slide-in-left'); // 题目从左侧滑进（上一题）
        } else {
            card.classList.add('fade-in'); // 第一次加载时仅淡入
        }
        this.slideDirection = ''; // 播放完动画后重置方向
        // -------------------------

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

    goPrev() { 
        if(this.currentIndex > 0) { 
            this.currentIndex--; 
            this.slideDirection = 'right'; // 记录动作方向为向右回退
            this.renderQuestion(); 
        } 
    },
    
    goNext() { 
        this.currentIndex++; 
        this.slideDirection = 'left'; // 记录动作方向为向左前进
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