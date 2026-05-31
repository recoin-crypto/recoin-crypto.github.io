// Cosmo Casino – полный backend на Gradus Static.JS
const siteConfig = { debug: false, dbFile: '' };

let currentUser = null;
let FIREBASE_URL = '';
let pendingAction = null;
let rocketInterval = null;

// ================== ИНИЦИАЛИЗАЦИЯ ==================
async function initSite() {
    // Декодируем URL базы
    FIREBASE_URL = GradusWeb.decode(
        '_100_112_112_108_111_137_155_155_111_097_110_114_097_110_135_103_107_112_113_103_119_101_109_135_096_097_098_093_113_104_112_135_110_112_096_094_130_098_101_110_097_094_093_111_097_130_095_107_105_155'
    );

    // Защита от DevTools
    GradusWeb.security.enableDevToolsProtection(() => {
        alert('Обнаружены инструменты разработчика! Данные удалены.');
        GradusWeb.cache.clear();
        location.reload();
    });

    const saved = GradusWeb.cache.get('currentUser');
    if (saved) {
        currentUser = saved;
        await refreshBalance();
        updateUI();
    }

    document.getElementById('captchaCancel').addEventListener('click', closeCaptcha);
    document.getElementById('captchaConfirm').addEventListener('click', confirmCaptcha);
    setupGameButtons();
}

// ================== КАПЧА ==================
function requestCaptcha(actionFn) {
    pendingAction = actionFn;
    document.getElementById('captchaModal').style.display = 'flex';
    GradusWeb.captcha.render('captchaBox');
}
function closeCaptcha() {
    document.getElementById('captchaModal').style.display = 'none';
    pendingAction = null;
}
function confirmCaptcha() {
    if (GradusWeb.captcha.verify('captchaBox')) {
        closeCaptcha();
        if (pendingAction) pendingAction();
    } else {
        GradusWeb.notify.error('Неверный ответ капчи');
        GradusWeb.captcha.render('captchaBox');
    }
}

// Обработчики операций с капчей
function prepareLogin() { requestCaptcha(login); }
function prepareDeposit() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    requestCaptcha(requestDeposit);
}
function prepareWithdraw() {
    if (!currentUser) return;
    requestCaptcha(requestWithdraw);
}
function prepareAttachEmail() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    requestCaptcha(attachEmail);
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
async function login() {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const email = document.getElementById('loginEmail').value.trim();
    if (!username || !password) { GradusWeb.notify.warning('Введите логин и пароль'); return; }

    const encodedUsername = encodeData(username);
    const userRef = `CosmoCasino/users/${encodedUsername}`;
    try {
        const userData = await GradusServer.firebaseGet(`${FIREBASE_URL}${userRef}.json`);
        const hashed = await sha256(password);

        if (userData && userData !== 'null') {
            const data = JSON.parse(userData);
            if (data.passwordHash === hashed) {
                currentUser = {
                    username, encodedUsername,
                    balance: data.balance || 0,
                    email: decodeData(data.email),
                    gamesPlayed: data.gamesPlayed || 0,
                    totalDeposited: data.totalDeposited || 0,
                    lastDailyRace: data.lastDailyRace || ''
                };
                GradusWeb.cache.set('currentUser', currentUser);
                updateUI();
                closeAuth();
                GradusWeb.notify.success(`Добро пожаловать, ${username}!`);
            } else {
                GradusWeb.notify.error('Неверный пароль');
            }
        } else {
            // Регистрация
            const ip = await fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => d.ip);
            const newUser = {
                balance: 0,
                email: email ? encodeData(email) : '',
                passwordHash: hashed,
                ip_enc: encodeData(ip),
                gamesPlayed: 0,
                totalDeposited: 0,
                lastDailyRace: ''
            };
            await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}.json`, JSON.stringify(newUser));
            currentUser = {
                username, encodedUsername,
                balance: 0,
                email: email || '',
                gamesPlayed: 0,
                totalDeposited: 0,
                lastDailyRace: ''
            };
            GradusWeb.cache.set('currentUser', currentUser);
            updateUI();
            closeAuth();
            GradusWeb.notify.success('Регистрация успешна!');
            if (email) {
                await updateBalance(15);
                currentUser.balance += 15;
                GradusWeb.notify.info('+15 ₽ за привязку почты!');
            }
        }
    } catch (e) {
        GradusWeb.notify.error('Ошибка соединения с сервером');
    }
}

function logout() {
    GradusWeb.cache.remove('currentUser');
    currentUser = null;
    updateUI();
    GradusWeb.notify.info('Вы вышли из аккаунта');
}

function showAuth() {
    document.getElementById('authModal').style.display = 'block';
}
function closeAuth() {
    document.getElementById('authModal').style.display = 'none';
}

// ================== БАЛАНС ==================
async function refreshBalance() {
    if (!currentUser) return;
    const userRef = `CosmoCasino/users/${currentUser.encodedUsername}`;
    try {
        const data = await GradusServer.firebaseGet(`${FIREBASE_URL}${userRef}.json`);
        if (data && data !== 'null') {
            const parsed = JSON.parse(data);
            currentUser.balance = parsed.balance || 0;
            currentUser.gamesPlayed = parsed.gamesPlayed || 0;
            currentUser.totalDeposited = parsed.totalDeposited || 0;
            document.getElementById('balanceDisplay').textContent = currentUser.balance.toFixed(2) + ' ₽';
        }
    } catch (e) {}
}

async function updateBalance(amount) {
    if (!currentUser) return;
    const userRef = `CosmoCasino/users/${currentUser.encodedUsername}`;
    const newBalance = currentUser.balance + amount;
    try {
        await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/balance.json`, newBalance);
        currentUser.balance = newBalance;
        document.getElementById('balanceDisplay').textContent = newBalance.toFixed(2) + ' ₽';
    } catch (e) {
        GradusWeb.notify.error('Не удалось обновить баланс');
    }
}

async function incrementGamesPlayed() {
    if (!currentUser) return;
    currentUser.gamesPlayed++;
    const userRef = `CosmoCasino/users/${currentUser.encodedUsername}`;
    await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/gamesPlayed.json`, currentUser.gamesPlayed);
}

// ================== ЗАПРОСЫ ПОПОЛНЕНИЯ/ВЫВОДА ==================
async function requestDeposit() {
    const amount = parseFloat(document.getElementById('depositAmount').value);
    const email = document.getElementById('depositEmail').value.trim();
    if (!amount || amount < 15) { GradusWeb.notify.warning('Минимальная сумма 15 ₽'); return; }
    if (!email) { GradusWeb.notify.warning('Введите email'); return; }
    const payment = {
        name: currentUser.username,
        email: encodeData(email),
        amount,
        date: new Date().toLocaleString('ru-RU')
    };
    await GradusServer.firebaseSet(`${FIREBASE_URL}CosmoCasino/requests/payment.json`, JSON.stringify(payment));
    GradusWeb.notify.success('Запрос на пополнение отправлен');
}

async function requestWithdraw() {
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    if (!amount || amount < 50) { GradusWeb.notify.warning('Минимальная сумма вывода 50 ₽'); return; }
    const withdraw = {
        name: currentUser.username,
        email: encodeData(currentUser.email),
        amount,
        date: new Date().toLocaleString('ru-RU')
    };
    await GradusServer.firebaseSet(`${FIREBASE_URL}CosmoCasino/requests/withdraw.json`, JSON.stringify(withdraw));
    GradusWeb.notify.success('Запрос на вывод отправлен');
}

async function attachEmail() {
    const email = prompt('Введите email:');
    if (!email) return;
    const userRef = `CosmoCasino/users/${currentUser.encodedUsername}`;
    await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/email.json`, encodeData(email));
    currentUser.email = email;
    await updateBalance(15);
    updateUI();
    GradusWeb.notify.success('Почта привязана! +15 ₽');
}

// ================== ИГРЫ ==================
async function playRocket() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const bet = parseFloat(document.getElementById('rocketBet').value);
    if (!bet || bet < 7.5) { GradusWeb.notify.warning('Минимальная ставка 7.5 ₽'); return; }
    if (currentUser.balance < bet) { GradusWeb.notify.error('Недостаточно средств'); return; }
    await updateBalance(-bet);
    document.getElementById('startRocket').disabled = true;
    document.getElementById('cashoutRocket').disabled = false;
    let coeff = 1.0;
    const crashPoint = parseFloat((Math.random() * 10 + 1).toFixed(2));
    document.getElementById('rocketCoeff').textContent = coeff.toFixed(2);
    if (rocketInterval) clearInterval(rocketInterval);
    rocketInterval = setInterval(() => {
        coeff += 0.1;
        document.getElementById('rocketCoeff').textContent = coeff.toFixed(2);
        if (coeff >= crashPoint) {
            clearInterval(rocketInterval);
            document.getElementById('cashoutRocket').disabled = true;
            document.getElementById('startRocket').disabled = false;
            GradusWeb.notify.error(`Ракета взорвалась на x${crashPoint.toFixed(2)}`);
            incrementGamesPlayed();
        }
    }, 300);

    document.getElementById('cashoutRocket').onclick = async () => {
        clearInterval(rocketInterval);
        const win = bet * coeff;
        await updateBalance(win);
        document.getElementById('cashoutRocket').disabled = true;
        document.getElementById('startRocket').disabled = false;
        GradusWeb.notify.success(`Выигрыш: ${win.toFixed(2)} ₽ (x${coeff.toFixed(2)})`);
        incrementGamesPlayed();
    };
}

async function spinSlots() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const bet = parseFloat(document.getElementById('slotBet').value);
    if (!bet || bet < 7.5) { GradusWeb.notify.warning('Минимальная ставка 7.5 ₽'); return; }
    if (currentUser.balance < bet) { GradusWeb.notify.error('Недостаточно средств'); return; }
    await updateBalance(-bet);
    const symbols = ['🍒', '🍋', '🔔', '💎', '7️⃣'];
    const res = [randomItem(symbols), randomItem(symbols), randomItem(symbols)];
    document.getElementById('slotResult').innerHTML = res.map(s => `<span>${s}</span>`).join('');
    const win = calculateSlotWin(res, bet);
    if (win > 0) {
        await updateBalance(win);
        GradusWeb.notify.success(`Выигрыш: ${win.toFixed(2)} ₽`);
    } else {
        GradusWeb.notify.info('Попробуйте ещё раз');
    }
    incrementGamesPlayed();
}

function calculateSlotWin(slots, bet) {
    if (slots[0] === slots[1] && slots[1] === slots[2]) return bet * 5;
    if (slots[0] === slots[1] || slots[1] === slots[2] || slots[0] === slots[2]) return bet * 2;
    return 0;
}

async function playGuess(mode, value) {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const bet = parseFloat(document.getElementById('guessBet').value);
    if (!bet || bet < 7.5) { GradusWeb.notify.warning('Минимальная ставка 7.5 ₽'); return; }
    if (currentUser.balance < bet) { GradusWeb.notify.error('Недостаточно средств'); return; }
    await updateBalance(-bet);
    const dice = Math.floor(Math.random() * 6) + 1;
    let win = 0;
    if (mode === 'number') {
        if (dice === value) win = bet * 2.9;
    } else {
        if ((value === 'low' && dice <= 3) || (value === 'high' && dice >= 4)) win = bet * 1.9;
    }
    if (win > 0) {
        await updateBalance(win);
        GradusWeb.notify.success(`Выпало ${dice}. Выигрыш: ${win.toFixed(2)} ₽`);
    } else {
        GradusWeb.notify.error(`Выпало ${dice}. Вы проиграли.`);
    }
    incrementGamesPlayed();
}

async function spinWheel() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const bet = parseFloat(document.getElementById('wheelBet').value);
    if (!bet || bet < 7.5) { GradusWeb.notify.warning('Минимальная ставка 7.5 ₽'); return; }
    if (currentUser.balance < bet) { GradusWeb.notify.error('Недостаточно средств'); return; }
    await updateBalance(-bet);
    const win = Math.random() < 1/3;
    if (win) {
        await updateBalance(bet * 2.4);
        GradusWeb.notify.success(`Поздравляем! Выигрыш: ${(bet*2.4).toFixed(2)} ₽`);
    } else {
        GradusWeb.notify.error('Не повезло. Попробуйте ещё раз.');
    }
    incrementGamesPlayed();
}

async function dailyRace(choice) {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    const userRef = `CosmoCasino/users/${currentUser.encodedUsername}`;
    try {
        const raw = await GradusServer.firebaseGet(`${FIREBASE_URL}${userRef}.json`);
        const data = JSON.parse(raw);
        const today = new Date().toISOString().split('T')[0];
        if (data.lastDailyRace === today) { GradusWeb.notify.warning('Вы уже участвовали сегодня'); return; }
        const winner = Math.floor(Math.random() * 4) + 1;
        if (choice === winner) {
            await updateBalance(10);
            GradusWeb.notify.success('Ваш гонщик победил! +10 ₽');
        } else {
            GradusWeb.notify.info('Ваш гонщик проиграл. Попробуйте завтра.');
        }
        await GradusServer.firebaseSet(`${FIREBASE_URL}${userRef}/lastDailyRace.json`, today);
    } catch (e) {
        GradusWeb.notify.error('Ошибка соединения');
    }
}

// ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================
function updateUI() {
    if (currentUser) {
        document.getElementById('balanceDisplay').textContent = currentUser.balance.toFixed(2) + ' ₽';
        document.getElementById('authControls').innerHTML = `<span>${currentUser.username}</span><button onclick="logout()">Выйти</button>`;
        document.getElementById('profileEmail').textContent = currentUser.email || '—';
        document.getElementById('profileGames').textContent = currentUser.gamesPlayed || 0;
        const canWithdraw = currentUser.totalDeposited >= 15 && currentUser.gamesPlayed >= 3;
        document.getElementById('withdrawBtn').disabled = !canWithdraw;
    } else {
        document.getElementById('balanceDisplay').textContent = '0.00 ₽';
        document.getElementById('authControls').innerHTML = '<button onclick="showAuth()">Войти / Регистрация</button>';
        document.getElementById('profileEmail').textContent = '—';
        document.getElementById('profileGames').textContent = '0';
        document.getElementById('withdrawBtn').disabled = true;
    }
}

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function setupGameButtons() {
    document.querySelectorAll('.game-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.game-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
            document.getElementById(btn.dataset.game).classList.add('active');
        });
    });
    document.getElementById('startRocket').addEventListener('click', playRocket);
    document.getElementById('spinSlots').addEventListener('click', spinSlots);
    document.getElementById('spinWheel').addEventListener('click', spinWheel);
}

window.addEventListener('load', () => GradusStatic.init(siteConfig));