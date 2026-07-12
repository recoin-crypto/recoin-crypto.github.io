// ============================================================
// ai.js — GradAI (асинхронная обработка через Firebase)
// ============================================================

const AI_CONFIG = {
    // Режимы генерации
    // 512 - как единственный режим старой версии
    MODES: {
        TURBO: { cost: 30, maxTokens: 512, label: 'TURBO (30 токенов)' },
        HIGH: { cost: 60, maxTokens: 1024, label: 'HIGH+ (60 токенов)' },
        CODER: { cost: 90, maxTokens: 8192, label: 'CODER (90 токенов)' }
    }
    FREE_TIER_LIMIT: 5000,
    VIP_TIER_LIMIT: 25000,
    MODEL_NAME_TEXT: 'GradAI 4',
    MODEL_NAME_IMAGE: 'GradAI IMG-3'
};

// Текущий режим (по умолчанию HIGH)
let currentMode = 'HIGH';

// ============================================================
// Проверка и начисление AI-токенов (раз в месяц)
// ============================================================
async function refreshAITokens(user) {
    if (!user) return;
    const uid = user.uid;
    const now = Date.now();
    let lastRefill = user.ai_last_refill || 0;

    if (lastRefill === 0) {
        await writeFirebase(`users/${uid}/ai_last_refill`, now);
        user.ai_last_refill = now;
        return;
    }

    const isVIP = window.isVIPActive ? window.isVIPActive(user) : false;
    const limit = isVIP ? AI_CONFIG.VIP_TIER_LIMIT : AI_CONFIG.FREE_TIER_LIMIT;
    const oneMonth = 30 * 24 * 60 * 60 * 1000;

    if (now - lastRefill >= oneMonth) {
        let currentTokens = user.ai_tokens || 0;
        if (currentTokens < limit) {
            currentTokens = limit;
        }
        await writeFirebase(`users/${uid}/ai_tokens`, currentTokens);
        await writeFirebase(`users/${uid}/ai_last_refill`, now);
        user.ai_tokens = currentTokens;
        user.ai_last_refill = now;
        GradusWeb.notify.info(`AI-токены обновлены! Текущий баланс: ${currentTokens}`);
    } else {
        user.ai_tokens = user.ai_tokens || 0;
        user.ai_last_refill = user.ai_last_refill || 0;
    }
}

// ============================================================
// Загрузка истории
// ============================================================
async function loadChatHistory() {
    if (!currentUser) return [];
    const allRequests = await readFirebase('gradAI/requests');
    if (!allRequests) return [];
    const entries = Object.entries(allRequests)
        .filter(([key, val]) => val.uid === currentUser.uid)
        .map(([key, val]) => ({
            id: key,
            prompt: val.prompt,
            response: val.response || '',
            status: val.status || 'pending',
            timestamp: val.timestamp,
            mode: val.mode || 'HIGH' // сохраняем режим
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
    return entries;
}

// ============================================================
// Отправка запроса в Firebase
// ============================================================
async function sendAIRequest(prompt) {
    if (!currentUser) {
        GradusWeb.notify.warning('Войдите в аккаунт');
        return null;
    }

    await refreshAITokens(currentUser);

    const modeConfig = AI_CONFIG.MODES[currentMode];
    const cost = modeConfig.cost;

    if ((currentUser.ai_tokens || 0) < cost) {
        GradusWeb.notify.warning(`Недостаточно AI-токенов. Нужно ${cost}, у вас ${currentUser.ai_tokens || 0}`);
        return null;
    }

    const newBalance = (currentUser.ai_tokens || 0) - cost;
    await writeFirebase(`users/${currentUser.uid}/ai_tokens`, newBalance);
    currentUser.ai_tokens = newBalance;

    const requestData = {
        uid: currentUser.uid,
        prompt: prompt,
        status: 'pending',
        response: '',
        timestamp: Date.now(),
        mode: currentMode, // сохраняем режим
        max_tokens: modeConfig.maxTokens
    };

    const result = await pushFirebase('gradAI/requests', requestData);
    if (!result) {
        await writeFirebase(`users/${currentUser.uid}/ai_tokens`, currentUser.ai_tokens + cost);
        currentUser.ai_tokens += cost;
        GradusWeb.notify.error('Ошибка сохранения запроса');
        return null;
    }

    let requestId = null;
    if (typeof result === 'string') {
        try {
            const parsed = JSON.parse(result);
            requestId = parsed.name;
        } catch (e) {
            requestId = result;
        }
    } else if (result.name) {
        requestId = result.name;
    } else if (result.key) {
        requestId = result.key;
    }

    if (!requestId) {
        GradusWeb.notify.error('Ошибка создания запроса');
        return null;
    }

    return requestId;
}

// ============================================================
// Ожидание ответа (polling)
// ============================================================
function waitForResponse(requestId, onUpdate) {
    const path = `gradAI/requests/${requestId}`;
    let attempts = 0;
    const maxAttempts = 120; // 120 * 1.5 сек = 3 минуты

    function checkStatus() {
        attempts++;
        readFirebase(path).then(data => {
            if (!data) {
                if (onUpdate) onUpdate('error', 'Запрос не найден');
                return;
            }
            if (data.status === 'done') {
                if (onUpdate) onUpdate('done', data.response);
                return;
            } else if (data.status === 'error') {
                if (onUpdate) onUpdate('error', data.error || 'Ошибка обработки');
                return;
            }
            if (attempts >= maxAttempts) {
                if (onUpdate) onUpdate('error', 'Время ожидания истекло');
                return;
            }
            if (onUpdate) onUpdate('processing', null);
            setTimeout(checkStatus, 1500);
        }).catch(err => {
            if (onUpdate) onUpdate('error', err.message);
        });
    }

    checkStatus();
}

// ============================================================
// Генерация текста (с колбэком)
// ============================================================
async function generateText(prompt, onUpdate) {
    try {
        const requestId = await sendAIRequest(prompt);
        if (!requestId) {
            if (onUpdate) onUpdate('error', 'Не удалось создать запрос');
            return;
        }
        await new Promise((resolve) => {
            waitForResponse(requestId, (status, data) => {
                if (status === 'done') {
                    if (onUpdate) onUpdate('done', data);
                    resolve();
                } else if (status === 'error') {
                    if (onUpdate) onUpdate('error', data);
                    resolve();
                } else if (status === 'processing') {
                    if (onUpdate) onUpdate('processing', null);
                }
            });
        });
    } catch (e) {
        console.error('[GradAI] Ошибка генерации:', e);
        if (onUpdate) onUpdate('error', e.message || 'Неизвестная ошибка');
    }
}

// ============================================================
// Очистка истории
// ============================================================
async function clearUserHistory() {
    if (!currentUser) {
        GradusWeb.notify.warning('Войдите в аккаунт');
        return;
    }
    const uid = currentUser.uid;
    const allRequests = await readFirebase('gradAI/requests');
    if (!allRequests) {
        GradusWeb.notify.info('История уже пуста');
        return;
    }
    const entries = Object.entries(allRequests).filter(([key, val]) => val.uid === uid);
    if (entries.length === 0) {
        GradusWeb.notify.info('История уже пуста');
        return;
    }
    if (!confirm('Удалить всю историю запросов к ИИ?')) return;
    for (const [key] of entries) {
        await deleteFirebase(`gradAI/requests/${key}`);
    }
    GradusWeb.notify.success('История очищена');

    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
        const welcome = document.createElement('div');
        welcome.className = 'chat-message assistant';
        welcome.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">Задайте мне вопрос!</div>`;
        chatMessages.appendChild(welcome);
    }
    renderAIHistory();
}

// ============================================================
// Markdown парсер (исправленный)
// ============================================================
function parseMarkdown(text) {
    if (!text) return '';
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Блоки кода (```language ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
        const langAttr = lang ? ` class="language-${lang}"` : '';
        return `<div class="code-block"><pre><code${langAttr}>${code}</code></pre><button class="copy-code-btn">📋 Копировать</button></div>`;
    });
    // Жирный **текст**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Курсив *текст*
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Заголовки ##
    html = html.replace(/^## (.*$)/gm, '<h3>$1</h3>');
    // Ссылки [текст](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Переносы строк
    html = html.replace(/\n/g, '<br>');
    return html;
}

// ============================================================
// UI: обновление баланса
// ============================================================
function updateAITokenDisplay() {
    const balance = currentUser ? currentUser.ai_tokens || 0 : 0;
    document.querySelectorAll('#ai-token-balance, #ai-token-balance-image, #ai-token-balance-profile').forEach(el => {
        if (el) el.textContent = balance.toFixed(0);
    });
    // Обновляем информацию о режиме
    const modeInfo = document.getElementById('ai-mode-info');
    if (modeInfo) {
        const mode = AI_CONFIG.MODES[currentMode];
        modeInfo.textContent = `Режим: ${mode.label}`;
    }
}

// ============================================================
// История на странице (в кабинете)
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
        let statusText = '';
        if (entry.status === 'pending' || entry.status === 'processing') {
            statusText = '⏳ Обрабатывается...';
        } else if (entry.status === 'done') {
            statusText = '✅ Готово';
        } else {
            statusText = '❌ Ошибка';
        }
        const response = entry.status === 'done' ? GradusWeb.security.sanitizeHTML(entry.response) : statusText;
        const modeLabel = AI_CONFIG.MODES[entry.mode]?.label || entry.mode;
        html += `<div class="ai-history-item">
            <div><strong>📝 Текст</strong> — <span class="ai-date">${date}</span> ${statusText}</div>
            <div style="font-size: 13px; color: #aaa;">Запрос: ${prompt}</div>
            <div style="font-size: 13px; color: #ccc;">Ответ: ${response}</div>
            <div style="font-size: 12px; color: #888;">Режим: ${modeLabel}</div>
        </div>`;
    });
    container.innerHTML = html;
}

// ============================================================
// Копирование кода
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
// Отображение сообщений в модалке (без принудительного скролла)
// ============================================================
async function renderChatMessages(chatMessages, keepScroll = false) {
    if (!chatMessages) return;
    const history = await loadChatHistory();
    const oldScrollTop = chatMessages.scrollTop;
    const oldScrollHeight = chatMessages.scrollHeight;
    chatMessages.innerHTML = '';
    if (history.length === 0) {
        const welcome = document.createElement('div');
        welcome.className = 'chat-message assistant';
        welcome.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">Задайте мне вопрос!</div>`;
        chatMessages.appendChild(welcome);
        chatMessages.scrollTop = 0;
        return;
    }
    history.forEach(entry => {
        const userMsg = document.createElement('div');
        userMsg.className = 'chat-message user';
        userMsg.innerHTML = `<div class="msg-author">Вы</div><div class="msg-text">${GradusWeb.security.sanitizeHTML(entry.prompt)}</div>`;
        chatMessages.appendChild(userMsg);

        const assistantMsg = document.createElement('div');
        assistantMsg.className = 'chat-message assistant';
        if (entry.status === 'done') {
            assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">${parseMarkdown(entry.response)}</div>`;
        } else if (entry.status === 'pending' || entry.status === 'processing') {
            assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text" style="color: #888;">⏳ Обрабатывается...</div>`;
        } else {
            assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text" style="color: #ff6b6b;">❌ Ошибка обработки</div>`;
        }
        chatMessages.appendChild(assistantMsg);
    });
    // Восстанавливаем скролл, если не нужно принудительно вниз
    if (keepScroll) {
        const newScrollHeight = chatMessages.scrollHeight;
        chatMessages.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
    } else {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    setTimeout(setupCopyButtons, 100);
}

// ============================================================
// UI-интеграция
// ============================================================
let aiUIInitialized = false;
let chatUpdateInterval = null;

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

    const clearBtn = document.getElementById('chat-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearUserHistory);
    }

    setupModalHandlers();
    console.log('[GradAI] Обработчики кнопок ИИ установлены.');
}

function setupModalHandlers() {
    const chatModal = document.getElementById('ai-chat-modal');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send-btn');
    const chatModeSelect = document.getElementById('chat-mode-select');

    if (chatModal) {
        chatModal.querySelector('.modal-close')?.addEventListener('click', () => chatModal.classList.remove('active'));
        chatModal.addEventListener('click', (e) => { if (e.target === e.currentTarget) chatModal.classList.remove('active'); });
    }

    // Режимы: выпадающий список
    if (chatModeSelect) {
        // Заполняем опции
        chatModeSelect.innerHTML = '';
        for (const [key, mode] of Object.entries(AI_CONFIG.MODES)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = mode.label;
            if (key === currentMode) option.selected = true;
            chatModeSelect.appendChild(option);
        }
        chatModeSelect.addEventListener('change', function() {
            currentMode = this.value;
            updateAITokenDisplay();
        });
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

            // Временное сообщение
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'chat-message assistant loading';
            loadingMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">⏳ Обрабатывается...</div>`;
            chatMessages.appendChild(loadingMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            chatSend.disabled = true;

            await generateText(prompt, (status, data) => {
                if (status === 'done') {
                    loadingMsg.remove();
                    const assistantMsg = document.createElement('div');
                    assistantMsg.className = 'chat-message assistant';
                    assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">${parseMarkdown(data)}</div>`;
                    chatMessages.appendChild(assistantMsg);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    setTimeout(setupCopyButtons, 100);
                    updateAITokenDisplay();
                    renderAIHistory();
                } else if (status === 'error') {
                    loadingMsg.remove();
                    const errorMsg = document.createElement('div');
                    errorMsg.className = 'chat-message assistant';
                    errorMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text" style="color: #ff6b6b;">❌ Ошибка: ${data}</div>`;
                    chatMessages.appendChild(errorMsg);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } else if (status === 'processing') {
                    loadingMsg.querySelector('.msg-text').textContent = '⏳ Обрабатывается...';
                }
            });

            chatSend.disabled = false;
        });

        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatSend.click();
            }
        });
    }

    // ---------- Изображения ----------
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
            imageResult.innerHTML = '<div class="image-loading">⏳ Генерация... (≈ 5–20 сек)</div>';
            const images = await generateImage(prompt, count);
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

    const cabinetLink = document.querySelector('[data-page="page-cabinet"]');
    if (cabinetLink) {
        cabinetLink.addEventListener('click', function() {
            setTimeout(renderAIHistory, 300);
        });
    }
}

// ============================================================
// Открытие модалки чата
// ============================================================
function openAIChatModal() {
    const modal = document.getElementById('ai-chat-modal');
    if (modal) {
        modal.classList.add('active');
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            // Загружаем историю без принудительного скролла вниз (сохраняем позицию)
            renderChatMessages(chatMessages, true);
            // Запускаем обновление, но не сбрасываем скролл
            if (chatUpdateInterval) clearInterval(chatUpdateInterval);
            chatUpdateInterval = setInterval(async () => {
                if (document.getElementById('ai-chat-modal').classList.contains('active')) {
                    await renderChatMessages(chatMessages, true);
                } else {
                    clearInterval(chatUpdateInterval);
                    chatUpdateInterval = null;
                }
            }, 3000);
        }
        updateAITokenDisplay();
    }
}

// ============================================================
// Генерация изображений (остаётся без изменений)
// ============================================================
async function generateImage(prompt, count = 1) {
    if (!currentUser) {
        GradusWeb.notify.warning('Войдите в аккаунт');
        return null;
    }

    await refreshAITokens(currentUser);

    let cost;
    if (count === 1) cost = 150;
    else if (count === 4) cost = 500;
    else {
        GradusWeb.notify.warning('Поддерживается только 1 или 4 изображения');
        return null;
    }

    if ((currentUser.ai_tokens || 0) < cost) {
        GradusWeb.notify.warning(`Недостаточно AI-токенов. Нужно ${cost}, у вас ${currentUser.ai_tokens || 0}`);
        return null;
    }

    try {
        GradusWeb.notify.info(`Генерация ${count} изображений... (≈ 5–20 сек)`);

        const images = [];
        const PROXY = 'https://api.codetabs.com/v1/proxy?quest=';
        for (let i = 0; i < count; i++) {
            const encodedPrompt = encodeURIComponent(prompt);
            const targetUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${Date.now() + i}`;
            const url = PROXY + encodeURIComponent(targetUrl);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            images.push(URL.createObjectURL(blob));
        }

        const newBalance = (currentUser.ai_tokens || 0) - cost;
        await writeFirebase(`users/${currentUser.uid}/ai_tokens`, newBalance);
        currentUser.ai_tokens = newBalance;

        await pushFirebase(`users/${currentUser.uid}/ai_history`, {
            type: 'image',
            prompt: prompt,
            count: count,
            cost: cost,
            timestamp: Date.now()
        });

        GradusWeb.notify.success(`Сгенерировано ${count} изображений! Осталось токенов: ${newBalance}`);
        return images;
    } catch (e) {
        console.error('[GradAI] Ошибка генерации изображений:', e);
        GradusWeb.notify.error('Ошибка генерации изображений: ' + (e.message || 'Неизвестная ошибка'));
        return null;
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
// Обёртка для updateUIElements
// ============================================================
if (window.updateUIElements) {
    const originalUpdateUI = window.updateUIElements;
    window.updateUIElements = async function() {
        await originalUpdateUI.apply(this, arguments);
        if (currentUser) updateAITokenDisplay();
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