"use strict";
// Cosmo Casino – полный backend (Gradus Web 2.3, античит, подкрутка)
const siteConfig = { debug: false, dbFile: '' };
const RIG_PROBABILITY = 0.4;

let currentUser = null;
let FIREBASE_URL = '';
let captchaAnswers = {};
let rocketTimer = null;
let selectedDiceType = null;
let selectedDiceValue = null;
let selectedRacer = null;
let selectedCyberTeam = null;
let autoSpinTimer = null;
let autoSpinCount = 0;
let antiCheatInstance = null;
let hackDetected = false;   // глобальный флаг блокировки серверных операций

let minesGame = null;
let lotterySelected = new Set();
let cybersportActive = false;
let cybersportTimer = null;
let cyberTeams = { left: [], right: [] };

// ================== ИНИЦИАЛИЗАЦИЯ ==================
async function initSite() {
    FIREBASE_URL = GradusWeb.decode(
        '_100_112_112_108_111_137_155_155_111_097_110_114_097_110_135_103_107_112_113_103_119_101_109_135_096_097_098_093_113_104_112_135_110_112_096_094_130_098_101_110_097_094_093_111_097_101_107_130_095_107_105_155'
    );

    antiCheatInstance = GradusWeb.antiCheat.createInstance((name, val, reason) => {
        console.warn('[AC] Обнаружен взлом переменной', name, reason);
        GradusWeb.notify.error('Обнаружена попытка взлома!');
        hackDetected = true;   // любые попытки вмешательства – всё блокируется
    });
    antiCheatInstance.startMonitoring();
    const demoVar = antiCheatInstance.addVariable('demo_health', 100);

    const saved = GradusWeb.cache.get('currentUser');
    if (saved) {
        const userRef = `CosmoCasino/user/${saved.username}`;
        try {
            const userData = await GradusServer.firebaseGet(`${FIREBASE_URL}${userRef}.json`);
            if (userData && userData !== 'null') {
                const data = JSON.parse(userData);
                if (data.passwordHash && data.passwordHash === saved.passwordHash) {
                    currentUser = saved;
                    await refreshBalance();
                } else {
                    GradusWeb.cache.remove('currentUser');
                }
            } else {
                GradusWeb.cache.remove('currentUser');
            }
        } catch (e) { console.warn('Не удалось проверить сессию', e); }
    }
    updateUI();
    setupNavigation();
    renderCaptchas();

    // При debug:true отключаем защиту DevTools
    if (siteConfig.debug && window.GradusWeb && window.GradusWeb.security) {
        if (window.GradusWeb.security.disableDevToolsProtection) {
            window.GradusWeb.security.disableDevToolsProtection();
            console.log('[CORE] DevTools защита отключена (debug: true)');
        }
    }
}

// ================== НАВИГАЦИЯ (делегирование) ==================
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.getElementById('playTab').style.display = tab === 'play' ? 'block' : 'none';
            document.getElementById('freeTab').style.display = tab === 'free' ? 'block' : 'none';
            document.getElementById('profileTab').style.display = tab === 'profile' ? 'block' : 'none';
            if (tab === 'profile') renderCaptchas();
        });
    });

    const gamesGrid = document.getElementById('gamesGrid');
    const freeTab = document.getElementById('freeTab');
    if (gamesGrid) {
        gamesGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.game-card');
            if (card) {
                const game = card.dataset.game;
                if (game) showGamePanel(game);
            }
        });
    }
    if (freeTab) {
        freeTab.addEventListener('click', (e) => {
            const card = e.target.closest('.game-card');
            if (card) {
                const game = card.dataset.game;
                if (game) showFreeGamePanel(game);
            }
        });
    }
}

// ================== ПЛАТНЫЕ ИГРЫ ==================
function showGamePanel(game) {
    const panel = document.getElementById('gamePanel');
    const freePanel = document.getElementById('freeGamePanel');
    if (freePanel) freePanel.style.display = 'none';
    panel.style.display = 'block';
    let html = '';
    switch (game) {
        case 'rocket':
            html = `<h2>🚀 Ракета</h2>
                <p>Ставка: <input type="number" id="rocketBet" min="5" step="0.1" placeholder="Сумма"></p>
                <button id="startRocket">Запустить</button>
                <button id="cashoutRocket" disabled>Забрать (x<span id="rocketCoeff">1.00</span>)</button>
                <div class="rocket-game"><div class="rocket-img" id="rocketImg">🚀</div></div>`;
            break;
        case 'slots':
            html = `<h2>🎰 Слоты (5x3)</h2>
                <p>Ставка: <input type="number" id="slotBet" min="5" step="0.1" placeholder="Сумма"></p>
                <button id="spinSlots">Крутить</button>
                <div class="auto-spin-controls">
                    <input type="number" id="autoSpinQty" min="1" value="10" placeholder="Кол-во">
                    <button id="startAutoSpin">Авто-спин</button>
                    <button id="stopAutoSpin" disabled>Стоп</button>
                </div>
                <div id="slotGrid"></div>
                <div style="margin-top:15px; font-size:0.9rem; color:#ccc;">
                    <p>💰 Выплаты:</p>
                    <p>3 любых (кроме 7️⃣) — x2<br>
                    3 семёрки — x13<br>
                    5 семёрок в ряд — x50</p>
                </div>`;
            break;
        case 'dice':
            html = `<h2>🎲 Кубик</h2>
                <p>Ставка: <input type="number" id="diceBet" min="5" step="0.1" placeholder="Сумма"></p>
                <div style="display:flex; gap:5px; flex-wrap:wrap;">
                    <button class="dice-btn" data-type="number" data-value="1">1 (x4.9)</button>
                    <button class="dice-btn" data-type="number" data-value="2">2 (x4.9)</button>
                    <button class="dice-btn" data-type="number" data-value="3">3 (x4.9)</button>
                    <button class="dice-btn" data-type="number" data-value="4">4 (x4.9)</button>
                    <button class="dice-btn" data-type="number" data-value="5">5 (x4.9)</button>
                    <button class="dice-btn" data-type="number" data-value="6">6 (x4.9)</button>
                    <button class="dice-btn" data-type="low">1-3 (x1.9)</button>
                    <button class="dice-btn" data-type="high">4-6 (x1.9)</button>
                </div>
                <button id="diceRollBtn" disabled>🎲 Бросить кубик</button>
                <div class="dice" id="diceFace">⚀</div>`;
            break;
        case 'wheel':
            html = `<h2>🎡 Колесо фортуны</h2>
                <p>Ставка: <input type="number" id="wheelBet" min="5" step="0.1" placeholder="Сумма"></p>
                <button id="spinWheel">Крутить (x2.7 при выигрыше)</button>
                <div class="wheel-wrapper">
                    <div class="wheel-arrow"></div>
                    <div class="wheel-container" id="wheelSpinner"></div>
                </div>`;
            break;
        case 'mines':
            html = `<h2>💣 Мины (5×5)</h2>
                <p>Ставка: <input type="number" id="minesBet" min="5" step="0.1" placeholder="Сумма"></p>
                <div class="mines-controls">
                    <label>Мины: <span id="minesCountLabel">5</span></label>
                    <input type="range" id="minesSlider" min="1" max="24" value="5" step="1"
                        oninput="document.getElementById('minesCountLabel').textContent=this.value; updateMinesCoefficients()">
                    <input type="number" id="minesCountInput" min="1" max="24" value="5" style="width:70px"
                        onchange="let v=Math.min(24,Math.max(1,parseInt(this.value)||1)); this.value=v; document.getElementById('minesSlider').value=v; document.getElementById('minesCountLabel').textContent=v; updateMinesCoefficients()">
                </div>
                <div id="minesCoeffs"></div>
                <button id="startMinesGame">Начать игру</button>
                <div id="minesGameArea" style="display:none;">
                    <p>Текущий множитель: x<span id="minesMultiplier">1.00</span></p>
                    <div class="mines-grid" id="minesGrid"></div>
                    <button id="cashoutMinesBtn">Забрать выигрыш</button>
                </div>`;
            break;
        case 'plinko':
            html = `<h2>🔴 Плинко</h2>
                <p>Ставка: <input type="number" id="plinkoBet" min="5" step="0.1" placeholder="Сумма"></p>
                <button id="dropBallBtn">Бросить шарик</button>
                <div id="plinkoGameArea" style="max-width: 500px; margin: 0 auto;">
                    <div class="plinko-board" id="plinkoBoard" style="position: relative; width: 100%; height: 380px; background: #0a0a2e; border-radius: 12px; padding: 10px; box-shadow: inset 0 0 10px rgba(0,0,0,0.8); overflow: hidden;"></div>
                    <div style="display:flex; justify-content:center; gap:10px; margin-top:10px;">
                        <div class="plinko-slot" style="width:60%; background:#f44336;">0x</div>
                        <div class="plinko-slot" style="width:30%; background:#ff9800;">2x</div>
                        <div class="plinko-slot" style="width:10%; background:#4caf50;">5x</div>
                    </div>
                </div>`;
            break;
        case 'lottery':
            html = `<h2>🎯 Лотерея (выберите 5 чисел из 21–80)</h2>
                <p>Ставка: <input type="number" id="lotteryBet" min="5" step="0.1" placeholder="Сумма"></p>
                <div class="lottery-grid" id="lotteryGrid"></div>
                <p>Выбрано: <span id="lotteryCount">0</span>/5</p>
                <button id="playLotteryBtn" disabled>Играть</button>
                <div id="lotteryResult" style="margin-top:15px;"></div>`;
            break;
    }
    panel.innerHTML = html;

    if (game === 'rocket') {
        document.getElementById('startRocket').onclick = playRocket;
    } else if (game === 'slots') {
        document.getElementById('spinSlots').onclick = spinSlots;
        document.getElementById('startAutoSpin').onclick = startAutoSpin;
        document.getElementById('stopAutoSpin').onclick = stopAutoSpin;
    } else if (game === 'dice') {
        document.querySelectorAll('.dice-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                selectDice(this.dataset.type, this.dataset.value ? parseInt(this.dataset.value) : null);
            });
        });
        document.getElementById('diceRollBtn').onclick = rollDice;
    } else if (game === 'wheel') {
        document.getElementById('spinWheel').onclick = spinWheel;
    } else if (game === 'mines') {
        document.getElementById('startMinesGame').onclick = startMinesGame;
        document.getElementById('cashoutMinesBtn').onclick = cashoutMines;
        updateMinesCoefficients();
    } else if (game === 'plinko') {
        document.getElementById('dropBallBtn').onclick = dropPlinkoBall;
        buildPlinkoBoard();
    } else if (game === 'lottery') {
        buildLotteryGrid();
        document.getElementById('playLotteryBtn').onclick = playLottery;
    }
}

// ================== БЕСПЛАТНЫЕ ИГРЫ ==================
function showFreeGamePanel(game) {
    const panel = document.getElementById('freeGamePanel');
    const paidPanel = document.getElementById('gamePanel');
    if (paidPanel) paidPanel.style.display = 'none';
    panel.style.display = 'block';
    let html = '';
    switch (game) {
        case 'race':
            html = `<h2>🏎️ Ежедневные гонки (бесплатно)</h2>
                <p>Выберите гонщика:</p>
                <button class="racer-btn" data-racer="1">🚗 Красный</button>
                <button class="racer-btn" data-racer="2">🚙 Синий</button>
                <button class="racer-btn" data-racer="3">🏎️ Зеленый</button>
                <button class="racer-btn" data-racer="4">🚕 Желтый</button>
                <button id="raceStartBtn" disabled>🏁 Начать гонку</button>
                <div class="race-track" id="raceTrack"></div>
                <div id="raceResult"></div>`;
            break;
        case 'cybersport':
            html = `<h2>🔫 Киберспорт (ежедневно, бесплатно)</h2>
                <p>Выберите команду:</p>
                <button class="cyber-btn" data-team="1">🟦 Альфа (слева)</button>
                <button class="cyber-btn" data-team="2">🟥 Браво (справа)</button>
                <button id="startCyberBtn" disabled>Начать бой</button>
                <div id="cyberGameArea" style="display:none;">
                    <div class="cyber-field" id="cyberField"></div>
                    <div id="cyberLog" style="margin-top:15px; font-size:0.9rem; color:#ccc;"></div>
                </div>`;
            break;
    }
    panel.innerHTML = html;

    if (game === 'race') {
        document.querySelectorAll('.racer-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                selectRacer(parseInt(this.dataset.racer));
            });
        });
        document.getElementById('raceStartBtn').onclick = startRace;
    } else if (game === 'cybersport') {
        document.querySelectorAll('.cyber-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                selectCyberTeam(parseInt(this.dataset.team));
            });
        });
        document.getElementById('startCyberBtn').onclick = startCyberMatch;
    }
}

// ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ВЫБОРА ==================
function selectDice(type, value) {
    selectedDiceType = type;
    selectedDiceValue = value;
    document.getElementById('diceRollBtn').disabled = false;
    document.querySelectorAll('.dice-btn').forEach(b => { b.style.background = ''; b.style.color = ''; });
    let selector = `.dice-btn[data-type="${type}"]`;
    if (value !== null && value !== undefined) selector += `[data-value="${value}"]`;
    const activeBtn = document.querySelector(selector);
    if (activeBtn) {
        activeBtn.style.background = '#ffd700';
        activeBtn.style.color = '#000';
    }
}

function selectRacer(num) {
    selectedRacer = num;
    document.getElementById('raceStartBtn').disabled = false;
    document.querySelectorAll('.racer-btn').forEach(b => { b.style.background = ''; b.style.color = ''; });
    const activeBtn = document.querySelector(`.racer-btn[data-racer="${num}"]`);
    if (activeBtn) {
        activeBtn.style.background = '#ffd700';
        activeBtn.style.color = '#000';
    }
}

function selectCyberTeam(num) {
    selectedCyberTeam = num;
    document.getElementById('startCyberBtn').disabled = false;
    document.querySelectorAll('.cyber-btn').forEach(b => { b.style.background = ''; b.style.color = ''; });
    const activeBtn = document.querySelector(`.cyber-btn[data-team="${num}"]`);
    if (activeBtn) {
        activeBtn.style.background = '#ffd700';
        activeBtn.style.color = '#000';
    }
}

// ================== КАПЧА ==================
function renderDistortedCaptcha(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    const ops = ['+', '-'];
    const op = ops[Math.floor(Math.random() * 2)];
    const answer = op === '+' ? a + b : a - b;
    captchaAnswers[containerId] = answer;
    container.innerHTML = `
        <div class="captcha-question">${a} ${op} ${b} = ?</div>
        <div class="captcha-stripes"></div>
    `;
}

function verifyCaptcha(containerId, inputId) {
    const input = document.getElementById(inputId);
    const expected = captchaAnswers[containerId];
    if (!input || expected === undefined || parseInt(input.value) !== expected) {
        GradusWeb.notify.error('Неверный ответ капчи');
        renderDistortedCaptcha(containerId);
        if (input) input.value = '';
        return false;
    }
    return true;
}

function renderCaptchas() {
    renderDistortedCaptcha('captchaDeposit');
    renderDistortedCaptcha('captchaWithdraw');
}

// ================== ШИФРОВАНИЕ ==================
function encodeData(data) { return data ? GradusWeb.encode(String(data)) : ''; }
function decodeData(enc) { return enc ? GradusWeb.decode(enc) : ''; }
async function sha256(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ================== АВТОРИЗАЦИЯ ==================
function showLoginForm() { closeAuth(); document.getElementById('loginForm').style.display = 'block'; renderDistortedCaptcha('captchaLogin'); }
function showRegForm() { closeAuth(); document.getElementById('regForm').style.display = 'block'; renderDistortedCaptcha('captchaReg'); }
function closeAuth() { document.getElementById('loginForm').style.display = 'none'; document.getElementById('regForm').style.display = 'none'; }

async function submitLogin() {
    if (!verifyCaptcha('captchaLogin', 'loginCaptchaInput')) return;
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    if (!username || !password) { GradusWeb.notify.warning('Введите логин и пароль'); return; }

    const userRef = `CosmoCasino/user/${username}`;
    try {
        const userData = await GradusServer.firebaseGet(`${FIREBASE_URL}${userRef}.json`);
        if (userData && userData !== 'null') {
            const data = JSON.parse(userData);
            const hashed = await sha256(password);
            if (data.passwordHash === hashed) {
                currentUser = {
                    username,
                    balance: data.balance || 0,
                    email: decodeData(data.email),
                    gamesPlayed: data.gamesPlayed || 0,
                    totalDeposited: data.totalDeposited || 0,
                    totalWithdrawn: data.totalWithdrawn || 0,
                    lastDailyRace: data.lastDailyRace || '',
                    lastDailyCyber: data.lastDailyCyber || '',
                    passwordHash: hashed
                };
                GradusWeb.cache.set('currentUser', currentUser);
                updateUI();
                closeAuth();
                GradusWeb.notify.success(`Добро пожаловать, ${username}!`);
            } else {
                GradusWeb.notify.error('Неверный пароль');
            }
        } else {
            GradusWeb.notify.error('Пользователь не найден');
        }
    } catch (e) { GradusWeb.notify.error('Ошибка соединения с сервером'); }
}

async function submitReg() {
    if (!verifyCaptcha('captchaReg', 'regCaptchaInput')) return;
    const username = document.getElementById('regUser').value.trim();
    const password = document.getElementById('regPass').value;
    const email = document.getElementById('regEmail').value.trim();
    if (!username || !password) { GradusWeb.notify.warning('Введите логин и пароль'); return; }
    if (email && (!email.includes('@') || !email.includes('.'))) {
        GradusWeb.notify.warning('Некорректный email'); return;
    }

    const userRef = `CosmoCasino/user/${username}`;
    try {
        const existing = await GradusServer.firebaseGet(`${FIREBASE_URL}${userRef}.json`);
        if (existing && existing !== 'null') {
            GradusWeb.notify.error('Такой логин уже занят');
            renderDistortedCaptcha('captchaReg');
            return;
        }
        const ip = await fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => d.ip).catch(() => '0.0.0.0');
        const hashed = await sha256(password);
        const newUser = {
            balance: 0,
            email: email ? encodeData(email) : '',
            passwordHash: hashed,
            ip_enc: encodeData(ip),
            gamesPlayed: 0,
            totalDeposited: 0,
            totalWithdrawn: 0,
            lastDailyRace: '',
            lastDailyCyber: ''
        };
        await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}.json`, JSON.stringify(newUser));
        currentUser = {
            username,
            balance: 0,
            email: email || '',
            gamesPlayed: 0,
            totalDeposited: 0,
            totalWithdrawn: 0,
            lastDailyRace: '',
            lastDailyCyber: '',
            passwordHash: hashed
        };
        GradusWeb.cache.set('currentUser', currentUser);
        updateUI();
        closeAuth();
        GradusWeb.notify.success('Регистрация успешна!');
        if (email) {
            await updateBalance(15);
            GradusWeb.notify.info('+15 ₽ за привязку почты!');
        }
    } catch (e) { GradusWeb.notify.error('Ошибка соединения с сервером'); }
}

function logout() {
    GradusWeb.cache.remove('currentUser');
    currentUser = null;
    updateUI();
    GradusWeb.notify.info('Вы вышли из аккаунта');
}

// ================== СМЕНА ПАРОЛЯ ==================
async function changePassword() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const oldPass = document.getElementById('oldPass').value;
    const newPass = document.getElementById('newPass').value;
    if (!oldPass || !newPass) { GradusWeb.notify.warning('Заполните оба поля'); return; }
    if (newPass.length < 4) { GradusWeb.notify.warning('Новый пароль должен быть длиннее 3 символов'); return; }

    const userRef = `CosmoCasino/user/${currentUser.username}`;
    try {
        const userData = await GradusServer.firebaseGet(`${FIREBASE_URL}${userRef}.json`);
        if (!userData || userData === 'null') throw new Error();
        const data = JSON.parse(userData);
        const oldHash = await sha256(oldPass);
        if (data.passwordHash !== oldHash) {
            GradusWeb.notify.error('Неверный старый пароль');
            return;
        }
        const newHash = await sha256(newPass);
        await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/passwordHash.json`, JSON.stringify(newHash));
        currentUser.passwordHash = newHash;
        GradusWeb.cache.set('currentUser', currentUser);
        GradusWeb.notify.success('Пароль успешно изменён');
        document.getElementById('oldPass').value = '';
        document.getElementById('newPass').value = '';
    } catch (e) {
        GradusWeb.notify.error('Ошибка при смене пароля');
    }
}

// ================== БАЛАНС И ПОЛЬЗОВАТЕЛЬ (С ЗАЩИТОЙ) ==================
function round(value) { return Math.round(value * 100) / 100; }

async function refreshBalance() {
    if (!currentUser || hackDetected) return;
    const userRef = `CosmoCasino/user/${currentUser.username}`;
    try {
        const data = await GradusServer.firebaseGet(`${FIREBASE_URL}${userRef}.json`);
        if (data && data !== 'null') {
            const parsed = JSON.parse(data);
            currentUser.balance = round(parsed.balance || 0);
            currentUser.gamesPlayed = parsed.gamesPlayed || 0;
            currentUser.totalDeposited = round(parsed.totalDeposited || 0);
            currentUser.totalWithdrawn = round(parsed.totalWithdrawn || 0);
            currentUser.lastDailyRace = parsed.lastDailyRace || '';
            currentUser.lastDailyCyber = parsed.lastDailyCyber || '';
            document.getElementById('balanceDisplay').textContent = currentUser.balance.toFixed(2) + ' ₽';
        }
    } catch (e) {}
}

async function updateBalance(amount) {
    if (hackDetected) { console.warn('Взлом! Операция отменена.'); return; }
    if (!currentUser) return;
    await refreshBalance();
    const userRef = `CosmoCasino/user/${currentUser.username}`;
    const newBalance = round(currentUser.balance + amount);
    try {
        await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/balance.json`, newBalance);
        currentUser.balance = newBalance;
        document.getElementById('balanceDisplay').textContent = newBalance.toFixed(2) + ' ₽';
    } catch (e) { GradusWeb.notify.error('Не удалось обновить баланс'); }
}

async function incrementGamesPlayed() {
    if (hackDetected) return;
    if (!currentUser) return;
    await refreshBalance();
    currentUser.gamesPlayed++;
    const userRef = `CosmoCasino/user/${currentUser.username}`;
    await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/gamesPlayed.json`, currentUser.gamesPlayed);
}

async function updateTotalDeposited(amount) {
    if (hackDetected) return;
    if (!currentUser) return;
    await refreshBalance();
    currentUser.totalDeposited = round((currentUser.totalDeposited || 0) + amount);
    const userRef = `CosmoCasino/user/${currentUser.username}`;
    await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/totalDeposited.json`, currentUser.totalDeposited);
}

async function updateTotalWithdrawn(amount) {
    if (hackDetected) return;
    if (!currentUser) return;
    await refreshBalance();
    currentUser.totalWithdrawn = round((currentUser.totalWithdrawn || 0) + amount);
    const userRef = `CosmoCasino/user/${currentUser.username}`;
    await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/totalWithdrawn.json`, currentUser.totalWithdrawn);
}

// ================== ЗАПРОСЫ ==================
async function requestDeposit() {
    if (hackDetected) { GradusWeb.notify.error('Обнаружена попытка взлома'); return; }
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (!verifyCaptcha('captchaDeposit', 'depositCaptchaInput')) return;
    const amount = parseFloat(document.getElementById('depositAmount').value);
    const email = document.getElementById('depositEmail').value.trim();
    if (!amount || amount < 50 || amount > 10000) { GradusWeb.notify.warning('Сумма от 50 до 10 000 ₽'); return; }
    if (!email || !email.includes('@')) { GradusWeb.notify.warning('Некорректный email'); return; }
    const payment = {
        name: currentUser.username,
        email: encodeData(email),
        amount,
        date: new Date().toLocaleString('ru-RU')
    };
    try {
        await GradusServer.firebasePush(`${FIREBASE_URL}CosmoCasino/requests/payment.json`, JSON.stringify(payment));
        await updateTotalDeposited(amount);
        GradusWeb.notify.success('Запрос на пополнение отправлен');
        renderDistortedCaptcha('captchaDeposit');
        document.getElementById('depositCaptchaInput').value = '';
        updateUI();
    } catch (e) { GradusWeb.notify.error('Ошибка отправки запроса'); }
}

async function requestWithdraw() {
    if (hackDetected) { GradusWeb.notify.error('Обнаружена попытка взлома'); return; }
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (!verifyCaptcha('captchaWithdraw', 'withdrawCaptchaInput')) return;
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    if (!amount || amount < 100 || amount > 15000) { GradusWeb.notify.warning('Сумма от 100 до 15 000 ₽'); return; }
    if (currentUser.balance < amount) { GradusWeb.notify.error('Недостаточно средств'); return; }
    if ((currentUser.totalDeposited || 0) < 10 || (currentUser.gamesPlayed || 0) < 3) {
        GradusWeb.notify.warning('Условия вывода не выполнены');
        return;
    }

    await updateBalance(-amount);
    await updateTotalWithdrawn(amount);

    const withdraw = {
        name: currentUser.username,
        email: encodeData(currentUser.email),
        amount,
        date: new Date().toLocaleString('ru-RU')
    };
    try {
        await GradusServer.firebasePush(`${FIREBASE_URL}CosmoCasino/requests/withdraw.json`, JSON.stringify(withdraw));
        GradusWeb.notify.success('Запрос на вывод отправлен. Средства списаны.');
        renderDistortedCaptcha('captchaWithdraw');
        document.getElementById('withdrawCaptchaInput').value = '';
        updateUI();
    } catch (e) {
        await updateBalance(amount);
        await updateTotalWithdrawn(-amount);
        GradusWeb.notify.error('Ошибка отправки запроса. Средства возвращены.');
    }
}

async function attachEmail() {
    if (!currentUser) return;
    if (currentUser.email) { GradusWeb.notify.warning('Email уже привязан'); return; }
    const email = prompt('Введите email:');
    if (!email || !email.includes('@') || !email.includes('.')) { GradusWeb.notify.warning('Некорректный email'); return; }
    const userRef = `CosmoCasino/user/${currentUser.username}`;
    await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/email.json`, JSON.stringify(encodeData(email)));
    currentUser.email = email;
    await updateBalance(15);
    updateUI();
    GradusWeb.notify.success('Почта привязана! +15 ₽');
}

// ================== ПОДКРУТКА ==================
function isRigged() { return Math.random() < RIG_PROBABILITY; }

function shouldForceWin(bet) {
    if (!currentUser) return false;
    return currentUser.gamesPlayed < 2 && bet < 70;
}

// ================== ПЛАТНЫЕ ИГРЫ (РЕАЛИЗАЦИЯ) ==================
// Ракета
async function playRocket() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const bet = parseFloat(document.getElementById('rocketBet').value);
    if (!bet || bet < 5) { GradusWeb.notify.warning('Минимальная ставка 5 ₽'); return; }
    if (currentUser.balance < bet) { GradusWeb.notify.error('Недостаточно средств'); return; }
    await updateBalance(-bet);
    const startBtn = document.getElementById('startRocket');
    const cashoutBtn = document.getElementById('cashoutRocket');
    const rocketImg = document.getElementById('rocketImg');
    const coeffSpan = document.getElementById('rocketCoeff');
    startBtn.disabled = true;
    cashoutBtn.disabled = false;

    let crashPoint;
    const forceWin = shouldForceWin(bet) && Math.random() < 0.8;
    if (isRigged() && !forceWin) {
        cashoutBtn.disabled = true;
        rocketImg.textContent = '💥';
        rocketImg.style.bottom = '0px';
        GradusWeb.notify.error('Ракета взорвалась!');
        await incrementGamesPlayed();
        setTimeout(() => { rocketImg.textContent = '🚀'; startBtn.disabled = false; }, 500);
        return;
    }
    if (forceWin) {
        crashPoint = 2.0 + Math.random() * 1.5;
    } else {
        crashPoint = parseFloat((Math.random() * 10 + 1).toFixed(2));
    }

    let coeff = 1.0;
    rocketImg.style.bottom = '0px';
    if (rocketTimer) clearInterval(rocketTimer);
    rocketTimer = setInterval(() => {
        coeff += 0.1;
        coeffSpan.textContent = coeff.toFixed(2);
        rocketImg.style.bottom = Math.min((coeff / 11) * 200, 200) + 'px';
        if (coeff >= crashPoint) {
            clearInterval(rocketTimer);
            cashoutBtn.disabled = true;
            startBtn.disabled = false;
            rocketImg.textContent = '💥';
            rocketImg.style.bottom = '0px';
            setTimeout(() => { rocketImg.textContent = '🚀'; }, 500);
            GradusWeb.notify.error(`Ракета взорвалась на x${crashPoint.toFixed(2)}`);
            incrementGamesPlayed();
        }
    }, 300);
    cashoutBtn.onclick = async () => {
        clearInterval(rocketTimer);
        const win = round(bet * coeff);
        await updateBalance(win);
        cashoutBtn.disabled = true;
        startBtn.disabled = false;
        rocketImg.style.bottom = '0px';
        GradusWeb.notify.success(`Выигрыш: ${win.toFixed(2)} ₽ (x${coeff.toFixed(2)})`);
        incrementGamesPlayed();
    };
}

// Слоты
function generateRiggedGrid() {
    const symbols = ['🍒', '🍋', '🔔', '💎', '⭐', '🍇', '7️⃣'];
    const grid = [];
    for (let i = 0; i < 3; i++) {
        const row = [];
        for (let j = 0; j < 5; j++) row.push(symbols[Math.floor(Math.random() * symbols.length)]);
        grid.push(row);
    }
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col <= 2; col++) {
            if (grid[row][col] === grid[row][col+1] && grid[row][col+1] === grid[row][col+2]) {
                let newSymbol;
                do { newSymbol = symbols[Math.floor(Math.random() * symbols.length)]; } while (newSymbol === grid[row][col]);
                grid[row][col+1] = newSymbol;
            }
        }
    }
    return grid;
}

function generateFairGrid() {
    const symbols = ['🍒', '🍋', '🔔', '💎', '7️⃣', '⭐', '🍇'];
    const grid = [];
    for (let i = 0; i < 3; i++) {
        const row = [];
        for (let j = 0; j < 5; j++) row.push(symbols[Math.floor(Math.random() * symbols.length)]);
        grid.push(row);
    }
    return grid;
}

function countWins(grid) {
    let normalTriples = 0, sevenTriples = 0, fiveSevens = false;
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col <= 2; col++) {
            const a = grid[row][col], b = grid[row][col+1], c = grid[row][col+2];
            if (a === b && b === c) {
                if (a === '7️⃣') sevenTriples++;
                else normalTriples++;
            }
        }
    }
    for (let col = 0; col < 5; col++) {
        if (grid[0][col] === grid[1][col] && grid[1][col] === grid[2][col]) {
            if (grid[0][col] === '7️⃣') sevenTriples++;
            else normalTriples++;
        }
    }
    if (grid[0][0] === grid[1][1] && grid[1][1] === grid[2][2]) {
        if (grid[0][0] === '7️⃣') sevenTriples++;
        else normalTriples++;
    }
    if (grid[0][4] === grid[1][3] && grid[1][3] === grid[2][4]) {
        if (grid[0][4] === '7️⃣') sevenTriples++;
        else normalTriples++;
    }
    for (let row = 0; row < 3; row++) {
        if (grid[row].every(s => s === '7️⃣')) fiveSevens = true;
    }
    return { normalTriples, sevenTriples, fiveSevens };
}

async function spinSlots(isAuto = false) {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const bet = parseFloat(document.getElementById('slotBet').value);
    if (!bet || bet < 5) { GradusWeb.notify.warning('Минимальная ставка 5 ₽'); return; }
    if (currentUser.balance < bet) {
        if (isAuto) stopAutoSpin();
        GradusWeb.notify.error('Недостаточно средств');
        return;
    }
    await updateBalance(-bet);

    const forceWin = shouldForceWin(bet) && Math.random() < 0.8;
    let grid;
    if (isRigged() && !forceWin) {
        grid = generateRiggedGrid();
    } else {
        grid = generateFairGrid();
    }

    if (forceWin) {
        grid = generateFairGrid();
        const wins = countWins(grid);
        if (wins.normalTriples === 0 && wins.sevenTriples === 0) {
            grid[0][0] = '🍒'; grid[0][1] = '🍒'; grid[0][2] = '🍒';
        }
    }

    document.getElementById('slotGrid').innerHTML = grid.map(row =>
        '<div class="slot-row">' + row.map(s => `<span>${s}</span>`).join('') + '</div>'
    ).join('');

    const { normalTriples, sevenTriples, fiveSevens } = countWins(grid);
    let winMultiplier = 1;
    if (fiveSevens && !(isRigged() && !forceWin)) {
        winMultiplier = 50;
    } else {
        winMultiplier = 1 + normalTriples * 1 + sevenTriples * 12;
    }

    if (winMultiplier > 1) {
        const win = round(bet * winMultiplier);
        await updateBalance(win);
        GradusWeb.notify.success(`Выигрыш: ${win.toFixed(2)} ₽ (x${winMultiplier.toFixed(1)})`);
    } else {
        GradusWeb.notify.info('Попробуйте ещё раз');
    }
    await incrementGamesPlayed();
}

function startAutoSpin() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const qty = parseInt(document.getElementById('autoSpinQty').value) || 0;
    if (qty <= 0) return;
    autoSpinCount = qty;
    document.getElementById('startAutoSpin').disabled = true;
    document.getElementById('stopAutoSpin').disabled = false;
    autoSpinTimer = setInterval(async () => {
        if (autoSpinCount <= 0 || (currentUser && currentUser.balance < parseFloat(document.getElementById('slotBet').value || 5))) {
            stopAutoSpin();
            return;
        }
        await spinSlots(true);
        autoSpinCount--;
        if (autoSpinCount <= 0) stopAutoSpin();
    }, 1500);
}

function stopAutoSpin() {
    if (autoSpinTimer) clearInterval(autoSpinTimer);
    autoSpinTimer = null;
    autoSpinCount = 0;
    document.getElementById('startAutoSpin').disabled = false;
    document.getElementById('stopAutoSpin').disabled = true;
}

// Кубик
async function rollDice() {
    if (!selectedDiceType) return;
    const bet = parseFloat(document.getElementById('diceBet').value);
    if (!bet || bet < 5) { GradusWeb.notify.warning('Минимальная ставка 5 ₽'); return; }
    if (!currentUser || currentUser.balance < bet) { GradusWeb.notify.error('Недостаточно средств'); return; }
    await updateBalance(-bet);

    const forceWin = shouldForceWin(bet) && Math.random() < 0.8;
    let dice;
    if (isRigged() && !forceWin) {
        if (selectedDiceType === 'number') {
            dice = selectedDiceValue === 1 ? 6 : selectedDiceValue - 1;
        } else if (selectedDiceType === 'low') {
            dice = 4 + Math.floor(Math.random() * 3);
        } else {
            dice = 1 + Math.floor(Math.random() * 3);
        }
    } else if (forceWin) {
        if (selectedDiceType === 'number') dice = selectedDiceValue;
        else if (selectedDiceType === 'low') dice = Math.floor(Math.random() * 3) + 1;
        else dice = Math.floor(Math.random() * 3) + 4;
    } else {
        dice = Math.floor(Math.random() * 6) + 1;
    }

    const faceEl = document.getElementById('diceFace');
    faceEl.style.transform = 'rotate(360deg)';
    setTimeout(() => {
        faceEl.style.transform = 'rotate(0deg)';
        faceEl.textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][dice-1];
    }, 500);

    let win = 0;
    const type = selectedDiceType, value = selectedDiceValue;
    if (type === 'number') { if (dice === value) win = bet * 4.9; }
    else if (type === 'low') { if (dice <= 3) win = bet * 1.9; }
    else if (type === 'high') { if (dice >= 4) win = bet * 1.9; }

    setTimeout(async () => {
        if (win > 0) {
            await updateBalance(win);
            GradusWeb.notify.success(`Выпало ${dice}. Выигрыш: ${round(win).toFixed(2)} ₽ (x${(win/bet).toFixed(1)})`);
        } else GradusWeb.notify.error(`Выпало ${dice}. Вы проиграли.`);
        await incrementGamesPlayed();
        selectedDiceType = null; selectedDiceValue = null;
        document.getElementById('diceRollBtn').disabled = true;
        document.querySelectorAll('.dice-btn').forEach(b => { b.style.background = ''; b.style.color = ''; });
    }, 600);
}

// Колесо
async function spinWheel() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const bet = parseFloat(document.getElementById('wheelBet').value);
    if (!bet || bet < 5) { GradusWeb.notify.warning('Минимальная ставка 5 ₽'); return; }
    if (currentUser.balance < bet) { GradusWeb.notify.error('Недостаточно средств'); return; }
    await updateBalance(-bet);

    const forceWin = shouldForceWin(bet) && Math.random() < 0.8;
    const rigged = isRigged() && !forceWin;
    const win = forceWin ? true : (rigged ? false : Math.random() < 1/3);

    const wheel = document.getElementById('wheelSpinner');
    wheel.style.transition = 'none';
    wheel.style.transform = 'rotate(0deg)';
    wheel.offsetHeight;
    let finalAngle;
    if (win) finalAngle = Math.floor(Math.random() * 120);
    else finalAngle = 120 + Math.floor(Math.random() * 240);
    const totalRotation = (Math.floor(Math.random() * 4) + 2) * 360 + finalAngle;
    wheel.style.transition = 'transform 3s ease-out';
    wheel.style.transform = `rotate(${totalRotation}deg)`;
    setTimeout(async () => {
        if (win) {
            const winAmount = round(bet * 2.7);
            await updateBalance(winAmount);
            GradusWeb.notify.success(`Поздравляем! Выигрыш: ${winAmount.toFixed(2)} ₽ (x2.7)`);
        } else GradusWeb.notify.error('Не повезло. Попробуйте ещё раз.');
        await incrementGamesPlayed();
    }, 3100);
}

// Мины
function getMaxMultiplier(minesCount) {
    return round(3 + 22 * (minesCount - 1) / 23);
}

function updateMinesCoefficients() {
    const slider = document.getElementById('minesSlider');
    if (!slider) return;
    const mines = parseInt(slider.value);
    const safe = 25 - mines;
    const maxMult = getMaxMultiplier(mines);
    let html = '<p style="margin-top:8px;">Множители за открытые безопасные клетки:</p><ul>';
    for (let k = 1; k <= safe; k++) {
        const mult = round(1 + (maxMult - 1) * k / safe);
        html += `<li>${k} кл. — x${mult.toFixed(2)}</li>`;
    }
    html += '</ul>';
    document.getElementById('minesCoeffs').innerHTML = html;
}

async function startMinesGame() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (minesGame) {
        document.getElementById('minesGameArea').style.display = 'none';
        minesGame = null;
    }
    const bet = parseFloat(document.getElementById('minesBet').value);
    if (!bet || bet < 5) { GradusWeb.notify.warning('Минимальная ставка 5 ₽'); return; }
    if (currentUser.balance < bet) { GradusWeb.notify.error('Недостаточно средств'); return; }
    const minesCount = parseInt(document.getElementById('minesSlider').value);
    if (minesCount < 1 || minesCount > 24) return;

    await updateBalance(-bet);

    const grid = new Array(25).fill(0);
    const indices = Array.from({length: 25}, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let i = 0; i < minesCount; i++) grid[indices[i]] = 1;

    const rigged = isRigged();
    const disableRig = currentUser.gamesPlayed < 2 && bet < 70;

    minesGame = {
        bet,
        minesCount,
        grid,
        revealed: new Set(),
        status: 'playing',
        blowIndex: -1,
        rigged: rigged && !disableRig,
        riggedApplied: false,
        maxMultiplier: getMaxMultiplier(minesCount)
    };

    document.getElementById('startMinesGame').disabled = true;
    document.getElementById('minesGameArea').style.display = 'block';
    document.getElementById('cashoutMinesBtn').style.display = 'inline-block';
    document.getElementById('minesMultiplier').textContent = '1.00';
    renderMinesGrid();
}

function renderMinesGrid() {
    const gridEl = document.getElementById('minesGrid');
    if (!gridEl || !minesGame) return;
    gridEl.innerHTML = '';
    const { status, revealed, grid, blowIndex } = minesGame;

    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.className = 'mine-cell';
        const isRevealed = revealed.has(i);
        const isMine = grid[i] === 1;

        if (status === 'playing') {
            if (isRevealed) {
                cell.classList.add('revealed');
                cell.textContent = isMine ? '💣' : '✅';
                if (isMine) cell.classList.add('mine');
            } else {
                cell.addEventListener('click', () => handleMineClick(i));
            }
        } else {
            cell.classList.add('revealed');
            if (status === 'lost' && i === blowIndex) {
                cell.textContent = '❌';
                cell.classList.add('mine');
            } else if (isMine) {
                cell.textContent = '💣';
                cell.classList.add('mine');
            } else if (isRevealed) {
                cell.textContent = '✅';
            } else {
                cell.textContent = '💎';
            }
        }
        gridEl.appendChild(cell);
    }
}

function endMinesGame() {
    document.getElementById('cashoutMinesBtn').style.display = 'none';
    document.getElementById('startMinesGame').disabled = false;
}

async function handleMineClick(index) {
    if (!minesGame || minesGame.status !== 'playing') return;
    if (minesGame.revealed.has(index)) return;

    if (minesGame.rigged && !minesGame.riggedApplied && minesGame.revealed.size < 3 && minesGame.grid[index] === 0) {
        const clicksToApply = Math.floor(Math.random() * 3) + 1;
        if (minesGame.revealed.size + 1 === clicksToApply) {
            minesGame.grid[index] = 1;
            let candidates = [];
            for (let i = 0; i < 25; i++) {
                if (minesGame.grid[i] === 1 && i !== index && !minesGame.revealed.has(i)) candidates.push(i);
            }
            if (candidates.length > 0) {
                const removeIdx = candidates[Math.floor(Math.random() * candidates.length)];
                minesGame.grid[removeIdx] = 0;
            }
            minesGame.riggedApplied = true;
        }
    }

    minesGame.revealed.add(index);

    if (minesGame.grid[index] === 1) {
        minesGame.blowIndex = index;
        minesGame.status = 'lost';
        renderMinesGrid();
        await incrementGamesPlayed();
        GradusWeb.notify.error('Вы наткнулись на мину!');
        endMinesGame();
    } else {
        const safeOpened = [...minesGame.revealed].filter(i => minesGame.grid[i] === 0).length;
        const totalSafe = 25 - minesGame.minesCount;

        if (safeOpened >= totalSafe) {
            const winAmount = round(minesGame.bet * minesGame.maxMultiplier);
            await updateBalance(winAmount);
            GradusWeb.notify.success(`Все безопасные открыты! Выигрыш: ${winAmount.toFixed(2)} ₽ (x${minesGame.maxMultiplier.toFixed(2)})`);
            minesGame.status = 'won';
            renderMinesGrid();
            await incrementGamesPlayed();
            endMinesGame();
        } else {
            const mult = round(1 + (minesGame.maxMultiplier - 1) * safeOpened / totalSafe);
            document.getElementById('minesMultiplier').textContent = mult.toFixed(2);
            renderMinesGrid();
        }
    }
}

async function cashoutMines() {
    if (!minesGame || minesGame.status !== 'playing') return;
    const safeOpened = [...minesGame.revealed].filter(i => minesGame.grid[i] === 0).length;
    const totalSafe = 25 - minesGame.minesCount;
    const mult = round(1 + (minesGame.maxMultiplier - 1) * safeOpened / totalSafe);
    const winAmount = round(minesGame.bet * mult);
    await updateBalance(winAmount);
    GradusWeb.notify.success(`Выигрыш: ${winAmount.toFixed(2)} ₽ (x${mult.toFixed(2)})`);

    minesGame.status = 'won';
    renderMinesGrid();
    await incrementGamesPlayed();
    endMinesGame();
}

// Плинко (исправленная анимация и подкрутка)
function buildPlinkoBoard() {
    const board = document.getElementById('plinkoBoard');
    if (!board) return;
    board.innerHTML = '';
    const boardWidth = board.offsetWidth;
    const boardHeight = board.offsetHeight || 380;
    // 13 рядов колышков для заполнения всего поля
    const rowsPegs = [3,4,5,6,7,8,9,10,11,10,9,8,7];
    const rowCount = rowsPegs.length;
    const rowHeight = (boardHeight - 40) / (rowCount - 1);

    for (let r = 0; r < rowCount; r++) {
        const pegsInRow = rowsPegs[r];
        const rowDiv = document.createElement('div');
        rowDiv.style.position = 'absolute';
        rowDiv.style.width = '100%';
        rowDiv.style.top = (r * rowHeight + 20) + 'px';
        rowDiv.style.display = 'flex';
        rowDiv.style.justifyContent = 'center';
        rowDiv.style.gap = '10px';
        // шахматный порядок для чётных рядов
        if (r % 2 === 1) {
            rowDiv.style.paddingLeft = (boardWidth / (pegsInRow + 1)) + 'px';
        }
        for (let c = 0; c < pegsInRow; c++) {
            const peg = document.createElement('div');
            peg.style.cssText = 'width:18px; height:18px; background: radial-gradient(circle at 30% 30%, #fff, #4f46e5); border-radius:50%; box-shadow: 0 0 5px rgba(255,255,255,0.5);';
            rowDiv.appendChild(peg);
        }
        board.appendChild(rowDiv);
    }
}

async function dropPlinkoBall() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const bet = parseFloat(document.getElementById('plinkoBet').value);
    if (!bet || bet < 5) { GradusWeb.notify.warning('Минимальная ставка 5 ₽'); return; }
    if (currentUser.balance < bet) { GradusWeb.notify.error('Недостаточно средств'); return; }
    await updateBalance(-bet);

    const btn = document.getElementById('dropBallBtn');
    btn.disabled = true;

    const board = document.getElementById('plinkoBoard');
    const boardWidth = board.offsetWidth;
    const boardHeight = board.offsetHeight;
    const colWidth = boardWidth / 7; // 7 финальных слотов

    // Если подкрутка — сразу направляем в проигрышный слот (0x)
    if (isRigged()) {
        var position = Math.floor(Math.random() * 4); // 0-3 => 0x
    } else {
        var position = 3; // стартовая позиция (центр)
    }

    // Создаём шарик
    const ball = document.createElement('div');
    ball.style.cssText = 'position: absolute; width: 22px; height: 22px; background: radial-gradient(circle at 30% 30%, #ffd700, #b8860b); border-radius: 50%; box-shadow: 0 0 10px rgba(255,215,0,0.8); transition: left 0.15s ease-in, top 0.15s ease-in; z-index: 10;';
    board.appendChild(ball);

    ball.style.left = (position * colWidth + colWidth/2 - 11) + 'px';
    ball.style.top = '0px';

    const rowsPegs = [3,4,5,6,7,8,9,10,11,10,9,8,7];
    const rowHeight = (boardHeight - 40) / (rowsPegs.length - 1);

    for (let i = 1; i < rowsPegs.length; i++) {
        const direction = Math.random() < 0.5 ? -1 : 1;
        if (position > 0 && direction === -1) position--;
        else if (position < 6 && direction === 1) position++;
        ball.style.left = (position * colWidth + colWidth/2 - 11) + 'px';
        ball.style.top = (i * rowHeight + 20) + 'px';
        await new Promise(resolve => setTimeout(resolve, 120));
    }

    // Результат по финальной позиции
    let multiplier = 0;
    if (position >= 0 && position <= 3) multiplier = 0;
    else if (position >= 4 && position <= 5) multiplier = 2;
    else if (position === 6) multiplier = 5;

    ball.remove();

    const winAmount = round(bet * multiplier);
    if (winAmount > 0) {
        await updateBalance(winAmount);
        GradusWeb.notify.success(`Выигрыш: ${winAmount.toFixed(2)} ₽ (x${multiplier})`);
    } else {
        GradusWeb.notify.error('Шарик упал в 0x. Попробуйте снова.');
    }
    await incrementGamesPlayed();
    btn.disabled = false;
}

// Лотерея (исправлено двойное нажатие)
function buildLotteryGrid() {
    const grid = document.getElementById('lotteryGrid');
    if (!grid) return;
    grid.innerHTML = '';
    lotterySelected.clear();
    updateLotteryCount();
    for (let i = 21; i <= 80; i++) {
        const cell = document.createElement('div');
        cell.className = 'lottery-num';
        cell.textContent = i;
        cell.addEventListener('click', () => {
            if (lotterySelected.has(i)) {
                lotterySelected.delete(i);
                cell.classList.remove('selected');
            } else if (lotterySelected.size < 5) {
                lotterySelected.add(i);
                cell.classList.add('selected');
            }
            updateLotteryCount();
        });
        grid.appendChild(cell);
    }
}

function updateLotteryCount() {
    document.getElementById('lotteryCount').textContent = lotterySelected.size;
    document.getElementById('playLotteryBtn').disabled = lotterySelected.size !== 5;
}

async function playLottery() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    // Блокируем кнопку сразу, чтобы предотвратить двойной клик
    const btn = document.getElementById('playLotteryBtn');
    if (!btn) return;
    btn.disabled = true;

    const bet = parseFloat(document.getElementById('lotteryBet').value);
    if (!bet || bet < 5) { GradusWeb.notify.warning('Минимальная ставка 5 ₽'); return; }
    if (currentUser.balance < bet) { GradusWeb.notify.error('Недостаточно средств'); return; }
    if (lotterySelected.size !== 5) { GradusWeb.notify.warning('Выберите ровно 5 чисел'); return; }

    await updateBalance(-bet);

    // Генерируем 10 выигрышных чисел
    const winNumbers = new Set();
    while (winNumbers.size < 10) {
        winNumbers.add(Math.floor(Math.random() * 60) + 21);
    }

    let matches = 0;
    lotterySelected.forEach(num => {
        if (winNumbers.has(num)) matches++;
    });

    if (isRigged()) {
        matches = 0;
        const forcedWinNumbers = new Set();
        while (forcedWinNumbers.size < 10) {
            let num = Math.floor(Math.random() * 60) + 21;
            if (!lotterySelected.has(num)) forcedWinNumbers.add(num);
        }
        winNumbers.clear();
        forcedWinNumbers.forEach(n => winNumbers.add(n));
    }

    const multipliers = [0, 2, 5, 10, 20, 50];
    const winMultiplier = multipliers[matches];
    const winAmount = round(bet * winMultiplier);

    const resultDiv = document.getElementById('lotteryResult');
    resultDiv.innerHTML = `
        <p>Выигрышные числа: ${[...winNumbers].join(', ')}</p>
        <p>Ваши числа: ${[...lotterySelected].join(', ')}</p>
        <p>Совпадений: ${matches}</p>
        <p>${winMultiplier > 0 ? `Выигрыш: ${winAmount.toFixed(2)} ₽ (x${winMultiplier})` : 'Вы проиграли.'}</p>
    `;

    if (winAmount > 0) {
        await updateBalance(winAmount);
        GradusWeb.notify.success(`Поздравляем! Выигрыш: ${winAmount.toFixed(2)} ₽ (x${winMultiplier})`);
    } else {
        GradusWeb.notify.error('К сожалению, вы проиграли. Попробуйте снова.');
    }
    await incrementGamesPlayed();

    document.querySelectorAll('.lottery-num').forEach(cell => {
        const num = parseInt(cell.textContent);
        if (winNumbers.has(num)) cell.classList.add('win');
        if (lotterySelected.has(num) && winNumbers.has(num)) cell.classList.add('match');
    });

    setTimeout(() => {
        buildLotteryGrid();
        resultDiv.innerHTML = '';
        // кнопка будет разблокирована после перестроения сетки (buildLotteryGrid сбрасывает выбор и обновляет состояние кнопки)
    }, 2000);
}

// ================== БЕСПЛАТНЫЕ ИГРЫ ==================
// Гонки
async function startRace() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const userRef = `CosmoCasino/user/${currentUser.username}`;
    try {
        const raw = await GradusServer.firebaseGet(`${FIREBASE_URL}${userRef}.json`);
        if (!raw || raw === 'null') return;
        const data = JSON.parse(raw);
        const today = new Date().toISOString().split('T')[0];
        if (data.lastDailyRace === today) { GradusWeb.notify.warning('Вы уже участвовали сегодня'); return; }
        await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/lastDailyRace.json`, JSON.stringify(today));

        let winner = Math.floor(Math.random() * 4) + 1;
        const track = document.getElementById('raceTrack');
        track.innerHTML = '';
        const racers = ['🚗', '🚙', '🏎️', '🚕'];
        for (let i = 0; i < 4; i++) {
            const lane = document.createElement('div'); lane.className = 'race-lane';
            const car = document.createElement('span'); car.className = 'race-car'; car.textContent = racers[i]; car.id = 'car' + (i+1);
            lane.appendChild(car);
            lane.innerHTML += '<div class="finish-line"></div>';
            track.appendChild(lane);
        }

        const speeds = [1,2,3,4].map(() => Math.random() * 2 + 0.5);
        const maxSpeed = Math.max(...speeds);
        const duration = 3000;
        for (let i = 0; i < 4; i++) {
            const car = document.getElementById('car' + (i+1));
            const distance = 200 - (speeds[i]/maxSpeed * 200);
            car.style.transition = `left ${duration}ms linear`;
            car.style.left = distance + 'px';
        }

        setTimeout(async () => {
            const order = [0,1,2,3].sort((a,b) => speeds[b] - speeds[a]);
            for (let place = 0; place < 4; place++) {
                const idx = order[place];
                const car = document.getElementById('car' + (idx+1));
                car.style.transition = 'left 0.5s ease-out';
                car.style.left = (200 - place*50) + 'px';
            }
            if (selectedRacer === order[0]+1) {
                await updateBalance(10);
                GradusWeb.notify.success('Ваш гонщик победил! +10 ₽');
            } else {
                GradusWeb.notify.info('Ваш гонщик проиграл. Попробуйте завтра.');
            }
            updateUI();
        }, duration + 100);
        selectedRacer = null;
        document.getElementById('raceStartBtn').disabled = true;
    } catch (e) { GradusWeb.notify.error('Ошибка соединения'); }
}

// Киберспорт
async function startCyberMatch() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const userRef = `CosmoCasino/user/${currentUser.username}`;
    try {
        const raw = await GradusServer.firebaseGet(`${FIREBASE_URL}${userRef}.json`);
        if (!raw || raw === 'null') return;
        const data = JSON.parse(raw);
        const today = new Date().toISOString().split('T')[0];
        if (data.lastDailyCyber === today) { GradusWeb.notify.warning('Вы уже играли сегодня'); return; }
        await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/lastDailyCyber.json`, JSON.stringify(today));

        cybersportActive = true;
        document.getElementById('startCyberBtn').disabled = true;
        document.getElementById('cyberGameArea').style.display = 'block';

        cyberTeams.left = [ {id:1, alive:true}, {id:2, alive:true}, {id:3, alive:true} ];
        cyberTeams.right = [ {id:4, alive:true}, {id:5, alive:true}, {id:6, alive:true} ];
        renderCyberField();

        const battleLog = document.getElementById('cyberLog');
        battleLog.innerHTML = '';
        cybersportTimer = setInterval(() => {
            const allAlive = [...cyberTeams.left.filter(p => p.alive), ...cyberTeams.right.filter(p => p.alive)];
            if (allAlive.length === 0) {
                clearInterval(cybersportTimer);
                return;
            }
            const victimIdx = Math.floor(Math.random() * allAlive.length);
            const victim = allAlive[victimIdx];
            victim.alive = false;

            renderCyberField();
            battleLog.innerHTML += `<p>💀 ${victim.id <= 3 ? 'Альфа' : 'Браво'} игрок ${victim.id} убит!</p>`;

            const leftAlive = cyberTeams.left.some(p => p.alive);
            const rightAlive = cyberTeams.right.some(p => p.alive);
            if (!leftAlive || !rightAlive) {
                clearInterval(cybersportTimer);
                cybersportActive = false;
                let winnerTeam = leftAlive ? 1 : 2;
                if (isRigged()) winnerTeam = winnerTeam === 1 ? 2 : 1;
                const userWin = (selectedCyberTeam === winnerTeam);
                if (userWin) {
                    updateBalance(10);
                    GradusWeb.notify.success('Ваша команда победила! +10 ₽');
                } else {
                    GradusWeb.notify.info('Ваша команда проиграла. Попробуйте завтра.');
                }
                document.getElementById('startCyberBtn').disabled = false;
                updateUI();
            }
        }, 1000);
    } catch (e) { GradusWeb.notify.error('Ошибка соединения'); }
}

function renderCyberField() {
    const field = document.getElementById('cyberField');
    if (!field) return;
    field.innerHTML = `
        <div class="cyber-team">
            ${cyberTeams.left.map(p => `
                <div class="cyber-player ${!p.alive ? 'dead' : ''}">
                    <span>🔫</span> Альфа ${p.id} ${!p.alive ? '💀' : ''}
                </div>
            `).join('')}
        </div>
        <div class="cyber-team">
            ${cyberTeams.right.map(p => `
                <div class="cyber-player ${!p.alive ? 'dead' : ''}">
                    <span>🔫</span> Браво ${p.id} ${!p.alive ? '💀' : ''}
                </div>
            `).join('')}
        </div>
    `;
}

// ================== UI ==================
function updateUI() {
    if (currentUser) {
        document.getElementById('balanceDisplay').textContent = currentUser.balance.toFixed(2) + ' ₽';
        document.getElementById('authControls').innerHTML = `<span>${currentUser.username}</span><button onclick="logout()">Выйти</button>`;
        document.getElementById('profileEmail').textContent = currentUser.email || '—';
        document.getElementById('profileGames').textContent = currentUser.gamesPlayed || 0;
        document.getElementById('profileDeposited').textContent = (currentUser.totalDeposited || 0).toFixed(2);
        document.getElementById('profileWithdrawn').textContent = (currentUser.totalWithdrawn || 0).toFixed(2);
        const canWithdraw = (currentUser.totalDeposited || 0) >= 10 && (currentUser.gamesPlayed || 0) >= 3;
        document.getElementById('withdrawBtn').disabled = !canWithdraw;
        document.getElementById('attachEmailBtn').style.display = currentUser.email ? 'none' : 'inline-block';
    } else {
        document.getElementById('balanceDisplay').textContent = '0.00 ₽';
        document.getElementById('authControls').innerHTML = `<button onclick="showLoginForm()">Вход</button><button onclick="showRegForm()">Регистрация</button>`;
        document.getElementById('profileEmail').textContent = '—';
        document.getElementById('profileGames').textContent = '0';
        document.getElementById('profileDeposited').textContent = '0.00';
        document.getElementById('profileWithdrawn').textContent = '0.00';
        document.getElementById('withdrawBtn').disabled = true;
        document.getElementById('attachEmailBtn').style.display = 'inline-block';
    }
}

window.addEventListener('load', () => GradusStatic.init(siteConfig));