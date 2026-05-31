const siteConfig = {
    debug: true,
    dbFile: '/db.json'   // можно удалить, если не нужен
};

async function initSite() {
    // Защита от F12: при обнаружении удаляем секреты и кэш
    GradusWeb.security.enableDevToolsProtection(() => {
        alert('Обнаружены инструменты разработчика! Секретные данные будут удалены.');
        GradusWeb.secretStorage.remove('api_key');
        GradusWeb.cache.clear();
    });

    // Инициализируем тестовый API‑ключ в SecretStorage (только если его ещё нет)
    const existing = await GradusWeb.secretStorage.get('api_key');
    if (!existing) {
        await GradusWeb.secretStorage.set('api_key', 'sk_live_1234567890secret');
        if (siteConfig.debug) console.log('[SITE] API‑ключ сохранён в SecretStorage');
    }

    // Начальные данные в кэше
    GradusWeb.cache.set('username', 'Гость', 86400);      // хранить сутки
    GradusWeb.cache.set('greeting', 'Привет, Мир!');
    // Индекс заметок будем хранить в кэше, но не инициализируем здесь — он появится при первом добавлении
}

window.addEventListener('load', () => GradusStatic.init(siteConfig));