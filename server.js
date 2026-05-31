/**
 * Gradus Static.JS — Server
 * Простые HTTP-запросы (GET, POST) + Firebase REST.
 */
const GradusServer = {
    async get(url) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return await resp.text();
        } catch (e) {
            console.error('[SERVER] GET error:', e);
            return '';
        }
    },

    async post(url, body = '') {
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: typeof body === 'string' ? body : JSON.stringify(body)
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return await resp.text();
        } catch (e) {
            console.error('[SERVER] POST error:', e);
            return '';
        }
    },

    async firebaseGet(path) {
        // path должен быть полным URL (например, https://... .json)
        return await this.get(path);
    },

    async firebaseSet(path, data) {
        const url = path.endsWith('.json') ? path : path + '.json';
        return await this.post(url, data);
    }
};

window.GradusServer = GradusServer;