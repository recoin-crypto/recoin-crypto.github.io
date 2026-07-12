// ============================================================
// ai.js — GradAI (интеграция Puter.js для текста и изображений)
// ============================================================

// Конфигурация
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
// Загрузка Puter.js (если ещё не загружен)
// ============================================================
function loadPuterJS() {
    return new Promise((resolve, reject) => {
        if (typeof puter !== 'undefined') {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://js.puter.com/v2/';
        script.onload = () => resolve();
        script.onerror = () => reject('Ошибка загрузки Puter.js');
        document.head.appendChild(script);
    });
}

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
        if (currentTokens < limit) {
            currentTokens = limit;
        } else {
            // Если больше или равно – не меняем
        }
        await writeFirebase(`users/${uid}/ai_tokens`, currentTokens);
        await writeFirebase(`users/${uid}/ai_last_refill`, now);
        user.ai_tokens = currentTokens;
        user.ai_last_refill = now;
        GradusWeb.notify.info(`AI-токены обновлены! Текущий баланс: ${currentTokens}`);
    }
}

// ============================================================
// Генерация текста
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
        GradusWeb.notify.info('Генерация текста...');

        await loadPuterJS();

        // Формируем системный промпт для ИИ
        const systemPrompt = `Ты — GradAI, созданный компанией Gradus (Gradus Team). Ты отвечаешь на вопросы на русском языке, вежливо и полезно. На вопрос "какая у тебя модель" отвечай: "Я — GradAI 4". Ты помогаешь пользователям с любыми вопросами.`;
        const fullPrompt = `${systemPrompt}\n\nПользователь: ${prompt}\n\nОтвет GradAI:`;

        const response = await puter.ai.chat(fullPrompt, { model: 'gpt-4o-mini' });
        const answer = response.message?.content || response;

        const newBalance = (currentUser.ai_tokens || 0) - AI_CONFIG.TEXT_COST;
        await writeFirebase(`users/${currentUser.uid}/ai_tokens`, newBalance);
        currentUser.ai_tokens = newBalance;

        await pushFirebase(`users/${currentUser.uid}/ai_history`, {
            type: 'text',
            prompt: prompt,
            response: answer,
            cost: AI_CONFIG.TEXT_COST,
            timestamp: Date.now()
        });

        GradusWeb.notify.success(`Сгенерировано! Осталось токенов: ${newBalance}`);
        return answer;
    } catch (e) {
        console.error('Ошибка генерации текста:', e);
        GradusWeb.notify.error('Ошибка генерации текста');
        return null;
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
        GradusWeb.notify.info(`Генерация ${count} изображений...`);

        await loadPuterJS();

        const images = [];
        if (count === 1) {
            const img = await puter.ai.txt2img(prompt);
            images.push(img);
        } else {
            // 4 изображения делаем последовательно (можно параллельно, но осторожно)
            for (let i = 0; i < 4; i++) {
                const img = await puter.ai.txt2img(prompt);
                images.push(img);
            }
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
        console.error('Ошибка генерации изображений:', e);
        GradusWeb.notify.error('Ошибка генерации изображений');
        return null;
    }
}

// ============================================================
// Отображение баланса токенов
// ============================================================
function updateAITokenDisplay() {
    const balance = currentUser ? currentUser.ai_tokens || 0 : 0;
    const elements = document.querySelectorAll('#ai-token-balance, #ai-token-balance-image, #ai-token-balance-profile');
    elements.forEach(el => {
        if (el) el.textContent = balance.toFixed(0);
    });
}

// ============================================================
// История AI-запросов
// ============================================================
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
        html += `<div class="ai-history-item">
            <div><strong>${type}</strong> — <span class="ai-date">${date}</span></div>
            <div style="font-size: 13px; color: #aaa;">Запрос: ${prompt}</div>
            ${response ? `<div style="font-size: 13px; color: #ccc;">Ответ: ${response}</div>` : ''}
            <div style="font-size: 12px; color: #888;">Стоимость: ${entry.cost} токенов</div>
        </div>`;
    });
    container.innerHTML = html || '<p>Нет запросов</p>';
}

// ============================================================
// UI-интеграция
// ============================================================
function setupAIUI() {
    // Обработчики кнопок
    const chatBtn = document.getElementById('ai-chat-btn');
    const imageBtn = document.getElementById('ai-image-btn');
    if (chatBtn) {
        chatBtn.addEventListener('click', function() {
            if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
            openAIChatModal();
        });
    }
    if (imageBtn) {
        imageBtn.addEventListener('click', function() {
            if (!currentUser) { GradusWeb.notify.warning('Войдите в аккаунт'); return; }
            openAIImageModal();
        });
    }

    // Модальные элементы
    const chatModal = document.getElementById('ai-chat-modal');
    const imageModal = document.getElementById('ai-image-modal');

    // Закрытие модалок
    document.querySelectorAll('#ai-chat-modal .modal-close, #ai-image-modal .modal-close').forEach(el => {
        el.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });

    // Закрытие по клику вне
    [chatModal, imageModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === this) this.classList.remove('active');
            });
        }
    });

    // Чат: отправка
    const chatSend = document.getElementById('chat-send-btn');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    if (chatSend && chatInput && chatMessages) {
        async function sendChat() {
            const prompt = chatInput.value.trim();
            if (!prompt) return;
            chatMessages.innerHTML += `<p><strong>Вы:</strong> ${GradusWeb.security.sanitizeHTML(prompt)}</p>`;
            chatInput.value = '';
            chatMessages.scrollTop = chatMessages.scrollHeight;

            const answer = await generateText(prompt);
            if (answer) {
                chatMessages.innerHTML += `<p><strong>${AI_CONFIG.MODEL_NAME_TEXT}:</strong> ${GradusWeb.security.sanitizeHTML(answer)}</p>`;
            } else {
                chatMessages.innerHTML += `<p><strong>${AI_CONFIG.MODEL_NAME_TEXT}:</strong> Не удалось сгенерировать ответ.</p>`;
            }
            chatMessages.scrollTop = chatMessages.scrollHeight;
            updateAITokenDisplay();
            renderAIHistory();
        }
        chatSend.addEventListener('click', sendChat);
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendChat();
        });
    }

    // Изображения: генерация
    const imageGenerate = document.getElementById('image-generate-btn');
    const imagePrompt = document.getElementById('image-prompt-input');
    const imageCount = document.getElementById('image-count-select');
    const imageResult = document.getElementById('image-result');
    if (imageGenerate && imagePrompt && imageCount && imageResult) {
        imageGenerate.addEventListener('click', async function() {
            const prompt = imagePrompt.value.trim();
            if (!prompt) { GradusWeb.notify.warning('Введите описание'); return; }
            const count = parseInt(imageCount.value);
            imageResult.innerHTML = '<p>Генерация...</p>';
            const images = await generateImage(prompt, count);
            if (images) {
                imageResult.innerHTML = '';
                images.forEach(img => {
                    if (img instanceof HTMLImageElement) {
                        imageResult.appendChild(img);
                    } else if (typeof img === 'string') {
                        const imgEl = document.createElement('img');
                        imgEl.src = img;
                        imgEl.style.width = '100%';
                        imgEl.style.borderRadius = '8px';
                        imageResult.appendChild(imgEl);
                    }
                });
            } else {
                imageResult.innerHTML = '<p>Ошибка генерации</p>';
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
        if (chatMessages) chatMessages.innerHTML = '<p style="color: #888;">Напишите что-нибудь...</p>';
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
    setupAIUI();
    // Если пользователь уже залогинен, обновляем токены
    if (currentUser) {
        await refreshAITokens(currentUser);
        updateAITokenDisplay();
        renderAIHistory();
    }
    // Обновляем историю при смене пользователя
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
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initAI, 1500);
});