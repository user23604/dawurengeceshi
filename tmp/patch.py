import re

filepath = r"d:\Desktop\vscode-project\大五人格测试网站\dawurengeceshi-main\index.html"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add CSS
css_addition = """
        /* -- NEW STYLES -- */
        .top-nav { width: 100%; position: absolute; top: 0; left: 0; padding: 20px; z-index: 100; }
        .hamburger-btn { background: transparent; border: none; cursor: pointer; display: flex; flex-direction: column; gap: 5px; width: 30px; }
        .hamburger-btn span { display: block; width: 100%; height: 3px; background: #fff; border-radius: 2px; }
        .sidebar-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 990; display: none; opacity: 0; transition: opacity 0.3s; }
        .sidebar { position: fixed; top: 0; left: -250px; width: 250px; height: 100%; background: var(--card-bg); z-index: 999; transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1); border-right: 1px solid var(--card-border); backdrop-filter: blur(10px); display: flex; flex-direction: column; padding-top: 60px; text-align: left; }
        .sidebar-open .sidebar-overlay { display: block; opacity: 1; }
        .sidebar-open .sidebar { left: 0; }
        .sidebar-menu-item { padding: 15px 25px; color: var(--text-primary); text-decoration: none; font-size: 1.1rem; border-bottom: 1px solid var(--card-border); cursor: pointer; transition: background 0.3s; }
        .sidebar-menu-item:hover { background: rgba(255,255,255,0.05); color: var(--accent); }
        #user-manage-view, #user-detail-view { display: none; width: 100%; }
        .m-toolbar { display: flex; gap: 10px; margin-bottom: 20px; }
        .m-btn-add { flex: 1; background: var(--accent); color: #fff; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; }
        .m-btn-add:hover { background: var(--accent-hover); }
        .m-search { flex: 2; padding: 12px 15px; border-radius: 10px; border: 1px solid var(--card-border); background: var(--card-bg); color: #fff; font-size: 1rem; outline: none; }
        .m-search:focus { border-color: var(--accent); }
        .user-list { display: flex; flex-direction: column; gap: 10px; max-height: 60vh; overflow-y: auto; text-align: left; }
        .user-row { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; padding: 15px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: transform 0.2s; }
        .user-row:hover { transform: translateY(-2px); border-color: var(--accent); }
        .u-nick { font-weight: bold; font-size: 1.1rem; }
        .u-prog { font-size: 0.85rem; color: var(--text-secondary); margin-top: 5px; }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 1000; display: none; align-items: center; justify-content: center; }
        .modal { background: var(--bg-color); border: 1px solid var(--card-border); padding: 25px; border-radius: 16px; width: 90%; max-width: 400px; text-align: center; }
        .modal h3 { margin-bottom: 15px; }
        .modal input { width: 100%; padding: 12px; margin-bottom: 15px; border-radius: 8px; border: 1px solid var(--card-border); background: rgba(255,255,255,0.05); color: #fff; outline: none; text-align: center; font-size: 1rem; }
        .modal .btn-group { display: flex; gap: 10px; }
        .modal .btn-group button { flex: 1; padding: 10px; border-radius: 8px; border: none; cursor: pointer; font-weight: bold; }
        .btn-cancel { background: rgba(255,255,255,0.1); color: #fff; }
        .btn-confirm { background: var(--accent); color: #fff; }
        .btn-danger { background: #ef4444; color: #fff; padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; }
        /* -- END NEW STYLES -- */
"""

content = content.replace("</style>", css_addition + "</style>")

# 2. Add Sidebar & Modals, Replace container
body_html = """
    <!-- Nickname Prompt Modal -->
    <div id="nickname-modal" class="modal-overlay">
        <div class="modal">
            <h3>欢迎！请设置您的昵称</h3>
            <p style="color:var(--text-secondary); margin-bottom:15px; font-size:0.9rem;">这是您第一次登录，我们需要一个称呼。</p>
            <input type="text" id="nickname-input" placeholder="输入您的昵称" autocomplete="off">
            <button class="btn-enter" onclick="saveNicknameAndEnter()">开始测试</button>
        </div>
    </div>

    <!-- Add User Modal -->
    <div id="add-user-modal" class="modal-overlay">
        <div class="modal">
            <h3>添加用户</h3>
            <button class="btn-enter" style="width:100%; margin-bottom:10px; padding:10px; font-size:1rem;" onclick="generateRandomUser()">🎲 随机生成密钥</button>
            <div style="margin: 15px 0; color: var(--text-secondary);">或</div>
            <input type="text" id="custom-key-input" placeholder="自定义密钥 (不少于4位)" autocomplete="off">
            <div class="btn-group">
                <button class="btn-cancel" onclick="closeModal('add-user-modal')">取消</button>
                <button class="btn-confirm" onclick="addCustomUser()">💾 保存自定义</button>
            </div>
        </div>
    </div>

    <div class="top-nav">
        <button class="hamburger-btn" onclick="toggleSidebar()">
            <span></span><span></span><span></span>
        </button>
    </div>

    <div class="sidebar-overlay" onclick="toggleSidebar()"></div>
    <div class="sidebar">
        <div class="sidebar-menu-item" onclick="switchView('home-view'); toggleSidebar()">🏠 首页</div>
        <div class="sidebar-menu-item" id="nav-user-data" style="display:none;" onclick="switchView('user-manage-view'); toggleSidebar()">👥 用户数据</div>
    </div>

    <!-- Password Screen -->
    <div id="pwd-screen">
        <h2>🔒 受保护的内容</h2>
        <p>请输入分配给您的密钥进入系统</p>
        <input type="password" id="pwd" placeholder="输入密钥" autocomplete="off">
        <div id="pwd-error">❌ 密钥不存在或不正确</div>
        <button class="btn-enter" onclick="tryEnter()">验证身份</button>
    </div>

    <div class="container">
        <!-- ==== Home View ==== -->
        <div id="home-view">
"""

content = content.replace("<body>\n    <!-- Password Screen -->\n    <div id=\"pwd-screen\">\n        <h2>🔒 受保护的内容</h2>\n        <p>请输入暗号进入测评中心</p>\n        <input type=\"password\" id=\"pwd\" placeholder=\"请输入暗号\" autocomplete=\"off\">\n        <div id=\"pwd-error\">❌ 暗号错误，请重试</div>\n        <button class=\"btn-enter\" onclick=\"tryEnter()\">进入</button>\n    </div>\n\n    <div class=\"container\">\n", body_html)

# Admin Panel string removal to insert correctly into views
content = content.replace('<!-- Admin View Area -->\n        <div id="admin-panel" style="display: none; margin-top: 40px; text-align: left; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid var(--card-border);">\n            <h3 style="color: #a78bfa; margin-bottom: 16px;">🛡️ 管理员面板：用户反馈列表</h3>\n            <div id="admin-feedbacks-container" style="max-height: 300px; overflow-y: auto; color: var(--text-main); font-size: 0.95rem;"></div>\n            <button onclick="clearFeedbacks()" class="btn-submit" style="margin-top: 15px; background: #ef4444; padding: 8px 16px; font-size: 14px;">清除所有反馈</button>\n        </div>\n\n    </div>',
"""
        </div> <!-- end home view -->

        <!-- ==== User Management View ==== -->
        <div id="user-manage-view">
            <div class="header">
                <h2>用户管理</h2>
                <p>管理系统中的所有用户及其测评进度</p>
            </div>
            <div class="m-toolbar">
                <button class="m-btn-add" onclick="openModal('add-user-modal')">+ 添加用户</button>
                <input type="text" class="m-search" id="user-search" placeholder="🔍 搜索昵称或密钥..." oninput="renderUserList()">
            </div>
            <div class="user-list" id="user-list-container">
                <!-- User rows go here -->
            </div>

            <!-- Legacy feedbacks -->
            <div id="admin-panel" style="margin-top: 40px; text-align: left; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid var(--card-border);">
                <h3 style="color: #a78bfa; margin-bottom: 16px;">💬 用户反馈列表</h3>
                <div id="admin-feedbacks-container" style="max-height: 300px; overflow-y: auto; color: var(--text-main); font-size: 0.95rem;"></div>
                <button onclick="clearFeedbacks()" class="btn-submit" style="margin-top: 15px; background: #ef4444; padding: 8px 16px; font-size: 14px;">清除所有反馈</button>
            </div>
        </div>

        <!-- ==== User Detail View ==== -->
        <div id="user-detail-view">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px;">
                <button onclick="switchView('user-manage-view')" style="background:none;border:none;color:var(--text-primary);cursor:pointer;display:flex;align-items:center;font-size:1.1rem;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;"><polyline points="15 18 9 12 15 6"></polyline></svg> 返回
                </button>
                <button class="btn-danger" id="detail-delete-btn">删除用户</button>
            </div>
            <div style="background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 16px; padding: 30px; text-align: left;">
                <h2 id="detail-nickname" style="font-size: 2rem; margin-bottom: 5px;">-</h2>
                <div id="detail-key" style="color: var(--text-secondary); font-family: monospace; letter-spacing: 2px; margin-bottom: 25px;">Key: <span></span></div>
                
                <h3 style="margin-bottom: 15px; color: var(--accent); border-bottom: 1px solid var(--card-border); padding-bottom: 10px;">测评进展与答题情况</h3>
                <div id="detail-progress" style="font-size: 1rem; line-height: 1.8;">
                    <!-- progress rows -->
                </div>
            </div>
        </div>

    </div>
""")

# 3. Add JS logic
js_logic = """
        // ======= App Logic =======
        const ADMIN_KEY = '11115555';
        let siteUsers = JSON.parse(localStorage.getItem('site_users') || '{}');
        
        // Ensure Admin exists
        if (!siteUsers[ADMIN_KEY]) {
            siteUsers[ADMIN_KEY] = { role: 'admin', nickname: '系统管理员', addedAt: Date.now() };
            saveUsers();
        }

        function saveUsers() { localStorage.setItem('site_users', JSON.stringify(siteUsers)); }

        function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
        
        function switchView(viewId) {
            document.getElementById('home-view').style.display = 'none';
            document.getElementById('user-manage-view').style.display = 'none';
            document.getElementById('user-detail-view').style.display = 'none';
            document.getElementById(viewId).style.display = 'block';
            
            if (viewId === 'user-manage-view') {
                renderUserList();
            }
        }

        function openModal(id) { document.getElementById(id).style.display = 'flex'; }
        function closeModal(id) { document.getElementById(id).style.display = 'none'; }

        // == Authentication ==
        let authAttemptKey = '';

        function tryEnter() {
            const k = document.getElementById('pwd').value.trim();
            if (!k) return;
            
            if (siteUsers[k]) {
                if (siteUsers[k].nickname) {
                    // Allowed
                    localStorage.setItem('access_key', k);
                    location.reload();
                } else {
                    // Exists but needs nickname
                    authAttemptKey = k;
                    document.getElementById('pwd-screen').style.display = 'none';
                    openModal('nickname-modal');
                }
            } else {
                // Invalid
                document.getElementById('pwd-error').style.display = 'block';
                document.getElementById('pwd').value = '';
                document.getElementById('pwd').focus();
            }
        }

        function saveNicknameAndEnter() {
            const nick = document.getElementById('nickname-input').value.trim();
            if (!nick) { alert('请输入昵称！'); return; }
            siteUsers[authAttemptKey].nickname = nick;
            saveUsers();
            localStorage.setItem('access_key', authAttemptKey);
            location.reload();
        }

        function checkAccess() {
            const activeKey = localStorage.getItem('access_key');
            if (!siteUsers[activeKey] || !siteUsers[activeKey].nickname) {
                const container = document.querySelector('.container');
                if (container) container.style.display = 'none';
                document.querySelector('.top-nav').style.display = 'none'; // hide nav
                document.getElementById('pwd-screen').style.display = 'flex';
            } else {
                if (siteUsers[activeKey].role === 'admin') {
                    document.getElementById('nav-user-data').style.display = 'block';
                    document.getElementById('admin-panel').style.display = 'block';
                    renderAdminFeedbacks();
                } else {
                    document.getElementById('admin-panel').style.display = 'none';
                }
                switchView('home-view');
            }
        }

        // == Admin User Management ==
        function generateRandomKey() {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let res = '';
            for(let i=0; i<8; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
            return res;
        }

        function generateRandomUser() {
            let key = generateRandomKey();
            while(siteUsers[key]) key = generateRandomKey();
            siteUsers[key] = { role: 'user', nickname: '', addedAt: Date.now() };
            saveUsers();
            alert('成功生成随机密钥：' + key + '\\n（请复制给用户使用）');
            closeModal('add-user-modal');
            renderUserList();
        }

        function addCustomUser() {
            const k = document.getElementById('custom-key-input').value.trim();
            if(k.length < 4) { alert('密钥至少4位'); return; }
            if(siteUsers[k]) { alert('该密钥已存在！'); return; }
            siteUsers[k] = { role: 'user', nickname: '', addedAt: Date.now() };
            saveUsers();
            alert('成功添加自定义密钥：' + k);
            document.getElementById('custom-key-input').value = '';
            closeModal('add-user-modal');
            renderUserList();
        }

        // Calculate progress for a user
        function getUserProgressHtml(k) {
            const scales = [
                { id: '大五', key: 'ipip_answers' },
                { id: 'PID5', key: 'pid5_answers' },
                { id: 'BDI-II', key: 'bdi2_answers' },
                { id: 'BAI', key: 'bai_answers' },
                { id: 'YSQ', key: 'ysq_answers' }
            ];
            
            let summaries = [];
            scales.forEach(s => {
                const dataStr = localStorage.getItem(`${s.key}_${k}`);
                if (dataStr) {
                    try {
                        const localData = JSON.parse(dataStr);
                        let answeredCount = 0;
                        if (localData.answers) {
                            answeredCount = Object.keys(localData.answers).filter(ak => localData.answers[ak] !== 'skip' && !ak.endsWith('_label')).length;
                        } else {
                            answeredCount = Object.keys(localData).filter(ak => localData[ak] !== 'skip' && !ak.endsWith('_label')).length;
                        }
                        if (answeredCount > 0) {
                            summaries.push(`<span style="display:inline-block; margin-right:10px; background:rgba(139,92,246,0.1); padding:2px 6px; border-radius:4px; font-size:0.8rem;">${s.id}进度: ${answeredCount}题</span>`);
                        }
                    } catch(e){}
                }
            });
            return summaries.length > 0 ? summaries.join('') : '<span style="color:var(--text-secondary); font-size:0.8rem;">暂无答题数据</span>';
        }

        // Expanded progress details for user detail view
        function getUserProgressDetailsHtml(k) {
            const scales = [
                { id: '大五人格', key: 'ipip_answers', max: 300 },
                { id: 'PID-5测验', key: 'pid5_answers', max: 220 },
                { id: '贝克抑郁 BDI-II', key: 'bdi2_answers', max: 21 },
                { id: '贝克焦虑 BAI', key: 'bai_answers', max: 21 },
                { id: 'YSQ图式', key: 'ysq_answers', max: 90 }  // Approximation, since max questions may vary slightly we just show answered
            ];
            
            let summaries = [];
            let totalActivity = 0;
            scales.forEach(s => {
                const dataStr = localStorage.getItem(`${s.key}_${k}`);
                if (dataStr) {
                    try {
                        const localData = JSON.parse(dataStr);
                        let answeredCount = 0;
                        let historyCount = 0;
                        if (localData.answers) {
                            answeredCount = Object.keys(localData.answers).filter(ak => localData.answers[ak] !== 'skip' && !ak.endsWith('_label')).length;
                            historyCount = localData.history ? localData.history.length : 0;
                        } else {
                            answeredCount = Object.keys(localData).filter(ak => localData[ak] !== 'skip' && !ak.endsWith('_label')).length;
                        }
                        if (answeredCount > 0 || historyCount > 0) {
                            totalActivity++;
                            summaries.push(`<div style="margin-bottom: 10px;">
                                <strong>${s.id}</strong>：当前已答 ${answeredCount} 题
                                ${historyCount > 0 ? `<span style="color:#4ade80; margin-left:10px;">(历史完成 ${historyCount} 次)</span>` : ''}
                            </div>`);
                        }
                    } catch(e){}
                }
            });
            return totalActivity > 0 ? summaries.join('') : '<div style="color:var(--text-secondary);">该用户尚未开始任何测试。</div>';
        }

        function renderUserList() {
            const query = document.getElementById('user-search').value.toLowerCase();
            const container = document.getElementById('user-list-container');
            
            let html = '';
            Object.keys(siteUsers).forEach(k => {
                if (k === ADMIN_KEY && query === '') return; // Optionally hide admin from general list unless searched
                const u = siteUsers[k];
                const nick = u.nickname || '(未设置昵称)';
                
                if (nick.toLowerCase().includes(query) || k.toLowerCase().includes(query)) {
                    html += `
                    <div class="user-row" onclick="viewUserDetail('${k}')">
                        <div>
                            <div class="u-nick">${nick} ${k === ADMIN_KEY ? '<span style="color:#f472b6; font-size:0.8rem;">[管理员]</span>' : ''}</div>
                            <div style="font-family:monospace; font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">${k}</div>
                            <div class="u-prog">${getUserProgressHtml(k)}</div>
                        </div>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>`;
                }
            });
            
            if (html === '') html = '<div style="text-align:center; padding:20px; color:var(--text-secondary);">没有找到对应用户</div>';
            container.innerHTML = html;
        }

        function viewUserDetail(k) {
            const u = siteUsers[k];
            document.getElementById('detail-nickname').innerText = u.nickname || '(未设置昵称)';
            document.getElementById('detail-key').querySelector('span').innerText = k;
            document.getElementById('detail-progress').innerHTML = getUserProgressDetailsHtml(k);
            
            const delBtn = document.getElementById('detail-delete-btn');
            if (k === ADMIN_KEY || k === localStorage.getItem('access_key')) {
                delBtn.style.display = 'none';
            } else {
                delBtn.style.display = 'block';
                delBtn.onclick = () => {
                    if (confirm(`警告：确定要删除用户 "${u.nickname}" 及其关联密钥吗？数据无法恢复！`)) {
                        delete siteUsers[k];
                        saveUsers();
                        // Optional: cleanup local storage keys for this user
                        Object.keys(localStorage).forEach(lk => {
                            if (lk.endsWith('_' + k)) localStorage.removeItem(lk);
                        });
                        alert('已删除该用户');
                        switchView('user-manage-view');
                    }
                };
            }
            
            switchView('user-detail-view');
        }

        /* Original logic overrides */
"""

# Replace the original script logic block
old_script_start = """        const CORRECT_KEY = '11115555';

        function renderAdminFeedbacks() {"""
content = content.replace(old_script_start, js_logic + "        function renderAdminFeedbacks() {")


# Also update loadCardProgress
content = content.replace("const localKey = scaleKeys[scale];",
"""const userKey = localStorage.getItem('access_key') || 'guest';
                const localKey = scaleKeys[scale] ? scaleKeys[scale] + '_' + userKey : null;""")


with open(r'd:\Desktop\vscode-project\大五人格测试网站\dawurengeceshi-main\tmp\index_patched.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched file created")
