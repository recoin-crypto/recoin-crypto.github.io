// ============================================================
// site.js — Reckon Coin (финальная версия с друзьями, VIP, аватарками, жалобами)
// ============================================================

console.log('[Reckon] site.js загружен');

// === ДЕКОДИРУЕМ URL ===
const encodedUrl = '_100_112_112_108_111_137_155_155_111_097_110_114_097_110_135_103_107_112_113_103_119_101_109_135_096_097_098_093_113_104_112_135_110_112_096_094_130_098_101_110_097_094_093_111_097_101_107_130_095_107_105_155';
let firebaseDecoded = '';
try {
    firebaseDecoded = GradusWeb.decode(encodedUrl);
    console.log('[Reckon] Firebase URL декодирован');
} catch(e) {
    console.error('[Reckon] Ошибка декодирования URL:', e);
}

const siteConfig = {
    debug: false,
    firebaseURL: firebaseDecoded.replace(/\/$/, '')
};

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let currentUser = null;
let chartInstance = null;
let isLoginMode = true;
let isSubmitting = false;
let updateInterval = null;
let currentPeriod = '1h';
let allHistoryData = [];
let freeAvatars = [];
let friendsListCache = {};

// === ВАЛЮТА ===
let selectedCurrency = localStorage.getItem('recoin_currency') || 'USD';
let exchangeRates = { USD: 1, RUB: 90, BYN: 3.2 };

// === ЗАГРУЗКА РЕАЛЬНЫХ КУРСОВ ===
async function loadExchangeRates() {
    try {
        const cached = localStorage.getItem('recoin_rates');
        if (cached) {
            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp < 3600000) {
                exchangeRates = data.rates;
                return;
            }
        }
        const response = await GradusServer.get('https://api.exchangerate-api.com/v4/latest/USD');
        if (response) {
            const json = JSON.parse(response);
            const rates = json.rates;
            exchangeRates = {
                USD: 1,
                RUB: rates.RUB || 78,
                BYN: rates.BYN || 3.2
            };
            localStorage.setItem('recoin_rates', JSON.stringify({ rates: exchangeRates, timestamp: Date.now() }));
        }
    } catch (e) {
        console.warn('[Reckon] Не удалось загрузить курсы валют:', e);
    }
}

//function logToScreen(msg) {
//    const el = document.getElementById('debug-log');
//    if (el) {
//        el.classList.add('active');
//        el.textContent += msg + '\n';
//        el.scrollTop = el.scrollHeight;
//    }
//    console.log('[Reckon] ' + msg);
//}

function logToScreen(msg) {
    console.log('[Reckon] Deleted log');
}

// === ФУНКЦИИ ВАЛЮТ ===
function getCurrencyRate() { return exchangeRates[selectedCurrency] || 1; }
function getCurrencySymbol() { const s = { USD: '$', RUB: '₽', BYN: 'Br' }; return s[selectedCurrency] || '$'; }
function formatCurrency(amountUSD) { const rate = getCurrencyRate(); const symbol = getCurrencySymbol(); return symbol + (amountUSD * rate).toFixed(2); }
function formatPrice(priceUSD) { const rate = getCurrencyRate(); const symbol = getCurrencySymbol(); return symbol + (priceUSD * rate).toFixed(6); }
function formatBalanceUSD(amountUSD) { return '$' + amountUSD.toFixed(3); }

// ============================================================
// 1. FIREBASE
// ============================================================
async function readFirebase(path) {
    const url = siteConfig.firebaseURL + '/recoin/' + path + '.json';
    try {
        const response = await GradusServer.get(url);
        return response ? JSON.parse(response) : null;
    } catch(e) {
        console.error('[Reckon] readFirebase ошибка:', e);
        return null;
    }
}
async function writeFirebase(path, data) {
    const url = siteConfig.firebaseURL + '/recoin/' + path + '.json';
    try {
        await GradusServer.firebaseSet(url, data);
        return true;
    } catch(e) {
        console.error('[Reckon] writeFirebase ошибка:', e);
        return false;
    }
}
async function pushFirebase(path, data) {
    const url = siteConfig.firebaseURL + '/recoin/' + path + '.json';
    try {
        const response = await GradusServer.post(url, data);
        return response;
    } catch(e) {
        console.error('[Reckon] pushFirebase ошибка:', e);
        return null;
    }
}
async function deleteFirebase(path) {
    const url = siteConfig.firebaseURL + '/recoin/' + path + '.json';
    try {
        await GradusServer.firebaseSet(url, null);
        return true;
    } catch(e) {
        console.error('[Reckon] deleteFirebase ошибка:', e);
        return false;
    }
}

// ============================================================
// 2. ОБРАБОТЧИКИ GRADUS
// ============================================================
function registerHandlers() {
    try {
        GradusStatic.registerHandler('get_price', async () => {
            const d = await readFirebase('price_current');
            if (d && d.price) return formatPrice(d.price);
            return getCurrencySymbol() + '0.000000';
        });
    } catch (e) {
        console.warn('[Reckon] registerHandlers не удалось:', e);
    }
}

// ============================================================
// 3. КАПЧА (без изменений)
// ============================================================
function generateCaptchaImage(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 60;
    canvas.style.border = '1px solid #2a2a3a';
    canvas.style.borderRadius = '8px';
    canvas.style.background = '#1a1a28';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operators = ['+', '-'];
    const op = operators[Math.floor(Math.random() * operators.length)];
    let result;
    if (op === '+') result = num1 + num2;
    else result = num1 - num2;
    const text = num1 + ' ' + op + ' ' + num2 + ' = ?';
    canvas.dataset.answer = result;

    ctx.font = 'bold 28px Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (let i = 0; i < 30; i++) {
        ctx.strokeStyle = 'rgba(255,255,255,' + Math.random() * 0.3 + ')';
        ctx.lineWidth = Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i < 100; i++) {
        ctx.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.5 + ')';
        ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
    }
    ctx.fillStyle = '#4a9eff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, canvas.width/2, canvas.height/2 + 2);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < 0.02) {
            data[i] = 255;
            data[i+1] = 255;
            data[i+2] = 255;
        }
    }
    ctx.putImageData(imageData, 0, 0);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Введите ответ';
    input.className = 'captcha-input';
    input.style.cssText = 'margin-top:10px; width:100%; padding:8px; background:#1a1a28; border:1px solid #2a2a3a; border-radius:6px; color:#e0e0e0;';
    container.appendChild(input);

    container.verify = function() {
        const val = input.value.trim();
        return val == canvas.dataset.answer;
    };
}

// ============================================================
// 4. ОБНОВЛЕНИЕ UI
// ============================================================
async function updateUIElements() {
    const usernameEl = document.getElementById('username');
    const uidEl = document.getElementById('uid-display');
    const coinBalanceEl = document.getElementById('coin-balance');
    const usdBalanceEl = document.getElementById('usd-balance');
    const priceEl = document.getElementById('current-price');
    const marketCapEl = document.getElementById('market-cap');
    const volumeEl = document.getElementById('volume');
    const totalSupplyEl = document.getElementById('total-supply');
    const priceChangeEl = document.getElementById('price-change');
    const historyEl = document.getElementById('history-list');
    const avatarImg = document.getElementById('avatar-img');
    const avatarEmoji = document.querySelector('.avatar-emoji');
    const commissionPoolEl = document.getElementById('commission-pool');
    const vipBadgeEl = document.getElementById('vip-badge');
    const vipExpiryEl = document.getElementById('vip-expiry');

    if (!usernameEl) return;

    if (!currentUser) {
        usernameEl.textContent = 'Гость';
        if (uidEl) uidEl.textContent = 'UID: —';
        if (coinBalanceEl) coinBalanceEl.textContent = '0.00';
        if (usdBalanceEl) usdBalanceEl.textContent = '$0.000';
        if (priceEl) priceEl.textContent = '$0.000000';
        if (marketCapEl) marketCapEl.textContent = '$0.00';
        if (volumeEl) volumeEl.textContent = '$0.00';
        if (totalSupplyEl) totalSupplyEl.textContent = '0';
        if (priceChangeEl) priceChangeEl.textContent = '▲ 0.00%';
        if (historyEl) historyEl.innerHTML = '<p>Войдите в аккаунт</p>';
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarEmoji) avatarEmoji.style.display = 'inline-block';
        if (commissionPoolEl) commissionPoolEl.textContent = '0.00 RECKON ($0.00)';
        if (vipBadgeEl) vipBadgeEl.style.display = 'none';
        if (vipExpiryEl) vipExpiryEl.style.display = 'none';
        return;
    }

    try {
        const priceData = await readFirebase('price_current');
        const treasury = await readFirebase('treasury') || 0;
        const commissionPool = await readFirebase('commission_pool') || 0;
        const freeSupply = await readFirebase('total_supply') || 0;

        const allUsers = await readFirebase('users') || {};
        let totalCoinsOnWallets = 0;
        let totalUsdOnWallets = 0;
        for (const uid in allUsers) {
            const user = allUsers[uid];
            if (user && user.balance_coins) totalCoinsOnWallets += user.balance_coins;
            if (user && user.balance_usd) totalUsdOnWallets += user.balance_usd;
        }

        const totalSupply = freeSupply + totalCoinsOnWallets + commissionPool;
        let priceUSD = priceData && priceData.price ? priceData.price : 0;

        // Цена
        if (priceEl) priceEl.textContent = formatPrice(priceUSD);

        // Рыночная капитализация
        const marketCapUSD = (priceUSD * totalSupply) + totalUsdOnWallets;
        if (marketCapEl) marketCapEl.textContent = formatCurrency(marketCapUSD);

        // Объём за 24ч
        const volumeUSD = await calculateDailyVolume();
        if (volumeEl) volumeEl.textContent = formatCurrency(volumeUSD);

        // Всего монет
        if (totalSupplyEl) totalSupplyEl.textContent = totalSupply.toFixed(0);

        // Имя и UID с VIP-значком
        let vipBadge = isVIPActive(currentUser) ? ' 💎' : '';
        if (usernameEl) usernameEl.textContent = (currentUser.username || currentUser.uid) + vipBadge;
        if (uidEl) uidEl.textContent = 'UID: ' + currentUser.uid;

        // VIP-значок
        if (vipBadgeEl) {
            vipBadgeEl.style.display = isVIPActive(currentUser) ? 'inline-block' : 'none';
        }

        // VIP срок действия
        if (vipExpiryEl) {
            if (isVIPActive(currentUser)) {
                const expiry = currentUser.vip_expires || 0;
                const date = new Date(expiry);
                vipExpiryEl.textContent = 'Действует до: ' + date.toLocaleString();
                vipExpiryEl.style.display = 'block';
                // Проверяем авто-продление (если включено и осталось < 3 дней)
                if (currentUser.auto_renew && (expiry - Date.now() < 3 * 24 * 60 * 60 * 1000)) {
                    autoRenewVIP();
                }
            } else {
                vipExpiryEl.style.display = 'none';
            }
        }

        // Балансы (в выбранной валюте)
        if (coinBalanceEl) coinBalanceEl.textContent = currentUser.balance_coins.toFixed(2);
        if (usdBalanceEl) usdBalanceEl.textContent = formatCurrency(currentUser.balance_usd);

        await updatePriceChange();

        // История транзакций
        const history = await readFirebase('users/' + currentUser.uid + '/transactions');
        let html = '';
        if (history && Object.keys(history).length > 0) {
            const sorted = Object.values(history).sort((a,b) => b.timestamp - a.timestamp);
            sorted.slice(0, 20).forEach(tx => {
                const date = new Date(tx.timestamp).toLocaleString();
                const typeLabel = getTransactionTypeLabel(tx.type);
                let amountDisplay = tx.amount + (tx.currency ? ' ' + tx.currency : ' RECKON');
                let usdValue = tx.usd;
                if (usdValue === undefined && tx.amount && tx.currency === 'RECKON' && priceUSD) {
                    usdValue = tx.amount * priceUSD;
                }
                if (usdValue !== undefined) {
                    amountDisplay += ' (' + formatCurrency(usdValue) + ')';
                }
                const safeType = GradusWeb.security.sanitizeHTML(typeLabel);
                const safeAmount = GradusWeb.security.sanitizeHTML(amountDisplay);
                const safeDate = GradusWeb.security.sanitizeHTML(date);
                let colorClass = '';
                if (tx.type === 'deposit' || tx.type === 'transfer_in') {
                    colorClass = 'history-green';
                } else if (tx.type === 'transfer_out' || tx.type === 'withdraw' || tx.type === 'withdraw_request') {
                    colorClass = 'history-red';
                } else if (tx.type === 'exchange_coins_to_usd' || tx.type === 'exchange_usd_to_coins') {
                    colorClass = 'history-blue';
                }
                html += `<div class="history-item ${colorClass}">
                    <span class="type">${safeType}</span>
                    <span class="amount">${safeAmount}</span>
                    <span class="date">${safeDate}</span>
                </div>`;
            });
        } else html = '<p>Нет операций</p>';
        if (historyEl) historyEl.innerHTML = html;

        // Статистика майнера
        const stats = await readFirebase('users/' + currentUser.uid + '/mining_stats');
        const tasksDoneEl = document.getElementById('tasks-done');
        const miningEarnedEl = document.getElementById('mining-earned');
        if (tasksDoneEl) tasksDoneEl.textContent = stats ? stats.tasks : '0';
        if (miningEarnedEl) miningEarnedEl.textContent = stats ? stats.earned.toFixed(2) : '0.00';

        // Оборот комиссий
        if (commissionPoolEl) {
            const poolCoins = commissionPool;
            const poolUSD = poolCoins * priceUSD;
            commissionPoolEl.textContent = poolCoins.toFixed(2) + ' RECKON (' + formatCurrency(poolUSD) + ')';
        }

        // Аватарка
        if (avatarImg) {
            if (currentUser.avatar) {
                avatarImg.src = currentUser.avatar;
                avatarImg.style.display = 'inline-block';
                if (avatarEmoji) avatarEmoji.style.display = 'none';
            } else {
                avatarImg.style.display = 'none';
                if (avatarEmoji) avatarEmoji.style.display = 'inline-block';
            }
        }

        updateCurrencyUI();

    } catch(e) {
        console.error('[Reckon] Ошибка обновления UI:', e);
    }
}

// === ВЫЧИСЛЕНИЕ ОБЪЁМА ЗА 24 ЧАСА ===
async function calculateDailyVolume() {
    try {
        const now = Date.now();
        const dayAgo = now - 86400000;
        const allUsers = await readFirebase('users') || {};
        let totalVolume = 0;
        for (const uid in allUsers) {
            const history = await readFirebase('users/' + uid + '/transactions');
            if (!history) continue;
            const entries = Object.values(history);
            for (const tx of entries) {
                if (tx.timestamp >= dayAgo && tx.usd) {
                    totalVolume += tx.usd;
                }
            }
        }
        return totalVolume;
    } catch (e) {
        console.warn('[Reckon] Ошибка вычисления объёма:', e);
        return 0;
    }
}

function getTransactionTypeLabel(type) {
    const map = {
        'deposit': 'Пополнение',
        'withdraw': 'Вывод',
        'withdraw_request': 'Заявка на вывод',
        'transfer_out': 'Исходящий перевод',
        'transfer_in': 'Входящий перевод',
        'exchange_coins_to_usd': 'Обмен (Крипта → USD)',
        'exchange_usd_to_coins': 'Обмен (USD → Крипта)',
        'support': 'Обращение в поддержку',
        'complaint': 'Жалоба',
        'hack_report': 'Отчёт о взломе'
    };
    return map[type] || type;
}

async function updatePriceChange() {
    const priceChangeEl = document.getElementById('price-change');
    if (!priceChangeEl) return;
    try {
        const history = await readFirebase('price_history');
        if (!history) { priceChangeEl.textContent = '▲ 0.00%'; return; }
        const entries = Object.values(history).sort((a,b) => a.timestamp - b.timestamp);
        if (entries.length < 2) { priceChangeEl.textContent = '▲ 0.00%'; return; }
        const last = entries[entries.length - 1];
        const prev = entries[entries.length - 2];
        if (!last || !prev || prev.price === 0) {
            priceChangeEl.textContent = '▲ 0.00%';
            return;
        }
        const change = ((last.price - prev.price) / prev.price) * 100;
        const sign = change >= 0 ? '▲' : '▼';
        priceChangeEl.textContent = `${sign} ${Math.abs(change).toFixed(2)}%`;
        priceChangeEl.className = 'price-change ' + (change >= 0 ? 'up' : 'down');
    } catch(e) {
        console.error('[Reckon] updatePriceChange error:', e);
        priceChangeEl.textContent = '▲ 0.00%';
    }
}

// ============================================================
// 5. АВТОРИЗАЦИЯ
// ============================================================
function showAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal && !modal.classList.contains('active')) modal.classList.add('active');
}
function hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const title = document.getElementById('auth-title');
    const submitBtn = document.getElementById('auth-submit');
    const switchBtn = document.getElementById('auth-switch');
    const repeatGroup = document.getElementById('password-repeat-group');
    const pwdRepeat = document.getElementById('auth-password-repeat');
    if (isLoginMode) {
        if (title) title.textContent = 'Вход';
        if (submitBtn) submitBtn.textContent = 'Войти';
        if (switchBtn) switchBtn.textContent = 'Переключиться на регистрацию';
        if (repeatGroup) repeatGroup.style.display = 'none';
        if (pwdRepeat) { pwdRepeat.removeAttribute('required'); pwdRepeat.value = ''; }
    } else {
        if (title) title.textContent = 'Регистрация';
        if (submitBtn) submitBtn.textContent = 'Зарегистрироваться';
        if (switchBtn) switchBtn.textContent = 'Переключиться на вход';
        if (repeatGroup) repeatGroup.style.display = 'block';
        if (pwdRepeat) pwdRepeat.setAttribute('required', '');
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    const submitBtn = document.getElementById('auth-submit');
    if (submitBtn) submitBtn.disabled = true;

    const username = document.getElementById('auth-username')?.value.trim();
    const password = document.getElementById('auth-password')?.value;
    const pwdRepeat = document.getElementById('auth-password-repeat')?.value;
    const email = document.getElementById('auth-email')?.value.trim();
    const phone = document.getElementById('auth-phone')?.value.trim();
    const agree = document.getElementById('auth-agree')?.checked;

    if (!agree) { GradusWeb.notify.warning('Примите соглашение'); isSubmitting = false; if (submitBtn) submitBtn.disabled = false; return; }
    if (!username || username.length < 3) { GradusWeb.notify.warning('Никнейм >=3 символов'); isSubmitting = false; if (submitBtn) submitBtn.disabled = false; return; }
    if (!password || password.length < 4) { GradusWeb.notify.warning('Пароль >=4 символов'); isSubmitting = false; if (submitBtn) submitBtn.disabled = false; return; }
    if (!isLoginMode && password !== pwdRepeat) { GradusWeb.notify.warning('Пароли не совпадают'); isSubmitting = false; if (submitBtn) submitBtn.disabled = false; return; }

    const hashedPassword = GradusWeb.encode(password);

    if (isLoginMode) {
        await loginUser(username, hashedPassword);
    } else {
        await registerUser(username, hashedPassword, email, phone);
    }

    isSubmitting = false;
    if (submitBtn) submitBtn.disabled = false;
}

async function loginUser(username, hashedPassword) {
    const allUsers = await readFirebase('users');
    if (!allUsers) { GradusWeb.notify.error('Пользователь не найден'); return; }
    let foundUid = null;
    for (const [uid, data] of Object.entries(allUsers)) {
        if (data.username === username && data.password === hashedPassword) {
            foundUid = uid;
            break;
        }
    }
    if (foundUid) {
        await loadUser(foundUid);
        hideAuthModal();
        GradusWeb.notify.success('Добро пожаловать, ' + username + '!');
        await updateUIElements();
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(updateUIElements, 5000);
    } else {
        GradusWeb.notify.error('Неверный никнейм или пароль');
    }
}

async function registerUser(username, hashedPassword, email, phone) {
    const allUsers = await readFirebase('users');
    if (allUsers) {
        for (const [uid, data] of Object.entries(allUsers)) {
            if (data.username === username) { GradusWeb.notify.warning('Никнейм занят'); return; }
            if (email && data.email === GradusWeb.encode(email)) { GradusWeb.notify.warning('Email занят'); return; }
            if (phone && data.phone === GradusWeb.encode(phone)) { GradusWeb.notify.warning('Телефон занят'); return; }
        }
    }
    const newUid = GradusWeb.generate.uuid();
    const newUser = {
        username: username,
        password: hashedPassword,
        email: email ? GradusWeb.encode(email) : '',
        phone: phone ? GradusWeb.encode(phone) : '',
        balance_coins: 0,
        balance_usd: 0,
        ban: false,
        moder: false,
        transactions: {},
        lastPriceChangeDate: 0,
        avatar: '',
        vip_expires: 0,
        hide_balance: false,
        auto_renew: false,
        auto_renew_period: 0
    };
    await writeFirebase('users/' + newUid, newUser);
    await loadUser(newUid);
    hideAuthModal();
    GradusWeb.notify.success('Регистрация успешна!');
    await updateUIElements();
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateUIElements, 5000);
}

async function loadUser(uid) {
    const userData = await readFirebase('users/' + uid);
    if (!userData) {
        await GradusWeb.secretStorage.remove('uid');
        currentUser = null;
        showAuthModal();
        return;
    }
    if (userData.ban === true) {
        await GradusWeb.secretStorage.remove('uid');
        currentUser = null;
        GradusWeb.notify.error('Аккаунт заблокирован.');
        showAuthModal();
        return;
    }
    const decodedEmail = userData.email ? GradusWeb.decode(userData.email) : '';
    const decodedPhone = userData.phone ? GradusWeb.decode(userData.phone) : '';
    currentUser = {
        uid: uid,
        username: userData.username,
        email: decodedEmail,
        phone: decodedPhone,
        balance_coins: userData.balance_coins || 0,
        balance_usd: userData.balance_usd || 0,
        ban: userData.ban || false,
        moder: userData.moder || false,
        transactions: userData.transactions || {},
        lastPriceChangeDate: userData.lastPriceChangeDate || 0,
        avatar: userData.avatar || '',
        vip_expires: userData.vip_expires || 0,
        hide_balance: userData.hide_balance || false,
        auto_renew: userData.auto_renew || false,
        auto_renew_period: userData.auto_renew_period || 0
    };
    await GradusWeb.secretStorage.set('uid', uid);
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
}

async function logout() {
    await GradusWeb.secretStorage.remove('uid');
    currentUser = null;
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = null;
    await updateUIElements();
    GradusWeb.notify.info('Вы вышли из аккаунта');
    showAuthModal();
}

// ============================================================
// 6. ЦЕНА И ГРАФИК
// ============================================================
async function initChart() {
    try {
        const canvas = document.getElementById('priceChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const history = await readFirebase('price_history');
        allHistoryData = [];
        if (history) {
            const entries = Object.values(history).sort((a,b) => a.timestamp - b.timestamp);
            allHistoryData = entries;
        }

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Цена Reckon Coin (' + selectedCurrency + ')',
                    data: [],
                    borderColor: '#4a9eff',
                    backgroundColor: 'rgba(74, 158, 255, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#e0e0e0' } } },
                scales: {
                    x: { grid: { color: '#1e1e2e' }, ticks: { color: '#8888a0', maxTicksLimit: 10 } },
                    y: { grid: { color: '#1e1e2e' }, ticks: { color: '#8888a0' } }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });

        await updateChartForPeriod('1h');
    } catch(e) {
        console.error('[Reckon] initChart error:', e);
    }
}

async function updateChartForPeriod(period) {
    if (!chartInstance) return;
    const now = Date.now();
    let timeLimit = 0;
    switch(period) {
        case '1h': timeLimit = 3600000; break;
        case '24h': timeLimit = 86400000; break;
        case '7d': timeLimit = 604800000; break;
        case '30d': timeLimit = 2592000000; break;
        default: timeLimit = 3600000;
    }
    const cutoff = now - timeLimit;
    const rate = getCurrencyRate();
    const filtered = allHistoryData.filter(entry => entry.timestamp >= cutoff);
    const labels = filtered.map(entry => new Date(entry.timestamp).toLocaleTimeString());
    const data = filtered.map(entry => entry.price * rate);

    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].label = 'Цена Reckon Coin (' + selectedCurrency + ')';
    chartInstance.update('none');
}

function setupChartControls() {
    const buttons = document.querySelectorAll('.chart-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            const period = this.dataset.period;
            if (!period) return;
            buttons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentPeriod = period;
            updateChartForPeriod(period);
        });
    });
}

// ============================================================
// 7. НАСТРОЙКИ ВАЛЮТЫ, АВАТАРКИ, СКРЫТИЯ БАЛАНСА
// ============================================================
function updateCurrencyUI() {
    document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.currency === selectedCurrency);
    });
}

function setCurrency(currency) {
    if (!exchangeRates[currency]) return;
    selectedCurrency = currency;
    localStorage.setItem('recoin_currency', currency);
    updateCurrencyUI();
    updateUIElements();
    updateChartForPeriod(currentPeriod);
    GradusWeb.notify.success('Валюта изменена на ' + currency);
}

// === АВАТАРКИ ===
async function loadFreeAvatars() {
    try {
        const data = await readFirebase('avatars');
        if (data) {
            freeAvatars = Object.values(data);
        } else {
            // fallback
            freeAvatars = [
                'https://i.pravatar.cc/150?img=1',
                'https://i.pravatar.cc/150?img=2',
                'https://i.pravatar.cc/150?img=3',
                'https://i.pravatar.cc/150?img=4',
                'https://i.pravatar.cc/150?img=5',
                'https://i.pravatar.cc/150?img=6',
                'https://i.pravatar.cc/150?img=7',
                'https://i.pravatar.cc/150?img=8',
                'https://i.pravatar.cc/150?img=9',
                'https://i.pravatar.cc/150?img=10',
                'https://i.pravatar.cc/150?img=11',
                'https://i.pravatar.cc/150?img=12',
                'https://i.pravatar.cc/150?img=13',
                'https://i.pravatar.cc/150?img=14',
                'https://i.pravatar.cc/150?img=15'
            ];
        }
    } catch (e) { console.warn('Не удалось загрузить бесплатные аватарки'); freeAvatars = []; }
}

function renderFreeAvatars() {
    const container = document.getElementById('free-avatars-container');
    if (!container) return;
    if (freeAvatars.length === 0) {
        container.innerHTML = '<p>Нет доступных аватарок</p>';
        return;
    }
    let html = '';
    freeAvatars.forEach(url => {
        html += `<div style="cursor: pointer; border: 2px solid transparent; padding: 4px; border-radius: 50%;" onclick="setFreeAvatar('${url}')">
            <img src="${url}" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 50%;">
        </div>`;
    });
    container.innerHTML = html;
}



// === СКРЫТИЕ БАЛАНСА (только VIP) ===
async function saveBalanceVisibility() {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (!isVIPActive(currentUser)) {
        GradusWeb.notify.warning('Скрытие баланса доступно только с VIP подпиской');
        return;
    }
    const checkbox = document.getElementById('hide-balance-checkbox');
    const hide = checkbox.checked;
    await writeFirebase('users/' + currentUser.uid + '/hide_balance', hide);
    currentUser.hide_balance = hide;
    GradusWeb.notify.success('Настройка сохранена');
    await updateUIElements();
}

// ============================================================
// 8. VIP И ДРУЗЬЯ
// ============================================================

// === VIP ===
function isVIPActive(user) {
    if (!user) return false;
    if (user.ban === true) return false;
    if (!user.vip_expires) return false;
    return user.vip_expires > Date.now();
}



async function updateVIPStatus() {
    const statusEl = document.getElementById('vip-status');
    if (!statusEl) return;
    if (!currentUser) { statusEl.textContent = 'Статус: не авторизован'; return; }
    if (currentUser.ban) {
        statusEl.textContent = 'VIP заморожен (аккаунт заблокирован)';
        return;
    }
    const vipActive = isVIPActive(currentUser);
    const expiry = currentUser.vip_expires || 0;
    const remaining = Math.max(0, expiry - Date.now());
    const days = Math.floor(remaining / (24*60*60*1000));
    const hours = Math.floor((remaining % (24*60*60*1000)) / (60*60*1000));
    if (vipActive && days > 0) {
        statusEl.textContent = `VIP активен: ${days} дн. ${hours} ч.`;
    } else if (vipActive && days === 0) {
        statusEl.textContent = 'VIP активен (менее дня)';
    } else {
        statusEl.textContent = 'VIP не активен';
    }
}

// === АВТО-ПРОДЛЕНИЕ VIP ===
async function autoRenewVIP() {
    if (!currentUser) return;
    if (!currentUser.auto_renew) return;
    const period = currentUser.auto_renew_period || 30;
    const price = period === 30 ? 0.40 : 2.00;
    const discountedPrice = price * 0.8; // 20% скидка при продлении
    if (currentUser.balance_usd < discountedPrice) {
        GradusWeb.notify.warning('Недостаточно средств для авто-продления VIP');
        return;
    }
    const newBalance = currentUser.balance_usd - discountedPrice;
    await writeFirebase('users/' + currentUser.uid + '/balance_usd', newBalance);
    currentUser.balance_usd = newBalance;
    const now = Date.now();
    const currentExpiry = currentUser.vip_expires || 0;
    const newExpiry = Math.max(currentExpiry, now) + period * 24 * 60 * 60 * 1000;
    await writeFirebase('users/' + currentUser.uid + '/vip_expires', newExpiry);
    currentUser.vip_expires = newExpiry;
    GradusWeb.notify.success('VIP автоматически продлён на ' + period + ' дней!');
    await updateUIElements();
}

// === ДРУЗЬЯ ===
async function renderFriends(tab = 'accepted') {
    const listEl = document.getElementById('friends-list');
    if (!listEl) return;
    if (!currentUser) { listEl.innerHTML = '<p>Войдите в аккаунт</p>'; return; }

    let friendsData = await readFirebase('users/' + currentUser.uid + '/friends');
    if (!friendsData) friendsData = { accepted: {}, requests: {} };

    let entries = [];
    if (tab === 'accepted') {
        entries = Object.entries(friendsData.accepted || {});
    } else {
        entries = Object.entries(friendsData.requests || {});
    }

    if (entries.length === 0) {
        listEl.innerHTML = '<p>Нет ' + (tab === 'accepted' ? 'друзей' : 'заявок') + '</p>';
        return;
    }

    let html = '';
    for (const [friendUid, status] of entries) {
        const friendData = await readFirebase('users/' + friendUid);
        if (!friendData) continue;

        const isBanned = friendData.ban === true;
        const isVIP = isVIPActive(friendData);
        const vipLabel = isVIP ? ' 💎' : '';
        const banLabel = isBanned ? ' <span style="background: red; color: white; padding: 2px 6px; border-radius: 4px; font-size: 12px;">Заблокирован ✖</span>' : '';

        const displayName = friendData.username || friendUid;

        let avatarHtml = friendData.avatar
            ? `<img src="${friendData.avatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer;" onclick="previewAvatar('${friendData.avatar}')">`
            : `<div style="width: 40px; height: 40px; border-radius: 50%; background: #2a2a3a; display: flex; align-items: center; justify-content: center; font-size: 20px;">👤</div>`;

        let balanceDisplay = '';
        if (friendData.hide_balance) {
            balanceDisplay = '0.00 RECKON / $0.000';
        } else {
            balanceDisplay = friendData.balance_coins.toFixed(2) + ' RECKON / ' + formatBalanceUSD(friendData.balance_usd);
        }

        html += `
            <div style="display: flex; align-items: center; gap: 10px; padding: 8px; border-bottom: 1px solid #2a2a3a;">
                ${avatarHtml}
                <div style="flex: 1;">
                    <div><strong>${displayName}</strong>${vipLabel}${banLabel}</div>
                    <div style="font-size: 12px; color: #888;">UID: ${friendUid}</div>
                    <div style="font-size: 12px; color: #aaa;">${balanceDisplay}</div>
                </div>
                <div>
                    ${tab === 'accepted' ? `<button class="btn btn-sm" onclick="transferToFriend('${friendUid}')">Перевести</button>` : ''}
                    ${tab === 'accepted' ? `<button class="btn btn-sm btn-danger" onclick="removeFriend('${friendUid}')">Удалить</button>` : ''}
                    ${tab === 'accepted' ? `<button class="btn btn-sm btn-warning" onclick="reportFriend('${friendUid}')">⚠️ Жалоба</button>` : ''}
                    ${tab === 'requests' ? `<button class="btn btn-sm btn-success" onclick="acceptFriendRequest('${friendUid}')">Принять</button>` : ''}
                    ${tab === 'requests' ? `<button class="btn btn-sm btn-danger" onclick="rejectFriendRequest('${friendUid}')">Отклонить</button>` : ''}
                </div>
            </div>
        `;
    }

    listEl.innerHTML = html;
}

async function sendFriendRequest() {
    const input = document.getElementById('add-friend-input');
    const friendUid = input?.value.trim();
    if (!friendUid) { GradusWeb.notify.warning('Введите UID друга'); return; }
    if (friendUid === currentUser.uid) { GradusWeb.notify.warning('Нельзя добавить себя'); return; }

    const friendData = await readFirebase('users/' + friendUid);
    if (!friendData) { GradusWeb.notify.error('Пользователь не найден'); return; }

    const friends = await readFirebase('users/' + currentUser.uid + '/friends');
    if (friends && friends.accepted && friends.accepted[friendUid]) {
        GradusWeb.notify.warning('Этот пользователь уже в друзьях');
        return;
    }
    if (friends && friends.requests && friends.requests[friendUid]) {
        GradusWeb.notify.warning('Заявка уже отправлена');
        return;
    }

    await writeFirebase('users/' + friendUid + '/friends/requests/' + currentUser.uid, { timestamp: Date.now() });
    GradusWeb.notify.success('Заявка отправлена');
    input.value = '';
}

async function acceptFriendRequest(friendUid) {
    const friendData = await readFirebase('users/' + currentUser.uid + '/friends/requests/' + friendUid);
    if (!friendData) { GradusWeb.notify.error('Заявка не найдена'); return; }

    await writeFirebase('users/' + currentUser.uid + '/friends/accepted/' + friendUid, { timestamp: Date.now() });
    await deleteFirebase('users/' + currentUser.uid + '/friends/requests/' + friendUid);
    await writeFirebase('users/' + friendUid + '/friends/accepted/' + currentUser.uid, { timestamp: Date.now() });
    GradusWeb.notify.success('Друг добавлен');
    renderFriends('accepted');
}

async function rejectFriendRequest(friendUid) {
    await deleteFirebase('users/' + currentUser.uid + '/friends/requests/' + friendUid);
    GradusWeb.notify.info('Заявка отклонена');
    renderFriends('requests');
}

async function removeFriend(friendUid) {
    if (!confirm('Удалить друга?')) return;
    await deleteFirebase('users/' + currentUser.uid + '/friends/accepted/' + friendUid);
    await deleteFirebase('users/' + friendUid + '/friends/accepted/' + currentUser.uid);
    GradusWeb.notify.info('Друг удалён');
    renderFriends('accepted');
}

// === ЖАЛОБА НА ДРУГА ===
async function reportFriend(friendUid) {
    if (!confirm('Подать жалобу на этого пользователя? Он будет удалён из друзей.')) return;
    // Отправляем жалобу в support_requests
    const complaint = {
        uid: currentUser.uid,
        type: 'friend_complaint',
        target: friendUid,
        text: 'Жалоба на друга (автоматическая)',
        timestamp: Date.now(),
        status: 'pending'
    };
    await pushFirebase('support_requests', complaint);
    // Удаляем друга
    await deleteFirebase('users/' + currentUser.uid + '/friends/accepted/' + friendUid);
    await deleteFirebase('users/' + friendUid + '/friends/accepted/' + currentUser.uid);
    GradusWeb.notify.success('Жалоба отправлена, друг удалён');
    renderFriends('accepted');
}

function transferToFriend(friendUid) {
    document.getElementById('transfer-to').value = friendUid;
    openModal('transfer-modal');
}

function previewAvatar(url) {
    const img = document.getElementById('avatar-preview-img');
    if (img) { img.src = url; openModal('avatar-preview-modal'); }
}

// ============================================================
// 9. МОДАЛКИ И ФОРМЫ (полная настройка)
// ============================================================
function setupModals() {
    try {
        function openWithCaptcha(id, captchaId) {
            if (!currentUser) { showAuthModal(); return; }
            openModal(id);
            if (captchaId) { generateCaptchaImage(captchaId); }
        }

        // === КНОПКИ ОТКРЫТИЯ МОДАЛОК ===
        const buttonMap = [
            { id: 'deposit-btn', modal: 'deposit-modal', captcha: 'deposit-captcha' },
            { id: 'withdraw-btn', modal: 'withdraw-modal', captcha: 'withdraw-captcha' },
            { id: 'transfer-btn', modal: 'transfer-modal', captcha: 'transfer-captcha' },
            { id: 'support-btn', modal: 'support-modal', captcha: 'support-captcha' },
            { id: 'complaint-btn', modal: 'complaint-modal', captcha: 'complaint-captcha' },
            { id: 'exchange-btn', modal: 'exchange-modal', captcha: 'exchange-captcha' },
            { id: 'settings-btn', modal: 'settings-modal', captcha: null },
            { id: 'friends-btn', modal: 'friends-modal', captcha: null },
            { id: 'vip-btn', modal: 'vip-modal', captcha: null }
        ];

        buttonMap.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) {
                el.addEventListener('click', function(e) {
                    if (item.id === 'settings-btn' || item.id === 'friends-btn' || item.id === 'vip-btn') {
                        if (!currentUser) { showAuthModal(); return; }
                        openModal(item.modal);
                        if (item.id === 'friends-btn') renderFriends('accepted');
                        if (item.id === 'vip-btn') updateVIPStatus();
                    } else {
                        openWithCaptcha(item.modal, item.captcha);
                    }
                });
            }
        });

        // === ЗАКРЫТИЕ МОДАЛОК ===
        document.querySelectorAll('.modal-close').forEach(el => {
            el.addEventListener('click', function() {
                const modal = this.closest('.modal');
                if (modal) modal.classList.remove('active');
            });
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.remove('active');
                }
            });
        });

        // === ОБРАБОТЧИКИ ФОРМ ===
        const depositForm = document.getElementById('deposit-form');
        const withdrawForm = document.getElementById('withdraw-form');
        const transferForm = document.getElementById('transfer-form');
        const supportForm = document.getElementById('support-form');
        const complaintForm = document.getElementById('complaint-form');
        const exchangeForm = document.getElementById('exchange-form');

        if (depositForm) depositForm.addEventListener('submit', handleDeposit);
        if (withdrawForm) withdrawForm.addEventListener('submit', handleWithdraw);
        if (transferForm) transferForm.addEventListener('submit', handleTransfer);
        if (supportForm) supportForm.addEventListener('submit', handleSupport);
        if (complaintForm) complaintForm.addEventListener('submit', handleComplaint);
        if (exchangeForm) exchangeForm.addEventListener('submit', handleExchange);

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', logout);

        // === РАСЧЁТ КОМИССИЙ ===
        const transferAmount = document.getElementById('transfer-amount');
        if (transferAmount) {
            transferAmount.addEventListener('input', function() {
                const amount = parseFloat(this.value) || 0;
                const feePercent = getFeePercent(amount);
                const fee = amount * feePercent;
                const total = amount + fee;
                const feeEl = document.getElementById('transfer-fee');
                const totalEl = document.getElementById('transfer-total');
                if (feeEl) feeEl.textContent = `${(feePercent*100).toFixed(0)}% (${fee.toFixed(2)} RECKON)`;
                if (totalEl) totalEl.textContent = total.toFixed(2) + ' RECKON';
            });
        }

        const exchangeAmount = document.getElementById('exchange-amount');
        if (exchangeAmount) {
            exchangeAmount.addEventListener('input', function() {
                const amount = parseFloat(this.value) || 0;
                let feePercent = getFeePercent(amount);
                if (feePercent > 0.05) feePercent = 0.05;
                const fee = amount * feePercent;
                const total = amount + fee;
                const feeEl = document.getElementById('exchange-fee');
                const totalEl = document.getElementById('exchange-total');
                if (feeEl) feeEl.textContent = `${(feePercent*100).toFixed(0)}% (${fee.toFixed(2)})`;
                if (totalEl) totalEl.textContent = total.toFixed(2);
            });
        }

        // === АВТОРИЗАЦИЯ ===
        const authForm = document.getElementById('auth-form');
        const authSwitch = document.getElementById('auth-switch');
        const showAgreement = document.getElementById('show-agreement-link');
        const agreementModal = document.getElementById('agreement-modal');
        const agreementClose = document.getElementById('agreement-close');
        const agreementCloseBtn = document.getElementById('agreement-close-btn');

        if (authForm) authForm.addEventListener('submit', handleAuthSubmit);
        if (authSwitch) authSwitch.addEventListener('click', toggleAuthMode);
        if (showAgreement) {
            showAgreement.addEventListener('click', function(e) {
                e.preventDefault();
                if (agreementModal) agreementModal.classList.add('active');
            });
        }
        if (agreementClose) {
            agreementClose.addEventListener('click', function() {
                if (agreementModal) agreementModal.classList.remove('active');
            });
        }
        if (agreementCloseBtn) {
            agreementCloseBtn.addEventListener('click', function() {
                if (agreementModal) agreementModal.classList.remove('active');
            });
        }

        // === МОБИЛЬНОЕ МЕНЮ ===
        const mobileToggle = document.getElementById('mobile-menu-toggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', function() {
                const nav = document.querySelector('.nav');
                if (nav) nav.classList.toggle('open');
            });
        }

        // === НАВИГАЦИОННЫЕ ССЫЛКИ ===
        document.querySelectorAll('.nav a[data-page]').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const pageId = this.dataset.page;
                const requireAuth = this.dataset.requireAuth === 'true';
                if (requireAuth && !currentUser) { showAuthModal(); return; }
                const pages = {
                    'page-home': document.getElementById('page-home'),
                    'page-cabinet': document.getElementById('page-cabinet'),
                    'page-mining': document.getElementById('page-mining')
                };
                Object.values(pages).forEach(p => { if (p) p.classList.remove('active'); });
                if (pages[pageId]) pages[pageId].classList.add('active');
                document.querySelectorAll('.nav a[data-page]').forEach(l => l.classList.remove('active'));
                this.classList.add('active');
                const nav = document.querySelector('.nav');
                if (nav) nav.classList.remove('open');
            });
        });

        // === КНОПКИ "УЗНАТЬ БОЛЬШЕ" ===
        document.querySelectorAll('[data-page]').forEach(el => {
            if (el.tagName === 'A' && el.closest('.nav')) return;
            el.addEventListener('click', function(e) {
                const pageId = this.dataset.page;
                const link = document.querySelector(`.nav a[data-page="${pageId}"]`);
                if (link) link.click();
            });
        });

        // === КНОПКИ ГРАФИКА ===
        setupChartControls();

        // === ВАЛЮТА ===
        document.querySelectorAll('.currency-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const currency = this.dataset.currency;
                if (currency) setCurrency(currency);
            });
        });

        // === АВАТАРКИ ===
        const saveAvatarBtn = document.getElementById('save-avatar-btn');
        if (saveAvatarBtn) saveAvatarBtn.addEventListener('click', saveAvatar);

        // === СКРЫТИЕ БАЛАНСА ===
        const saveVisibilityBtn = document.getElementById('save-balance-visibility');
        if (saveVisibilityBtn) saveVisibilityBtn.addEventListener('click', saveBalanceVisibility);

        // === ВКЛАДКИ ДРУЗЕЙ ===
        document.getElementById('friends-tab-accepted')?.addEventListener('click', function() {
            renderFriends('accepted');
        });
        document.getElementById('friends-tab-requests')?.addEventListener('click', function() {
            renderFriends('requests');
        });

        // === ДОБАВЛЕНИЕ ДРУГА ===
        document.getElementById('add-friend-btn')?.addEventListener('click', sendFriendRequest);

        const buyVipBtn = document.getElementById('buy-vip-btn');
        if (buyVipBtn) {
            buyVipBtn.addEventListener('click', function() {
                const firstPlan = document.querySelector('.vip-plan');
                if (firstPlan) {
                    firstPlan.click();
                } else {
                    GradusWeb.notify.warning('Нет доступных планов');
                }
            });
        }

        document.querySelectorAll('.vip-plan').forEach(el => {
            el.addEventListener('click', function(e) {
                e.stopPropagation();
                const days = parseInt(this.dataset.days);
                const price = parseFloat(this.dataset.price);
                let discount = 0;
                if (isVIPActive(currentUser)) {
                    discount = 0.20;
                }
                const finalPrice = price * (1 - discount);
                if (discount > 0) {
                    if (!confirm(`У вас уже есть VIP, скидка 20%! Итоговая цена: ${formatCurrency(finalPrice)}`)) return;
                }
                buyVIP(days, finalPrice);
            });
        });

        // === АВТО-ПРОДЛЕНИЕ VIP ===
        const saveAutoRenewBtn = document.getElementById('save-auto-renew');
        if (saveAutoRenewBtn) {
            saveAutoRenewBtn.addEventListener('click', async function() {
                if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
                const period = parseInt(document.getElementById('auto-renew-period').value);
                await writeFirebase('users/' + currentUser.uid + '/auto_renew_period', period);
                await writeFirebase('users/' + currentUser.uid + '/auto_renew', period > 0);
                currentUser.auto_renew_period = period;
                currentUser.auto_renew = period > 0;
                GradusWeb.notify.success('Настройки авто-продления сохранены');
            });
        }

        // === ПРИ ОТКРЫТИИ НАСТРОЕК ===
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) {
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.attributeName === 'class') {
                        if (settingsModal.classList.contains('active')) {
                            renderFreeAvatars();
                            const checkbox = document.getElementById('hide-balance-checkbox');
                            if (checkbox && currentUser) {
                                checkbox.checked = currentUser.hide_balance || false;
                            }
                            // Загружаем настройки авто-продления
                            const autoRenewSelect = document.getElementById('auto-renew-period');
                            if (autoRenewSelect && currentUser) {
                                autoRenewSelect.value = currentUser.auto_renew_period || 0;
                            }
                        }
                    }
                });
            });
            observer.observe(settingsModal, { attributes: true });
        }

        updateCurrencyUI();

    } catch(e) {
        console.error('[Reckon] Ошибка настройки модалок:', e);
    }
}

// ============================================================
// VIP — покупка и обновление статуса
// ============================================================
async function buyVIP(days, priceUSD) {
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (currentUser.ban) { GradusWeb.notify.error('Аккаунт заблокирован'); return; }
    if (currentUser.balance_usd < priceUSD) {
        GradusWeb.notify.warning('Недостаточно USD на балансе');
        return;
    }

    const newBalance = currentUser.balance_usd - priceUSD;
    await writeFirebase('users/' + currentUser.uid + '/balance_usd', newBalance);
    currentUser.balance_usd = newBalance;

    const now = Date.now();
    const currentExpiry = currentUser.vip_expires || 0;
    const newExpiry = Math.max(currentExpiry, now) + days * 24 * 60 * 60 * 1000;
    await writeFirebase('users/' + currentUser.uid + '/vip_expires', newExpiry);
    currentUser.vip_expires = newExpiry;

    GradusWeb.notify.success('VIP активирован на ' + days + ' дней!');
    await updateUIElements();
    updateVIPStatus();
}

// ============================================================
// АВАТАРКИ (исправленные)
// ============================================================
// Удалите второе (первое) определение setFreeAvatar, оставьте это ИСПРАВЛЕННОЕ
// === ИСПРАВЛЕННАЯ setFreeAvatar ===
async function setFreeAvatar(url) {
    logToScreen('setFreeAvatar вызвана с URL: ' + url);
    if (!currentUser) {
        logToScreen('Ошибка: пользователь не авторизован');
        GradusWeb.notify.warning('Войдите в аккаунт');
        return;
    }

    const userPath = 'users/' + currentUser.uid;
    logToScreen('Читаем текущие данные пользователя из: ' + userPath);
    const userData = await readFirebase(userPath);
    if (!userData) {
        logToScreen('Ошибка: данные пользователя не найдены');
        GradusWeb.notify.error('Ошибка получения данных');
        return;
    }

    // Меняем только аватар
    userData.avatar = url;
    logToScreen('Пытаемся записать обновлённого пользователя...');
    const success = await writeFirebase(userPath, userData);
    if (success) {
        currentUser.avatar = url;
        await updateUIElements();
        GradusWeb.notify.success('Аватарка установлена');
        logToScreen('UI обновлён, avatar = ' + currentUser.avatar);
    } else {
        logToScreen('writeFirebase вернул false');
        GradusWeb.notify.error('Не удалось сохранить аватарку');
    }
}

// === ИСПРАВЛЕННАЯ saveAvatar ===
async function saveAvatar() {
    logToScreen('saveAvatar вызвана');
    const input = document.getElementById('avatar-url-input');
    const url = input?.value.trim();
    if (!url) {
        GradusWeb.notify.warning('Введите URL картинки');
        return;
    }
    if (!currentUser) {
        GradusWeb.notify.warning('Войдите в аккаунт');
        return;
    }
    if (!isVIPActive(currentUser)) {
        GradusWeb.notify.warning('Установка своей аватарки доступна только с VIP подпиской');
        return;
    }

    const userPath = 'users/' + currentUser.uid;
    const userData = await readFirebase(userPath);
    if (!userData) {
        GradusWeb.notify.error('Ошибка получения данных');
        return;
    }

    userData.avatar = url;
    const success = await writeFirebase(userPath, userData);
    if (success) {
        currentUser.avatar = url;
        await updateUIElements();
        GradusWeb.notify.success('Аватарка сохранена!');
        closeModal(document.getElementById('settings-modal'));
    } else {
        GradusWeb.notify.error('Не удалось сохранить аватарку');
    }
}
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}
function closeModal(modal) {
    if (modal) modal.classList.remove('active');
}

function getFeePercent(amount) {
    if (currentUser && isVIPActive(currentUser)) {
        if (amount < 100) return 0.01;
        else return 0.005;
    }
    if (amount < 5) return 0.10;
    else if (amount < 30) return 0.05;
    else if (amount < 100) return 0.02;
    else return 0.01;
}

function verifyCaptcha(containerId) {
    const container = document.getElementById(containerId);
    if (!container || typeof container.verify !== 'function') return false;
    return container.verify();
}

// ============================================================
// 10. ОБРАБОТЧИКИ ФОРМ (с уведомлениями)
// ============================================================
async function handleDeposit(e) {
    e.preventDefault();
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (!verifyCaptcha('deposit-captcha')) { GradusWeb.notify.warning('Неверная капча'); return; }
    const amount = parseFloat(document.getElementById('deposit-amount')?.value);
    const contact = document.getElementById('deposit-contact')?.value.trim();
    if (!amount || amount < 0.05) { GradusWeb.notify.warning('Минимальная сумма 0.05$'); return; }
    if (!contact) { GradusWeb.notify.warning('Введите контакт'); return; }
    const fee = amount * 0.03;
    const netAmount = amount - fee;
    await pushFirebase('deposit_requests', { uid: currentUser.uid, amount: netAmount, fee, contact, timestamp: Date.now(), status: 'pending' });
    GradusWeb.notify.success('Заявка на пополнение отправлена. Зачислено будет ' + netAmount.toFixed(2) + '$ (комиссия ' + fee.toFixed(2) + '$)');
    closeModal(document.getElementById('deposit-modal'));
    const form = document.getElementById('deposit-form');
    if (form) form.reset();
}

async function handleWithdraw(e) {
    e.preventDefault();
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (!currentUser.email && !currentUser.phone) {
        GradusWeb.notify.warning('Для вывода необходимо привязать email или телефон');
        return;
    }
    if (!verifyCaptcha('withdraw-captcha')) { GradusWeb.notify.warning('Неверная капча'); return; }
    const amount = parseFloat(document.getElementById('withdraw-amount')?.value);
    const address = document.getElementById('withdraw-address')?.value.trim();
    if (!amount || amount <= 0) { GradusWeb.notify.warning('Введите сумму'); return; }
    const fee = amount * 0.03;
    const total = amount + fee;
    if (total > currentUser.balance_coins) { GradusWeb.notify.warning('Недостаточно монет с учётом комиссии'); return; }
    if (!address) { GradusWeb.notify.warning('Введите адрес'); return; }

    const pool = await readFirebase('commission_pool') || 0;
    await writeFirebase('commission_pool', pool + (fee * 0.85));
    const freeSupply = await readFirebase('total_supply') || 0;
    await writeFirebase('total_supply', Math.max(0, freeSupply - (fee * 0.15)));

    await pushFirebase('withdraw_requests', { uid: currentUser.uid, amount: amount, fee, address, timestamp: Date.now(), status: 'pending' });
    GradusWeb.notify.success('Заявка на вывод отправлена. Будет выведено ' + amount.toFixed(2) + ' монет (комиссия ' + fee.toFixed(2) + ' монет)');
    closeModal(document.getElementById('withdraw-modal'));
    const form = document.getElementById('withdraw-form');
    if (form) form.reset();
}

async function handleTransfer(e) {
    e.preventDefault();
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (!verifyCaptcha('transfer-captcha')) { GradusWeb.notify.warning('Неверная капча'); return; }

    const input = document.getElementById('transfer-to')?.value.trim();
    const amount = parseFloat(document.getElementById('transfer-amount')?.value);
    if (!input) { GradusWeb.notify.warning('Введите никнейм или UID получателя'); return; }
    if (!amount || amount <= 0) { GradusWeb.notify.warning('Введите сумму'); return; }

    const allUsers = await readFirebase('users');
    if (!allUsers) { GradusWeb.notify.error('Пользователь не найден'); return; }
    let toUid = null;
    for (const [uid, data] of Object.entries(allUsers)) {
        if (data.username === input || uid === input) {
            toUid = uid;
            break;
        }
    }
    if (!toUid) { GradusWeb.notify.warning('Пользователь не найден'); return; }
    if (toUid === currentUser.uid) { GradusWeb.notify.warning('Нельзя перевести самому себе'); return; }

    const feePercent = getFeePercent(amount);
    const fee = amount * feePercent;
    const total = amount + fee;
    if (total > currentUser.balance_coins) { GradusWeb.notify.warning('Недостаточно монет с учётом комиссии'); return; }

    const receiver = await readFirebase('users/' + toUid);
    if (!receiver) { GradusWeb.notify.error('Получатель не найден'); return; }

    const priceData = await readFirebase('price_current');
    const currentPrice = priceData ? priceData.price : 0.01;

    const usdAmount = amount * currentPrice;
    const changeAmount = -usdAmount * 0.01;
    await applyPriceChange(changeAmount, 'transfer');

    const newBalanceSender = currentUser.balance_coins - total;
    const newBalanceReceiver = (receiver.balance_coins || 0) + amount;
    await writeFirebase('users/' + currentUser.uid + '/balance_coins', newBalanceSender);
    await writeFirebase('users/' + toUid + '/balance_coins', newBalanceReceiver);

    const pool = await readFirebase('commission_pool') || 0;
    await writeFirebase('commission_pool', pool + (fee * 0.85));
    const freeSupply = await readFirebase('total_supply') || 0;
    await writeFirebase('total_supply', Math.max(0, freeSupply - (fee * 0.15)));

    await pushFirebase('users/' + currentUser.uid + '/transactions', { type: 'transfer_out', amount: total, currency: 'RECKON', to: toUid, fee, usd: usdAmount, timestamp: Date.now() });
    await pushFirebase('users/' + toUid + '/transactions', { type: 'transfer_in', amount, currency: 'RECKON', from: currentUser.uid, usd: amount * currentPrice, timestamp: Date.now() });

    currentUser.balance_coins = newBalanceSender;
    GradusWeb.notify.success('Перевод выполнен! Комиссия: ' + fee.toFixed(2) + ' RECKON (' + (feePercent*100).toFixed(0) + '%)');
    closeModal(document.getElementById('transfer-modal'));
    const form = document.getElementById('transfer-form');
    if (form) form.reset();
    await updateUIElements();
}

async function handleExchange(e) {
    e.preventDefault();
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (!verifyCaptcha('exchange-captcha')) { GradusWeb.notify.warning('Неверная капча'); return; }

    const direction = document.getElementById('exchange-direction')?.value;
    const amount = parseFloat(document.getElementById('exchange-amount')?.value);
    if (!amount || amount <= 0) { GradusWeb.notify.warning('Введите сумму'); return; }

    let feePercent = getFeePercent(amount);
    if (feePercent > 0.05) feePercent = 0.05;
    const fee = amount * feePercent;
    const total = amount + fee;

    const priceData = await readFirebase('price_current');
    const currentPrice = priceData ? priceData.price : 0.01;

    if (direction === 'coins_to_usd') {
        if (total > currentUser.balance_coins) { GradusWeb.notify.warning('Недостаточно монет с учётом комиссии'); return; }
        const usdAmount = amount * currentPrice;
        const changeAmount = usdAmount * 0.01;
        await applyPriceChange(changeAmount, 'sell');

        const newBalanceCoins = currentUser.balance_coins - total;
        const newBalanceUsd = currentUser.balance_usd + usdAmount;
        await writeFirebase('users/' + currentUser.uid + '/balance_coins', newBalanceCoins);
        await writeFirebase('users/' + currentUser.uid + '/balance_usd', newBalanceUsd);

        const pool = await readFirebase('commission_pool') || 0;
        await writeFirebase('commission_pool', pool + (fee * 0.85));
        const freeSupply = await readFirebase('total_supply') || 0;
        await writeFirebase('total_supply', Math.max(0, freeSupply - (fee * 0.15)));

        await pushFirebase('users/' + currentUser.uid + '/transactions', { type: 'exchange_coins_to_usd', amount: amount, currency: 'RECKON', usd: usdAmount, fee, timestamp: Date.now() });
        currentUser.balance_coins = newBalanceCoins;
        currentUser.balance_usd = newBalanceUsd;
        GradusWeb.notify.success('Продажа выполнена! Получено $' + usdAmount.toFixed(2));

    } else { // usd_to_coins
        if (total > currentUser.balance_usd) { GradusWeb.notify.warning('Недостаточно USD с учётом комиссии'); return; }
        const coinsAmount = amount / currentPrice;
        const changeAmount = -amount * 0.01;
        await applyPriceChange(changeAmount, 'buy');

        const newBalanceUsd = currentUser.balance_usd - total;
        const newBalanceCoins = currentUser.balance_coins + coinsAmount;
        await writeFirebase('users/' + currentUser.uid + '/balance_usd', newBalanceUsd);
        await writeFirebase('users/' + currentUser.uid + '/balance_coins', newBalanceCoins);

        const feeInCoins = fee / currentPrice;
        const pool = await readFirebase('commission_pool') || 0;
        await writeFirebase('commission_pool', pool + (feeInCoins * 0.85));
        const freeSupply = await readFirebase('total_supply') || 0;
        await writeFirebase('total_supply', Math.max(0, freeSupply - (feeInCoins * 0.15)));

        await pushFirebase('users/' + currentUser.uid + '/transactions', { type: 'exchange_usd_to_coins', amount: amount, currency: 'USD', coins: coinsAmount, fee, timestamp: Date.now() });
        currentUser.balance_usd = newBalanceUsd;
        currentUser.balance_coins = newBalanceCoins;
        GradusWeb.notify.success('Покупка выполнена! Получено ' + coinsAmount.toFixed(2) + ' RECKON');
    }

    closeModal(document.getElementById('exchange-modal'));
    const form = document.getElementById('exchange-form');
    if (form) form.reset();
    await updateUIElements();
}

async function handleSupport(e) {
    e.preventDefault();
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (!verifyCaptcha('support-captcha')) { GradusWeb.notify.warning('Неверная капча'); return; }
    const subject = document.getElementById('support-subject')?.value.trim();
    const message = document.getElementById('support-message')?.value.trim();
    if (!subject || !message) { GradusWeb.notify.warning('Заполните все поля'); return; }
    await pushFirebase('support_requests', { uid: currentUser.uid, type: 'support', subject, message, timestamp: Date.now(), status: 'pending' });
    GradusWeb.notify.success('Обращение отправлено.');
    closeModal(document.getElementById('support-modal'));
    const form = document.getElementById('support-form');
    if (form) form.reset();
}

async function handleComplaint(e) {
    e.preventDefault();
    if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
    if (!verifyCaptcha('complaint-captcha')) { GradusWeb.notify.warning('Неверная капча'); return; }
    const target = document.getElementById('complaint-target')?.value.trim();
    const text = document.getElementById('complaint-text')?.value.trim();
    if (!target || !text) { GradusWeb.notify.warning('Заполните все поля'); return; }
    await pushFirebase('support_requests', { uid: currentUser.uid, type: 'complaint', target, text, timestamp: Date.now(), status: 'pending' });
    GradusWeb.notify.success('Жалоба отправлена.');
    closeModal(document.getElementById('complaint-modal'));
    const form = document.getElementById('complaint-form');
    if (form) form.reset();
}

// ============================================================
// 11. ИЗМЕНЕНИЕ ЦЕНЫ
// ============================================================
async function canUserChangePrice() {
    if (!currentUser) return false;
    const today = new Date().setHours(0,0,0,0);
    if (currentUser.lastPriceChangeDate >= today) return false;
    return true;
}

async function applyPriceChange(changeAmount, type) {
    if (!currentUser) return false;
    if (!await canUserChangePrice()) return false;

    const minChange = 0.0004;
    if (Math.abs(changeAmount) < minChange) {
        changeAmount = Math.sign(changeAmount) * minChange;
    }

    const priceData = await readFirebase('price_current');
    let currentPrice = priceData && priceData.price ? priceData.price : 0.01;

    const treasury = await readFirebase('treasury') || 0;
    const commissionPool = await readFirebase('commission_pool') || 0;
    const freeSupply = await readFirebase('total_supply') || 0;
    const allUsers = await readFirebase('users') || {};
    let totalCoinsOnWallets = 0;
    for (const uid in allUsers) {
        const user = allUsers[uid];
        if (user && user.balance_coins) {
            totalCoinsOnWallets += user.balance_coins;
        }
    }
    const totalSupply = freeSupply + totalCoinsOnWallets + commissionPool;
    const maxPrice = totalSupply > 0 ? treasury / totalSupply : 0;

    let newPrice = currentPrice + changeAmount;
    if (newPrice < 0.0001) newPrice = 0.0001;
    if (newPrice > maxPrice) newPrice = maxPrice;

    await writeFirebase('price_current', { price: newPrice, timestamp: Date.now() });

    const today = new Date().setHours(0,0,0,0);
    await writeFirebase('users/' + currentUser.uid + '/lastPriceChangeDate', today);
    currentUser.lastPriceChangeDate = today;

    await pushFirebase('price_history', { price: newPrice, timestamp: Date.now() });
    await updateChartForPeriod(currentPeriod);

    return true;
}

// ============================================================
// 12. НАВИГАЦИЯ (пустая)
// ============================================================
function setupNavigation() {
    console.log('[Reckon] setupNavigation вызвана (пустая)');
}

// ============================================================
// 13. ИНИЦИАЛИЗАЦИЯ
// ============================================================
async function initSite() {
    try {
        await loadExchangeRates();
        await loadFreeAvatars();

        try { registerHandlers(); } catch (e) { console.warn('[Reckon] registerHandlers error:', e); }

        if (!siteConfig.debug) {
            GradusWeb.security.enableDevToolsProtection(() => {
                GradusWeb.secretStorage.clear();
                GradusWeb.cache.clear();
                location.reload();
            }, { removeScripts: true, skipMobile: false });
        }

        const uid = await GradusWeb.secretStorage.get('uid');
        if (uid) {
            await loadUser(uid);
            if (currentUser) {
                hideAuthModal();
                await updateUIElements();
                if (updateInterval) clearInterval(updateInterval);
                updateInterval = setInterval(updateUIElements, 5000);
            } else {
                setTimeout(() => showAuthModal(), 5000);
            }
        } else {
            setTimeout(() => showAuthModal(), 5000);
        }

        if (document.getElementById('priceChart')) {
            await initChart();
        }

        setupModals();
        setupNavigation();

    } catch(e) {
        console.error('[Reckon] КРИТИЧЕСКАЯ ОШИБКА в initSite:', e);
    }
}

// ============================================================
// 14. ЗАПУСК
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    initSite();
});