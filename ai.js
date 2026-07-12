// ============================================================
// ai.js — GradAI (асинхронная обработка через Firebase)
// Запросы обрабатываются на ПК модераторов (локально).
// ============================================================

const AI_CONFIG = {
    TEXT_COST: 50,
    IMAGE_SINGLE_COST: 150,
    IMAGE_QUAD_COST: 500,
    FREE_TIER_LIMIT: 5000,
    VIP_TIER_LIMIT: 25000,
    MODEL_NAME_TEXT: 'GradAI 4',
    MODEL_NAME_IMAGE: 'GradAI IMG-3'
};

// ============================================================
// Проверка и начисление AI-токенов (ежемесячно)
// ============================================================
async function refreshAITokens(user) {
    if (!user) return;
    const uid = user.uid;
    const now = Date.now();
    const lastRefill = user.ai_last_refill || 0;
    const isVIP = window.isVIPActive ? window.isVIPActive(user) : false;
    const limit = isVIP ? AI_CONFIG.VIP_TIER_LIMIT : AI_CONFIG.FREE_TIER_LIMIT;
    const oneMonth = 30 * 24 * 60 * 60 * 1000;
    if (now - lastRefill >= oneMonth) {
        let currentTokens = user.ai_tokens || 0;
        if (currentTokens < limit) currentTokens = limit;
        await writeFirebase(`users/${uid}/ai_tokens`, currentTokens);
        await writeFirebase(`users/${uid}/ai_last_refill`, now);
        user.ai_tokens = currentTokens;
        user.ai_last_refill = now;
        GradusWeb.notify.info(`AI-токены обновлены! Текущий баланс: ${currentTokens}`);
    }
}

// ============================================================
// Отправка запроса в Firebase (асинхронно)
// ============================================================
async function sendAIRequest(prompt) {
    if (!currentUser) {
        GradusWeb.notify.warning('Войдите в аккаунт');
        return null;
    }

    // Обновляем токены (если прошёл месяц)
    await refreshAITokens(currentUser);

    // Проверяем баланс
    if ((currentUser.ai_tokens || 0) < AI_CONFIG.TEXT_COST) {
        GradusWeb.notify.warning(`Недостаточно AI-токенов. Нужно ${AI_CONFIG.TEXT_COST}, у вас ${currentUser.ai_tokens || 0}`);
        return null;
    }

    // Списываем токены сразу (оптимистично)
    const newBalance = (currentUser.ai_tokens || 0) - AI_CONFIG.TEXT_COST;
    await writeFirebase(`users/${currentUser.uid}/ai_tokens`, newBalance);
    currentUser.ai_tokens = newBalance;
    updateAITokenDisplay(); // обновляем интерфейс

    // Создаём запрос в Firebase
    const requestData = {
        uid: currentUser.uid,
        prompt: prompt,
        status: 'pending',
        response: '',
        timestamp: Date.now()
    };
    const result = await pushFirebase('gradAI/requests', requestData);
    if (!result) {
        // Возвращаем токены, если не удалось сохранить
        await writeFirebase(`users/${currentUser.uid}/ai_tokens`, currentUser.ai_tokens + AI_CONFIG.TEXT_COST);
        currentUser.ai_tokens += AI_CONFIG.TEXT_COST;
        GradusWeb.notify.error('Ошибка сохранения запроса');
        return null;
    }
    const requestId = result.name;

    GradusWeb.notify.info('Запрос отправлен на обработку (ожидайте)');

    // Подписываемся на результат (через polling или listener)
    return listenToRequest(requestId);
}

// ============================================================
// Подписка на результат запроса (polling)
// ============================================================
function listenToRequest(requestId) {
    return new Promise((resolve, reject) => {
        const path = `gradAI/requests/${requestId}`;
        let attempts = 0;
        const maxAttempts = 120; // 120 * 2 сек = 4 минуты
        const checkStatus = async () => {
            attempts++;
            const data = await readFirebase(path);
            if (!data) {
                reject(new Error('Запрос не найден в Firebase'));
                return;
            }
            if (data.status === 'done') {
                resolve(data.response);
                return;
            } else if (data.status === 'error') {
                reject(new Error(data.error || 'Ошибка обработки'));
                return;
            }
            // Если истекло время
            if (attempts >= maxAttempts) {
                reject(new Error('Время ожидания истекло (4 минуты)'));
                return;
            }
            // Повторяем через 2 секунды
            setTimeout(checkStatus, 2000);
        };
        checkStatus();
    });
}

// ============================================================
// Генерация текста (обёртка для отправки)
// ============================================================
async function generateText(prompt) {
    try {
        const answer = await sendAIRequest(prompt);
        return answer;
    } catch (e) {
        console.error('[GradAI] Ошибка генерации:', e);
        GradusWeb.notify.error('Ошибка: ' + (e.message || 'Неизвестная ошибка'));
        return null;
    }
}

// ============================================================
// Загрузка истории чата (все сообщения пользователя)
// ============================================================
async function loadChatHistory() {
    if (!currentUser) return [];
    const allRequests = await readFirebase('gradAI/requests');
    if (!allRequests) return [];
    const entries = Object.entries(allRequests)
        .filter(([key, val]) => val.uid === currentUser.uid && val.status === 'done')
        .map(([key, val]) => ({
            id: key,
            prompt: val.prompt,
            response: val.response,
            timestamp: val.timestamp
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
    return entries;
}

// ============================================================
// Markdown парсер (упрощённый)
// ============================================================
function parseMarkdown(text) {
    if (!text) return '';
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/```([\s\S]*?)```/g, function(match, code) {
        return `<div class="code-block"><pre><code>${code}</code></pre><button class="copy-code-btn">📋 Копировать</button></div>`;
    });
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/^## (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

// ============================================================
// Отображение баланса токенов
// ============================================================
function updateAITokenDisplay() {
    const balance = currentUser ? currentUser.ai_tokens || 0 : 0;
    document.querySelectorAll('#ai-token-balance, #ai-token-balance-image, #ai-token-balance-profile').forEach(el => {
        if (el) el.textContent = balance.toFixed(0);
    });
}

// ============================================================
// История AI-запросов (в кабинете)
// ============================================================
async function renderAIHistory() {
    const container = document.getElementById('ai-history-container');
    if (!container) return;
    if (!currentUser) {
        container.innerHTML = '<p>Войдите в аккаунт</p>';
        return;
    }
    const history = await loadChatHistory();
    if (history.length === 0) {
        container.innerHTML = '<p>Нет запросов к ИИ</p>';
        return;
    }
    let html = '';
    history.slice(-20).forEach(entry => {
        const date = new Date(entry.timestamp).toLocaleString();
        const prompt = GradusWeb.security.sanitizeHTML(entry.prompt);
        const response = GradusWeb.security.sanitizeHTML(entry.response);
        html += `<div class="ai-history-item">
            <div><strong>📝 Текст</strong> — <span class="ai-date">${date}</span></div>
            <div style="font-size: 13px; color: #aaa;">Запрос: ${prompt}</div>
            <div style="font-size: 13px; color: #ccc;">Ответ: ${response}</div>
            <div style="font-size: 12px; color: #888;">Стоимость: ${AI_CONFIG.TEXT_COST} токенов</div>
        </div>`;
    });
    container.innerHTML = html;
}

// ============================================================
// Копирование кода из блоков
// ============================================================
function setupCopyButtons() {
    document.querySelectorAll('.code-block .copy-code-btn').forEach(btn => {
        btn.removeEventListener('click', handleCopy);
        btn.addEventListener('click', handleCopy);
    });
}

function handleCopy(e) {
    const btn = e.currentTarget;
    const codeBlock = btn.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        btn.textContent = '✅ Скопировано';
        setTimeout(() => btn.textContent = '📋 Копировать', 2000);
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        btn.textContent = '✅ Скопировано';
        setTimeout(() => btn.textContent = '📋 Копировать', 2000);
    });
}

// ============================================================
// UI-интеграция (кнопки, модалки, обработчики)
// ============================================================
let aiUIInitialized = false;

function setupAIUI() {
    if (aiUIInitialized) return;
    aiUIInitialized = true;

    console.log('[GradAI] Настройка UI...');

    const actionsGrid = document.querySelector('.actions-grid');
    if (!actionsGrid) {
        console.warn('[GradAI] .actions-grid не найден, повтор через 500ms');
        aiUIInitialized = false;
        setTimeout(setupAIUI, 500);
        return;
    }

    // Делегирование событий для кнопок ИИ
    actionsGrid.addEventListener('click', function(e) {
        const chatBtn = e.target.closest('#ai-chat-btn');
        if (chatBtn) {
            e.preventDefault();
            if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
            openAIChatModal();
            return;
        }
        const imageBtn = e.target.closest('#ai-image-btn');
        if (imageBtn) {
            e.preventDefault();
            if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
            openAIImageModal();
            return;
        }
    });

    setupModalHandlers();
    console.log('[GradAI] Обработчики кнопок ИИ установлены.');
}

function setupModalHandlers() {
    // ---------- Чат ----------
    const chatModal = document.getElementById('ai-chat-modal');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send-btn');
    const chatClear = document.getElementById('chat-clear-btn');

    if (chatModal) {
        chatModal.querySelector('.modal-close')?.addEventListener('click', () => chatModal.classList.remove('active'));
        chatModal.addEventListener('click', (e) => { if (e.target === e.currentTarget) chatModal.classList.remove('active'); });
    }

    if (chatSend && chatInput && chatMessages) {
        chatSend.addEventListener('click', async function() {
            const prompt = chatInput.value.trim();
            if (!prompt) return;

            // Добавляем сообщение пользователя
            const userMsg = document.createElement('div');
            userMsg.className = 'chat-message user';
            userMsg.innerHTML = `<div class="msg-author">Вы</div><div class="msg-text">${GradusWeb.security.sanitizeHTML(prompt)}</div>`;
            chatMessages.appendChild(userMsg);
            chatInput.value = '';
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Сообщение о загрузке
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'chat-message assistant loading';
            loadingMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">⏳ Обработка...</div>`;
            chatMessages.appendChild(loadingMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            const answer = await generateText(prompt);
            loadingMsg.remove();

            const assistantMsg = document.createElement('div');
            assistantMsg.className = 'chat-message assistant';
            if (answer) {
                assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">${parseMarkdown(answer)}</div>`;
                setTimeout(setupCopyButtons, 100);
            } else {
                assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">Ошибка генерации. Попробуйте позже.</div>`;
            }
            chatMessages.appendChild(assistantMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            updateAITokenDisplay();
            renderAIHistory();
        });

        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatSend.click();
            }
        });
    }

    if (chatClear) {
        chatClear.addEventListener('click', function() {
            chatMessages.innerHTML = '';
            const welcome = document.createElement('div');
            welcome.className = 'chat-message assistant';
            welcome.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">Задайте мне вопрос!</div>`;
            chatMessages.appendChild(welcome);
        });
    }

    // ---------- Изображения ----------
    // (оставляем предыдущую логику для изображений – она не меняется)
    const imageModal = document.getElementById('ai-image-modal');
    const imageGenerate = document.getElementById('image-generate-btn');
    const imagePrompt = document.getElementById('image-prompt-input');
    const imageCount = document.getElementById('image-count-select');
    const imageResult = document.getElementById('image-result');

    if (imageModal) {
        imageModal.querySelector('.modal-close')?.addEventListener('click', () => imageModal.classList.remove('active'));
        imageModal.addEventListener('click', (e) => { if (e.target === e.currentTarget) imageModal.classList.remove('active'); });
    }

    if (imageGenerate && imagePrompt && imageCount && imageResult) {
        imageGenerate.addEventListener('click', async function() {
            const prompt = imagePrompt.value.trim();
            if (!prompt) { GradusWeb.notify.warning('Введите описание'); return; }
            const count = parseInt(imageCount.value);
            imageResult.innerHTML = '<div class="image-loading">⏳ Генерация...</div>';
            // Для изображений используем прямые запросы через прокси (как раньше)
            const images = await generateImage(prompt, count); // функция generateImage уже должна быть определена (или мы её оставляем)
            if (images && images.length > 0) {
                imageResult.innerHTML = '';
                images.forEach(imgUrl => {
                    const img = document.createElement('img');
                    img.src = imgUrl;
                    img.style.width = '100%';
                    img.style.borderRadius = '8px';
                    img.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
                    imageResult.appendChild(img);
                });
            } else {
                imageResult.innerHTML = '<p style="color: #ff6b6b;">Ошибка генерации изображений. Попробуйте позже.</p>';
            }
            updateAITokenDisplay();
            renderAIHistory();
        });
    }

    // При открытии кабинета показываем историю
    const cabinetLink = document.querySelector('[data-page="page-cabinet"]');
    if (cabinetLink) {
        cabinetLink.addEventListener('click', function() {
            setTimeout(renderAIHistory, 300);
        });
    }
}

function openAIChatModal() {
    const modal = document.getElementById('ai-chat-modal');
    if (modal) {
        modal.classList.add('active');
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            // Загружаем историю
            loadChatHistory().then(history => {
                chatMessages.innerHTML = '';
                if (history.length === 0) {
                    const welcome = document.createElement('div');
                    welcome.className = 'chat-message assistant';
                    welcome.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">Задайте мне вопрос!</div>`;
                    chatMessages.appendChild(welcome);
                } else {
                    history.forEach(entry => {
                        const userMsg = document.createElement('div');
                        userMsg.className = 'chat-message user';
                        userMsg.innerHTML = `<div class="msg-author">Вы</div><div class="msg-text">${GradusWeb.security.sanitizeHTML(entry.prompt)}</div>`;
                        chatMessages.appendChild(userMsg);
                        const assistantMsg = document.createElement('div');
                        assistantMsg.className = 'chat-message assistant';
                        assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">${parseMarkdown(entry.response)}</div>`;
                        chatMessages.appendChild(assistantMsg);
                    });
                }
                chatMessages.scrollTop = chatMessages.scrollHeight;
                setTimeout(setupCopyButtons, 100);
            });
        }
        updateAITokenDisplay();
    }
}

function openAIImageModal() {
    const modal = document.getElementById('ai-image-modal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('image-result').innerHTML = '';
        updateAITokenDisplay();
    }
}

// ============================================================
// Генерация изображений (прямые запросы через прокси)
// ============================================================
async function generateImage(prompt, count = 1) {
    if (!currentUser) {
        GradusWeb.notify.warning('Войдите в аккаунт');
        return null;
    }
    // Для изображений пока оставляем старую логику (прямой запрос к Pollinations через прокси)
    try {
        const PROXY = 'https://api.codetabs.com/v1/proxy?quest=';
        const images = [];
        for (let i = 0; i < count; i++) {
            const target = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&seed=${Date.now() + i}`;
            const url = PROXY + encodeURIComponent(target);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            images.push(URL.createObjectURL(blob));
        }
        return images;
    } catch (e) {
        console.error('[GradAI] Ошибка генерации изображений:', e);
        GradusWeb.notify.error('Ошибка генерации изображений: ' + (e.message || 'Неизвестная ошибка'));
        return null;
    }
}

// ============================================================
// Обёртка для updateUIElements (обновление токенов)
// ============================================================
if (window.updateUIElements) {
    const originalUpdateUI = window.updateUIElements;
    window.updateUIElements = async function() {
        await originalUpdateUI.apply(this, arguments);
        if (currentUser) {
            updateAITokenDisplay();
        }
    };
}

// ============================================================
// Инициализация
// ============================================================
async function initAI() {
    console.log('[GradAI] Инициализация...');
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    setupAIUI();
    if (currentUser) {
        await refreshAITokens(currentUser);
        updateAITokenDisplay();
        renderAIHistory();
    }
    // Перехватываем загрузку пользователя для обновления токенов
    const originalLoadUser = window.loadUser;
    if (originalLoadUser) {
        window.loadUser = async function(uid) {
            await originalLoadUser.apply(this, arguments);
            if (currentUser) {
                await refreshAITokens(currentUser);
                updateAITokenDisplay();
                renderAIHistory();
            }
        };
    }
    console.log('[GradAI] Инициализация завершена.');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initAI, 500));
} else {
    setTimeout(initAI, 500);
}