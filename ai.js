// ============================================================
// ai.js — GradAI (Hugging Face + Pollinations для изображений)
// ============================================================

const AI_CONFIG = {
    TEXT_COST: 50,
    IMAGE_SINGLE_COST: 150,
    IMAGE_QUAD_COST: 500,
    FREE_TIER_LIMIT: 5000,
    VIP_TIER_LIMIT: 25000,
    MODEL_NAME_TEXT: 'GradAI 4',
    MODEL_NAME_IMAGE: 'GradAI IMG-3',
    // Hugging Face
    HF_API_URL: 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium',
    HF_TOKEN: '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', // <--- ВСТАВЬТЕ СВОЙ ТОКЕН
    // Прокси для изображений
    CORS_PROXY: 'https://api.allorigins.win/raw?url='
};

if (AI_CONFIG.HF_TOKEN === 'YOUR_HF_TOKEN_HERE') {
    console.warn('[GradAI] HF_TOKEN не задан. Лимиты будут ниже.');
}

// ============================================================
// Токены
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
// Текст через Hugging Face
// ============================================================
async function generateText(prompt) {
    if (!currentUser) {
        GradusWeb.notify.warning('Войдите в аккаунт');
        return null;
    }
    await refreshAITokens(currentUser);
    if ((currentUser.ai_tokens || 0) < AI_CONFIG.TEXT_COST) {
        GradusWeb.notify.warning(`Недостаточно AI-токенов. Нужно ${AI_CONFIG.TEXT_COST}, у вас ${currentUser.ai_tokens || 0}`);
        return null;
    }

    try {
        const startTime = Date.now();
        GradusWeb.notify.info('Генерация текста... (≈ 3–10 сек)');

        const fullPrompt = `Вы: ${prompt}\nGradAI:`;
        const response = await fetch(AI_CONFIG.HF_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': AI_CONFIG.HF_TOKEN ? `Bearer ${AI_CONFIG.HF_TOKEN}` : ''
            },
            body: JSON.stringify({
                inputs: fullPrompt,
                parameters: { max_length: 200, temperature: 0.7, do_sample: true }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[GradAI] Ошибка HF API:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
        }

        const data = await response.json();
        let answer = '';
        if (Array.isArray(data) && data.length > 0) {
            answer = data[0].generated_text || data[0].text || '';
        } else if (data.generated_text) {
            answer = data.generated_text;
        } else {
            answer = data.text || 'Нет ответа';
        }

        const parts = answer.split('GradAI:');
        if (parts.length > 1) {
            answer = parts[parts.length - 1].trim();
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const newBalance = (currentUser.ai_tokens || 0) - AI_CONFIG.TEXT_COST;
        await writeFirebase(`users/${currentUser.uid}/ai_tokens`, newBalance);
        currentUser.ai_tokens = newBalance;

        await pushFirebase(`users/${currentUser.uid}/ai_history`, {
            type: 'text',
            prompt: prompt,
            response: answer,
            cost: AI_CONFIG.TEXT_COST,
            timestamp: Date.now(),
            elapsed: elapsed
        });

        GradusWeb.notify.success(`Ответ получен за ${elapsed}с. Осталось токенов: ${newBalance}`);
        return answer;
    } catch (e) {
        console.error('[GradAI] Ошибка генерации текста:', e);
        GradusWeb.notify.error('Ошибка генерации текста: ' + (e.message || 'Неизвестная ошибка'));
        return null;
    }
}

// ============================================================
// Изображения через Pollinations с прокси
// ============================================================
async function generateImage(prompt, count = 1) {
    if (!currentUser) {
        GradusWeb.notify.warning('Войдите в аккаунт');
        return null;
    }
    await refreshAITokens(currentUser);

    let cost;
    if (count === 1) cost = AI_CONFIG.IMAGE_SINGLE_COST;
    else if (count === 4) cost = AI_CONFIG.IMAGE_QUAD_COST;
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
        for (let i = 0; i < count; i++) {
            const encodedPrompt = encodeURIComponent(prompt);
            const baseUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${Date.now() + i}`;
            const url = AI_CONFIG.CORS_PROXY + encodeURIComponent(baseUrl);
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

// ============================================================
// Markdown и прочее (без изменений)
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

function updateAITokenDisplay() {
    const balance = currentUser ? currentUser.ai_tokens || 0 : 0;
    document.querySelectorAll('#ai-token-balance, #ai-token-balance-image, #ai-token-balance-profile').forEach(el => {
        if (el) el.textContent = balance.toFixed(0);
    });
}

async function renderAIHistory() {
    if (!currentUser) return;
    const history = await readFirebase(`users/${currentUser.uid}/ai_history`);
    const container = document.getElementById('ai-history-container');
    if (!container) return;
    if (!history) {
        container.innerHTML = '<p>Нет запросов к ИИ</p>';
        return;
    }
    const entries = Object.values(history).sort((a,b) => b.timestamp - a.timestamp);
    let html = '';
    entries.slice(0, 20).forEach(entry => {
        const type = entry.type === 'text' ? '📝 Текст' : '🖼️ Изображение';
        const date = new Date(entry.timestamp).toLocaleString();
        const prompt = GradusWeb.security.sanitizeHTML(entry.prompt);
        const response = entry.response ? GradusWeb.security.sanitizeHTML(entry.response) : '';
        const elapsed = entry.elapsed ? ` (${entry.elapsed}с)` : '';
        html += `<div class="ai-history-item">
            <div><strong>${type}</strong> — <span class="ai-date">${date}</span>${elapsed}</div>
            <div style="font-size: 13px; color: #aaa;">Запрос: ${prompt}</div>
            ${response ? `<div style="font-size: 13px; color: #ccc;">Ответ: ${response}</div>` : ''}
            <div style="font-size: 12px; color: #888;">Стоимость: ${entry.cost} токенов</div>
        </div>`;
    });
    container.innerHTML = html || '<p>Нет запросов</p>';
}

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
// UI
// ============================================================
function setupAIUI() {
    const actionsGrid = document.querySelector('.actions-grid');
    if (!actionsGrid) {
        setTimeout(setupAIUI, 500);
        return;
    }

    actionsGrid.addEventListener('click', function(e) {
        const target = e.target.closest('#ai-chat-btn');
        if (target) {
            e.preventDefault();
            if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
            openAIChatModal();
        }
    });

    actionsGrid.addEventListener('click', function(e) {
        const target = e.target.closest('#ai-image-btn');
        if (target) {
            e.preventDefault();
            if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
            openAIImageModal();
        }
    });

    setupModalHandlers();
}

function setupModalHandlers() {
    const chatModal = document.getElementById('ai-chat-modal');
    const imageModal = document.getElementById('ai-image-modal');

    document.querySelectorAll('#ai-chat-modal .modal-close, #ai-image-modal .modal-close').forEach(el => {
        el.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });

    [chatModal, imageModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === this) this.classList.remove('active');
            });
        }
    });

    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send-btn');
    const chatClear = document.getElementById('chat-clear-btn');

    if (chatSend && chatInput && chatMessages) {
        async function sendChat() {
            const prompt = chatInput.value.trim();
            if (!prompt) return;

            const userMsg = document.createElement('div');
            userMsg.className = 'chat-message user';
            userMsg.innerHTML = `<div class="msg-author">Вы</div><div class="msg-text">${GradusWeb.security.sanitizeHTML(prompt)}</div>`;
            chatMessages.appendChild(userMsg);
            chatInput.value = '';
            chatMessages.scrollTop = chatMessages.scrollHeight;

            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'chat-message assistant loading';
            loadingMsg.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">⏳ Генерация...</div>`;
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
        }

        chatSend.addEventListener('click', sendChat);
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChat();
            }
        });

        if (chatClear) {
            chatClear.addEventListener('click', function() {
                chatMessages.innerHTML = '';
                const welcome = document.createElement('div');
                welcome.className = 'chat-message assistant';
                welcome.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">Задайте мне вопрос!</div>`;
                chatMessages.appendChild(welcome);
            });
        }
    }

    const imageGenerate = document.getElementById('image-generate-btn');
    const imagePrompt = document.getElementById('image-prompt-input');
    const imageCount = document.getElementById('image-count-select');
    const imageResult = document.getElementById('image-result');

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

function openAIChatModal() {
    const modal = document.getElementById('ai-chat-modal');
    if (modal) {
        modal.classList.add('active');
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages && chatMessages.children.length === 0) {
            const welcome = document.createElement('div');
            welcome.className = 'chat-message assistant';
            welcome.innerHTML = `<div class="msg-author">${AI_CONFIG.MODEL_NAME_TEXT}</div><div class="msg-text">Задайте мне вопрос!</div>`;
            chatMessages.appendChild(welcome);
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