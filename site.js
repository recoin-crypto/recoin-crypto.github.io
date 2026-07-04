// ============================================================
// site.js — Reckon Coin (расширенная версия)
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

// === ВАЛЮТА ===
let selectedCurrency = localStorage.getItem('recoin_currency') || 'USD';
let exchangeRates = { USD: 1, RUB: 90, BYN: 3.2 }; // fallback

// === ЗАГРУЗКА РЕАЛЬНЫХ КУРСОВ ===
async function loadExchangeRates() {
    try {
        const cached = localStorage.getItem('recoin_rates');
        if (cached) {
            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp < 3600000) { // 1 час
                exchangeRates = data.rates;
                return;
            }
        }
        // Запрос к бесплатному API
        const response = await GradusServer.get('https://api.exchangerate-api.com/v4/latest/USD');
        if (response) {
            const json = JSON.parse(response);
            const rates = json.rates;
            exchangeRates = {
                USD: 1,
                RUB: rates.RUB || 90,
                BYN: rates.BYN || 3.2
            };
            localStorage.setItem('recoin_rates', JSON.stringify({ rates: exchangeRates, timestamp: Date.now() }));
        }
    } catch (e) {
        console.warn('[Reckon] Не удалось загрузить курсы валют, используются fallback:', e);
        // fallback уже установлены
    }
}

// === ФУНКЦИИ ДЛЯ РАБОТЫ С ВАЛЮТОЙ ===
function getCurrencyRate() {
    return exchangeRates[selectedCurrency] || 1;
}

function getCurrencySymbol() {
    const symbols = { USD: '$', RUB: '₽', BYN: 'Br' };
    return symbols[selectedCurrency] || '$';
}

function formatCurrency(amountUSD) {
    const rate = getCurrencyRate();
    const symbol = getCurrencySymbol();
    const amount = amountUSD * rate;
    return symbol + amount.toFixed(2);
}

function formatPrice(priceUSD) {
    const rate = getCurrencyRate();
    const symbol = getCurrencySymbol();
    return symbol + (priceUSD * rate).toFixed(6);
}

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

// ============================================================
// 2. ОБРАБОТЧИКИ GRADUS
// ============================================================
function registerHandlers() {
    try {
        GradusStatic.registerHandler('get_price', async () => {
            const d = await readFirebase('price_current');
            if (d && d.price) {
                return formatPrice(d.price);
            }
            return getCurrencySymbol() + '0.000000';
        });
    } catch (e) {
        console.warn('[Reckon] registerHandlers не удалось (GradusStatic может отсутствовать):', e);
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

    if (!usernameEl) return;

    if (!currentUser) {
        usernameEl.textContent = 'Гость';
        if (uidEl) uidEl.textContent = 'UID: —';
        if (coinBalanceEl) coinBalanceEl.textContent = '0.00';
        if (usdBalanceEl) usdBalanceEl.textContent = '$0.00';
        if (priceEl) priceEl.textContent = '$0.000000';
        if (marketCapEl) marketCapEl.textContent = '$0.00';
        if (volumeEl) volumeEl.textContent = '$0.00';
        if (totalSupplyEl) totalSupplyEl.textContent = '0';
        if (priceChangeEl) priceChangeEl.textContent = '▲ 0.00%';
        if (historyEl) historyEl.innerHTML = '<p>Войдите в аккаунт</p>';
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarEmoji) avatarEmoji.style.display = 'inline-block';
        if (commissionPoolEl) commissionPoolEl.textContent = '0.00 RECKON ($0.00)';
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
            if (user && user.balance_coins) {
                totalCoinsOnWallets += user.balance_coins;
            }
            if (user && user.balance_usd) {
                totalUsdOnWallets += user.balance_usd;
            }
        }

        const totalSupply = freeSupply + totalCoinsOnWallets + commissionPool;
        let priceUSD = priceData && priceData.price ? priceData.price : 0;
        const symbol = getCurrencySymbol();

        // Цена
        if (priceEl) priceEl.textContent = formatPrice(priceUSD);

        // Рыночная капитализация = цена * totalSupply + сумма USD на всех кошельках
        const marketCapUSD = (priceUSD * totalSupply) + totalUsdOnWallets;
        if (marketCapEl) marketCapEl.textContent = formatCurrency(marketCapUSD);

        // Объём за 24ч (сумма usd всех транзакций за последние сутки)
        const volumeUSD = await calculateDailyVolume();
        if (volumeEl) volumeEl.textContent = formatCurrency(volumeUSD);

        // Всего монет
        if (totalSupplyEl) totalSupplyEl.textContent = totalSupply.toFixed(0);

        // Имя и UID
        if (usernameEl) usernameEl.textContent = currentUser.username || currentUser.uid;
        if (uidEl) uidEl.textContent = 'UID: ' + currentUser.uid;

        // Балансы
        if (coinBalanceEl) coinBalanceEl.textContent = currentUser.balance_coins.toFixed(2);
        if (usdBalanceEl) usdBalanceEl.textContent = formatCurrency(currentUser.balance_usd);

        // Процент изменения (от предпоследней и последней цены)
        await updatePriceChange();

        // История транзакций с пересчётом в валюту
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

        // Обновляем UI валюты (подсветка активной кнопки)
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
        // Берём две последние записи
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
// 5. АВТОРИЗАЦИЯ (с аватаркой)
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
        if (pwdRepeat) {
            pwdRepeat.removeAttribute('required');
            pwdRepeat.value = '';
        }
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
        avatar: ''
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
        avatar: userData.avatar || ''
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
// 6. ЦЕНА И ГРАФИК (с учётом валюты)
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
// 7. НАСТРОЙКИ ВАЛЮТЫ И АВАТАРКИ
// ============================================================
function updateCurrencyUI() {
    document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.currency === selectedCurrency);
    });
    // Обновляем символ валюты в интерфейсе (можно добавить классы)
}

function setCurrency(currency) {
    if (!exchangeRates[currency]) return;
    selectedCurrency = currency;
    localStorage.setItem('recoin_currency', currency);
    updateCurrencyUI();
    updateUIElements();
    updateChartForPeriod(currentPeriod);
    // Также обновим get_price плейсхолдер (Gradus обновит автоматически при следующем рендере)
}

async function saveAvatar() {
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
    await writeFirebase('users/' + currentUser.uid + '/avatar', url);
    currentUser.avatar = url;
    await updateUIElements();
    GradusWeb.notify.success('Аватарка сохранена!');
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('active');
}

// ============================================================
// 8. МОДАЛКИ И ФОРМЫ (с уведомлениями)
// ============================================================
function setupModals() {
    try {
        function openWithCaptcha(id, captchaId) {
            if (!currentUser) {
                showAuthModal();
                return;
            }
            openModal(id);
            if (captchaId) {
                generateCaptchaImage(captchaId);
            }
        }

        const buttonMap = [
            { id: 'deposit-btn', modal: 'deposit-modal', captcha: 'deposit-captcha' },
            { id: 'withdraw-btn', modal: 'withdraw-modal', captcha: 'withdraw-captcha' },
            { id: 'transfer-btn', modal: 'transfer-modal', captcha: 'transfer-captcha' },
            { id: 'support-btn', modal: 'support-modal', captcha: 'support-captcha' },
            { id: 'complaint-btn', modal: 'complaint-modal', captcha: 'complaint-captcha' },
            { id: 'exchange-btn', modal: 'exchange-modal', captcha: 'exchange-captcha' },
            { id: 'settings-btn', modal: 'settings-modal', captcha: null }
        ];

        buttonMap.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) {
                el.addEventListener('click', () => {
                    if (item.id === 'settings-btn') {
                        if (!currentUser) { showAuthModal(); return; }
                        openModal(item.modal);
                    } else {
                        openWithCaptcha(item.modal, item.captcha);
                    }
                });
            }
        });

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

        // Обработчики форм
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
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }

        // Расчёт комиссии для перевода
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

        // Авторизация
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

        // Мобильное меню
        const mobileToggle = document.getElementById('mobile-menu-toggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', function() {
                const nav = document.querySelector('.nav');
                if (nav) nav.classList.toggle('open');
            });
        }

        // Навигационные ссылки
        document.querySelectorAll('.nav a[data-page]').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const pageId = this.dataset.page;
                const requireAuth = this.dataset.requireAuth === 'true';
                if (requireAuth && !currentUser) {
                    showAuthModal();
                    return;
                }
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

        document.querySelectorAll('[data-page]').forEach(el => {
            if (el.tagName === 'A' && el.closest('.nav')) return;
            el.addEventListener('click', function(e) {
                const pageId = this.dataset.page;
                const link = document.querySelector(`.nav a[data-page="${pageId}"]`);
                if (link) link.click();
            });
        });

        setupChartControls();

        // Обработчики для выбора валюты
        document.querySelectorAll('.currency-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const currency = this.dataset.currency;
                if (currency) setCurrency(currency);
            });
        });

        // Сохранение аватарки
        const saveAvatarBtn = document.getElementById('save-avatar-btn');
        if (saveAvatarBtn) {
            saveAvatarBtn.addEventListener('click', saveAvatar);
        }

        updateCurrencyUI();

    } catch(e) {
        console.error('[Reckon] Ошибка настройки модалок:', e);
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
// 9. ОБРАБОТЧИКИ ФОРМ (с уведомлениями вместо alert)
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
// 10. ИЗМЕНЕНИЕ ЦЕНЫ (пользовательские действия)
// ============================================================
async function canUserChangePrice() {
    if (!currentUser) return false;
    const today = new Date().setHours(0,0,0,0);
    if (currentUser.lastPriceChangeDate >= today) {
        return false;
    }
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
// 11. НАВИГАЦИЯ (пустая, всё в setupModals)
// ============================================================
function setupNavigation() {
    console.log('[Reckon] setupNavigation вызвана (пустая)');
}

// ============================================================
// 12. ИНИЦИАЛИЗАЦИЯ
// ============================================================
async function initSite() {
    try {
        // Загружаем курсы валют
        await loadExchangeRates();

        try {
            registerHandlers();
        } catch (e) {
            console.warn('[Reckon] registerHandlers error:', e);
        }

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
// 13. ЗАПУСК
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    initSite();
});