// ============================================================
// ai.js — GradAI 4.2 (полностью обновлён)
// Поддерживает режимы: TURBO, HIGH+, CODER, DEEPTHINK
// ============================================================

const AI_CONFIG = {
    MODES: {
        TURBO: { cost: 24, maxTokens: 512, label: 'TURBO (24 токена)' },
        HIGH: { cost: 70, maxTokens: 2048, label: 'HIGH+ (70 токенов)' },
        CODER: { cost: 100, maxTokens: 16384, label: 'CODER (100 токенов)' },
        DEEPTHINK: { cost: 85, maxTokens: 8192, label: 'DEEPTHINK (85 токенов)' }
    },
    FREE_TIER_LIMIT: 5000,
    VIP_TIER_LIMIT: 25000,
    MODEL_NAME_TEXT: 'GradAI 4.2',
    MODEL_NAME_IMAGE: 'GradAI IMG-3'
};

let currentMode = 'HIGH';

// ============================================================
// Экранирование HTML
// ============================================================
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// Разбор тегов мышления (удаляет второй блок рассуждений)
// ============================================================
function parseThinkTags(text) {
    if (!text) return { thinking: '', answer: '' };
    const thinkRegex = /<think>([\s\S]*?)<\/think>/;
    const match = text.match(thinkRegex);
    if (match) {
        let thinking = match[1].trim();
        let answer = text.replace(thinkRegex, '').trim();
        // Удаляем второй блок рассуждений, если он есть
        const extraReasoningRegex = /(?:Рассуждения|Reasoning|Размышления|Thinking):[\s\S]*/i;
        answer = answer.replace(extraReasoningRegex, '');
        answer = answer.replace(/Показать мышление/g, '').trim();
        return { thinking, answer };
    }
    return { thinking: '', answer: text };
}

// ============================================================
// Безопасный парсер Markdown (таблицы, код, заголовки)
// ============================================================
function parseMarkdown(text) {
    if (!text) return '';

    function escape(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function isHtmlPage(code) {
        const trimmed = code.trim();
        return trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html');
    }

    // Разбиваем на блоки кода (```) и обычный текст
    const parts = [];
    let remaining = text;
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    let lastIndex = 0;

    while ((match = codeBlockRegex.exec(remaining)) !== null) {
        const before = remaining.substring(lastIndex, match.index);
        if (before) parts.push({ type: 'text', content: before });
        const lang = match[1];
        const code = match[2];
        parts.push({ type: 'code', lang: lang, code: code });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < remaining.length) {
        parts.push({ type: 'text', content: remaining.substring(lastIndex) });
    }

    let html = '';
    for (const part of parts) {
        if (part.type === 'code') {
            const escapedCode = escape(part.code);
            if (isHtmlPage(part.code)) {
                const encodedCode = encodeURIComponent(part.code);
                html += `
                    <div class="code-block html-page">
                        <div class="code-header">
                            <span>🌐 HTML-страница</span>
                            <button class="run-html-btn" data-code="${encodedCode}">▶ Запустить</button>
                        </div>
                        <pre><code class="language-html">${escapedCode}</code></pre>
                        <button class="copy-code-btn">📋 Копировать</button>
                    </div>
                `;
            } else {
                const langAttr = part.lang ? ` class="language-${part.lang}"` : '';
                html += `<div class="code-block"><pre><code${langAttr}>${escapedCode}</code></pre><button class="copy-code-btn">📋 Копировать</button></div>`;
            }
        } else {
            let text = escape(part.content);

            // Обработка строк с отступами как код (4 пробела или таб) — СОХРАНЯЕМ ОТСТУПЫ
            const lines = text.split('\n');
            let inCodeBlock = false;
            let codeLines = [];
            const processedLines = [];
            for (const line of lines) {
                if (line.match(/^ {4,}/) || line.match(/^\t/)) {
                    if (!inCodeBlock) {
                        inCodeBlock = true;
                        codeLines = [];
                    }
                    codeLines.push(line);
                } else {
                    if (inCodeBlock) {
                        const code = codeLines.join('\n');
                        const escapedCode = escape(code);
                        if (isHtmlPage(code)) {
                            const encodedCode = encodeURIComponent(code);
                            processedLines.push(`
                                <div class="code-block html-page">
                                    <div class="code-header">
                                        <span>🌐 HTML-страница</span>
                                        <button class="run-html-btn" data-code="${encodedCode}">▶ Запустить</button>
                                    </div>
                                    <pre><code class="language-html">${escapedCode}</code></pre>
                                    <button class="copy-code-btn">📋 Копировать</button>
                                </div>
                            `);
                        } else {
                            processedLines.push(`<div class="code-block"><pre><code>${escapedCode}</code></pre><button class="copy-code-btn">📋 Копировать</button></div>`);
                        }
                        inCodeBlock = false;
                        codeLines = [];
                    }
                    processedLines.push(line);
                }
            }
            if (inCodeBlock) {
                const code = codeLines.join('\n');
                const escapedCode = escape(code);
                if (isHtmlPage(code)) {
                    const encodedCode = encodeURIComponent(code);
                    processedLines.push(`
                        <div class="code-block html-page">
                            <div class="code-header">
                                <span>🌐 HTML-страница</span>
                                <button class="run-html-btn" data-code="${encodedCode}">▶ Запустить</button>
                            </div>
                            <pre><code class="language-html">${escapedCode}</code></pre>
                            <button class="copy-code-btn">📋 Копировать</button>
                        </div>
                    `);
                } else {
                    processedLines.push(`<div class="code-block"><pre><code>${escapedCode}</code></pre><button class="copy-code-btn">📋 Копировать</button></div>`);
                }
            }
            text = processedLines.join('\n');

            // ---- Парсинг таблиц ----
            text = parseTables(text);

            // Markdown-разметка
            text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
            text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');
            text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
            text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
            text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

            html += text;
        }
    }

    return html;
}

// ============================================================
// Вспомогательная функция: парсинг таблиц
// ============================================================
function parseTables(text) {
    const lines = text.split('\n');
    const result = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.includes('|')) {
            const tableLines = [];
            let j = i;
            while (j < lines.length && lines[j].includes('|')) {
                tableLines.push(lines[j]);
                j++;
            }
            if (tableLines.length >= 3) {
                const secondLine = tableLines[1];
                if (/^\s*\|?\s*[:|-]+\s*\|/.test(secondLine) || /^\s*[:|-]+\s*\|/.test(secondLine)) {
                    const tableHtml = buildTable(tableLines);
                    result.push(tableHtml);
                    i = j;
                    continue;
                }
            }
            for (let k = i; k < j; k++) {
                result.push(lines[k]);
            }
            i = j;
        } else {
            result.push(line);
            i++;
        }
    }
    return result.join('\n');
}

function buildTable(tableLines) {
    if (tableLines.length < 3) return tableLines.join('\n');

    const headerCells = tableLines[0].split('|').map(cell => cell.trim()).filter(cell => cell !== '');
    const alignLine = tableLines[1];
    const alignParts = alignLine.split('|').map(part => part.trim()).filter(part => part !== '');
    const align = alignParts.map(part => {
        if (part.startsWith(':') && part.endsWith(':')) return 'center';
        if (part.endsWith(':')) return 'right';
        if (part.startsWith(':')) return 'left';
        return 'left';
    });

    const dataRows = [];
    for (let i = 2; i < tableLines.length; i++) {
        const row = tableLines[i].split('|').map(cell => cell.trim()).filter(cell => cell !== '');
        if (row.length > 0) dataRows.push(row);
    }

    let html = '<div class="table-wrapper"><table class="markdown-table">';
    html += '<thead><tr>';
    headerCells.forEach((cell, idx) => {
        const alignClass = align[idx] ? ` align-${align[idx]}` : '';
        html += `<th class="${alignClass}">${cell}</th>`;
    });
    html += '</tr></thead><tbody>';
    dataRows.forEach(row => {
        html += '<tr>';
        row.forEach((cell, idx) => {
            const alignClass = align[idx] ? ` align-${align[idx]}` : '';
            html += `<td class="${alignClass}">${cell}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
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
    const code = codeBlock.querySelector('code');
    let text = code.innerText || code.textContent;
    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✅ Скопировано';
        setTimeout(() => btn.textContent = '📋 Копировать', 2000);
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        btn.textContent = '✅ Скопировано';
        setTimeout(() => btn.textContent = '📋 Копировать', 2000);
    });
}

// ============================================================
// Обработчик кнопки "Запустить" (открывает HTML в новом окне)
// ============================================================
function setupRunButtons() {
    document.querySelectorAll('.run-html-btn').forEach(btn => {
        btn.removeEventListener('click', handleRunHtml);
        btn.addEventListener('click', handleRunHtml);
    });
}

function handleRunHtml(e) {
    const btn = e.currentTarget;
    const encodedCode = btn.dataset.code;
    if (!encodedCode) return;
    const code = decodeURIComponent(encodedCode);
    const newWindow = window.open('', '_blank');
    if (newWindow) {
        newWindow.document.write(code);
        newWindow.document.close();
    } else {
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '400px';
        iframe.style.border = 'none';
        iframe.style.background = '#fff';
        const blob = new Blob([code], { type: 'text/html' });
        iframe.src = URL.createObjectURL(blob);
        const block = btn.closest('.code-block');
        block.after(iframe);
        btn.textContent = '✅ Открыто';
        btn.disabled = true;
    }
}

// ============================================================
// Проверка и начисление AI-токенов
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
        if (currentTokens < limit) currentTokens = limit;
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
            mode: val.mode || 'HIGH'
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
        mode: currentMode,
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
    const maxAttempts = 120;

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
                    if (onUpdate) onUpdate('done', data, requestId);
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
// UI: обновление баланса
// ============================================================
function updateAITokenDisplay() {
    const balance = currentUser ? currentUser.ai_tokens || 0 : 0;
    document.querySelectorAll('#ai-token-balance, #ai-token-balance-image, #ai-token-balance-profile').forEach(el => {
        if (el) el.textContent = balance.toFixed(0);
    });
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
        const prompt = escapeHtml(entry.prompt);
        let statusText = '';
        if (entry.status === 'pending' || entry.status === 'processing') {
            statusText = '⏳ Обрабатывается...';
        } else if (entry.status === 'done') {
            statusText = '✅ Готово';
        } else {
            statusText = '❌ Ошибка';
        }
        const response = entry.status === 'done' ? escapeHtml(entry.response) : statusText;
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
// Хранилище состояний мышления
// ============================================================
const thinkStates = new Map();

window.toggleThink = function(msgId) {
    const current = thinkStates.get(msgId) || false;
    const newState = !current;
    thinkStates.set(msgId, newState);

    const blocks = document.querySelectorAll(`.think-block[data-msgid="${msgId}"]`);
    blocks.forEach(block => {
        const btn = block.querySelector('.think-toggle');
        const content = block.querySelector('.think-content');
        if (btn) {
            btn.textContent = newState ? 'Скрыть мышление' : 'Показать мышление';
        }
        if (content) {
            content.style.display = newState ? 'block' : 'none';
        }
    });
};

// ============================================================
// Отображение сообщений в модалке (инкрементальное)
// ============================================================
async function renderChatMessages(chatMessages, keepScroll = false) {
    if (!chatMessages) return;
    const history = await loadChatHistory();
    if (history.length === 0) {
        chatMessages.innerHTML = `<div class="chat-message assistant">
            <div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div>
            <div class="msg-text">Задайте мне вопрос!</div>
        </div>`;
        return;
    }

    const oldScrollTop = chatMessages.scrollTop;
    const oldScrollHeight = chatMessages.scrollHeight;
    let scrollToBottom = false;

    const existingIds = new Set();
    for (let child of chatMessages.children) {
        const id = child.dataset.msgId;
        if (id) existingIds.add(id);
    }

    const fragment = document.createDocumentFragment();
    let newMsgCount = 0;

    history.forEach(entry => {
        const msgId = entry.id;
        if (existingIds.has(msgId)) return;

        newMsgCount++;

        // Сообщение пользователя
        const userMsg = document.createElement('div');
        userMsg.className = 'chat-message user';
        userMsg.dataset.msgId = msgId + '_user';
        userMsg.innerHTML = `<div class="msg-author">Вы</div><div class="msg-text">${escapeHtml(entry.prompt)}</div>`;
        fragment.appendChild(userMsg);

        // Сообщение ассистента
        const assistantMsg = document.createElement('div');
        assistantMsg.className = 'chat-message assistant';
        assistantMsg.dataset.msgId = msgId;

        if (entry.status === 'done') {
            const { thinking, answer } = parseThinkTags(entry.response);
            let contentHtml = '';
            if (thinking) {
                const isOpen = thinkStates.get(msgId) || false;
                contentHtml += `
                    <div class="think-block" data-msgid="${msgId}">
                        <button class="think-toggle" data-msgid="${msgId}" onclick="toggleThink('${msgId}')">${isOpen ? 'Скрыть мышление' : 'Показать мышление'}</button>
                        <div class="think-content" style="display: ${isOpen ? 'block' : 'none'};">${parseMarkdown(thinking)}</div>
                    </div>
                `;
            }
            contentHtml += `<div class="msg-text">${parseMarkdown(answer)}</div>`;
            assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div>${contentHtml}`;
            setTimeout(() => {
                setupCopyButtons();
                setupRunButtons();
            }, 100);
        } else if (entry.status === 'pending' || entry.status === 'processing') {
            assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text" style="color: #888;">⏳ Обрабатывается...</div>`;
        } else {
            assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text" style="color: #ff6b6b;">❌ Ошибка обработки</div>`;
        }
        fragment.appendChild(assistantMsg);
    });

    if (newMsgCount > 0) {
        chatMessages.appendChild(fragment);
        scrollToBottom = true;
    }

    // Обновляем статус существующих сообщений
    for (let child of chatMessages.children) {
        if (child.classList.contains('assistant')) {
            const id = child.dataset.msgId;
            if (!id) continue;
            const entry = history.find(e => e.id === id);
            if (entry && entry.status === 'done' && child.querySelector('.msg-text')?.textContent === '⏳ Обрабатывается...') {
                const { thinking, answer } = parseThinkTags(entry.response);
                let contentHtml = '';
                if (thinking) {
                    const isOpen = thinkStates.get(id) || false;
                    contentHtml += `
                        <div class="think-block" data-msgid="${id}">
                            <button class="think-toggle" data-msgid="${id}" onclick="toggleThink('${id}')">${isOpen ? 'Скрыть мышление' : 'Показать мышление'}</button>
                            <div class="think-content" style="display: ${isOpen ? 'block' : 'none'};">${parseMarkdown(thinking)}</div>
                        </div>
                    `;
                }
                contentHtml += `<div class="msg-text">${parseMarkdown(answer)}</div>`;
                child.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div>${contentHtml}`;
                setTimeout(() => {
                    setupCopyButtons();
                    setupRunButtons();
                }, 100);
            }
        }
    }

    if (scrollToBottom) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } else if (keepScroll) {
        const newScrollHeight = chatMessages.scrollHeight;
        chatMessages.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
    } else {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// ============================================================
// UI-интеграция
// ============================================================
let aiUIInitialized = false;
let chatUpdateInterval = null;

function setupAIUI() {
    if (aiUIInitialized) return;
    aiUIInitialized = true;

    const actionsGrid = document.querySelector('.actions-grid');
    if (!actionsGrid) {
        setTimeout(setupAIUI, 500);
        return;
    }

    const chatBtn = document.getElementById('ai-chat-btn');
    if (chatBtn) {
        chatBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
            openAIChatModal();
        });
    }

    const imageBtn = document.getElementById('ai-image-btn') || document.getElementById('ai-image-btn-DELETE-THIS-IF-YOU-WANT-ACTIVATE');
    if (imageBtn) {
        imageBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
            openAIImageModal();
        });
    }

    const clearBtn = document.getElementById('chat-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearUserHistory);
    }

    setupModalHandlers();
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

    if (chatModeSelect) {
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

            // Создаём сообщение пользователя с уникальным временным ID
            const tempId = 'user_' + Date.now();
            const userMsg = document.createElement('div');
            userMsg.className = 'chat-message user';
            userMsg.dataset.msgId = tempId;
            userMsg.innerHTML = `<div class="msg-author">Вы</div><div class="msg-text">${escapeHtml(prompt)}</div>`;
            chatMessages.appendChild(userMsg);
            chatInput.value = '';
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Сообщение "Загрузка"
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'chat-message assistant loading';
            loadingMsg.dataset.msgId = 'loading_' + Date.now();
            loadingMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">⏳ Обрабатывается...</div>`;
            chatMessages.appendChild(loadingMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            chatSend.disabled = true;

            await generateText(prompt, (status, data, requestId) => {
                if (status === 'done') {
                    loadingMsg.remove();
                    const { thinking, answer } = parseThinkTags(data);
                    const assistantMsg = document.createElement('div');
                    assistantMsg.className = 'chat-message assistant';
                    assistantMsg.dataset.msgId = requestId;
                    let contentHtml = '';
                    if (thinking) {
                        const isOpen = thinkStates.get(requestId) || false;
                        contentHtml += `
                            <div class="think-block" data-msgid="${requestId}">
                                <button class="think-toggle" data-msgid="${requestId}" onclick="toggleThink('${requestId}')">${isOpen ? 'Скрыть мышление' : 'Показать мышление'}</button>
                                <div class="think-content" style="display: ${isOpen ? 'block' : 'none'};">${parseMarkdown(thinking)}</div>
                            </div>
                        `;
                    }
                    contentHtml += `<div class="msg-text">${parseMarkdown(answer)}</div>`;
                    assistantMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div>${contentHtml}`;
                    chatMessages.appendChild(assistantMsg);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    setTimeout(() => {
                        setupCopyButtons();
                        setupRunButtons();
                    }, 100);
                    updateAITokenDisplay();
                    renderAIHistory();
                } else if (status === 'error') {
                    loadingMsg.remove();
                    const errorMsg = document.createElement('div');
                    errorMsg.className = 'chat-message assistant';
                    errorMsg.dataset.msgId = 'error_' + Date.now();
                    errorMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text" style="color: #ff6b6b;">❌ Ошибка: ${escapeHtml(data)}</div>`;
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

    // Генерация изображений (без изменений)
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
            renderChatMessages(chatMessages, true);
            if (chatUpdateInterval) clearInterval(chatUpdateInterval);
            chatUpdateInterval = setInterval(async () => {
                if (!document.getElementById('ai-chat-modal').classList.contains('active')) {
                    clearInterval(chatUpdateInterval);
                    chatUpdateInterval = null;
                    return;
                }
                await renderChatMessages(chatMessages, true);
            }, 3000);
        }
        updateAITokenDisplay();
    }
}

// ============================================================
// Генерация изображений
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
// Инициализация
// ============================================================
if (window.updateUIElements) {
    const originalUpdateUI = window.updateUIElements;
    window.updateUIElements = async function() {
        await originalUpdateUI.apply(this, arguments);
        if (currentUser) updateAITokenDisplay();
    };
}

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

window.openAIChatModal = openAIChatModal;