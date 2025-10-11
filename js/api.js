// Конфигурация API
const API_CONFIG = {
    baseUrl: 'https://your-domain.com/api', // ЗАМЕНИТЕ НА ВАШ ДОМЕН
    timeout: 30000 // 30 секунд
};

// Получение токена сессии от Telegram WebApp
function getTelegramSessionToken() {
    if (window.Telegram && window.Telegram.WebApp) {
        return window.Telegram.WebApp.initData;
    }
    return null;
}

// Универсальная функция для выполнения HTTP запросов
async function apiRequest(endpoint, options = {}) {
    const url = `${API_CONFIG.baseUrl}${endpoint}`;
    
    // Подготовка заголовков
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    // Добавление токена Telegram если доступен
    const telegramToken = getTelegramSessionToken();
    if (telegramToken) {
        headers['X-Telegram-Init-Data'] = telegramToken;
    }

    // Конфигурация запроса
    const config = {
        method: options.method || 'GET',
        headers,
        ...options
    };

    // Добавление тела запроса для POST/PUT
    if (options.data && (config.method === 'POST' || config.method === 'PUT')) {
        config.body = JSON.stringify(options.data);
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
        
        config.signal = controller.signal;

        const response = await fetch(url, config);
        clearTimeout(timeoutId);

        // Проверка статуса ответа
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP Error: ${response.status}`);
        }

        // Возврат JSON данных
        return await response.json();
        
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Превышено время ожидания запроса');
        }
        
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// GET запрос
async function apiGet(endpoint) {
    return apiRequest(endpoint, { method: 'GET' });
}

// POST запрос
async function apiPost(endpoint, data) {
    return apiRequest(endpoint, { 
        method: 'POST', 
        data 
    });
}

// PUT запрос
async function apiPut(endpoint, data) {
    return apiRequest(endpoint, { 
        method: 'PUT', 
        data 
    });
}

// DELETE запрос
async function apiDelete(endpoint) {
    return apiRequest(endpoint, { method: 'DELETE' });
}

// Загрузка файлов
async function apiUploadFile(endpoint, file, additionalData = {}) {
    const formData = new FormData();
    formData.append('file', file);
    
    // Добавление дополнительных данных
    Object.keys(additionalData).forEach(key => {
        formData.append(key, additionalData[key]);
    });

    const url = `${API_CONFIG.baseUrl}${endpoint}`;
    
    const headers = {};
    const telegramToken = getTelegramSessionToken();
    if (telegramToken) {
        headers['X-Telegram-Init-Data'] = telegramToken;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`File Upload Error (${endpoint}):`, error);
        throw error;
    }
}

// Функция для получения пользователя (создание сессии)
async function initializeUser() {
    try {
        return await apiPost('/create_user', {});
    } catch (error) {
        console.error('Ошибка инициализации пользователя:', error);
        throw error;
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация Telegram Web App
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        
        // Настройка кнопок Telegram
        window.Telegram.WebApp.MainButton.hide();
        window.Telegram.WebApp.BackButton.show();
        
        // Обработчик кнопки "Назад"
        window.Telegram.WebApp.BackButton.onClick(() => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = './index.html';
            }
        });
    }

    console.log('API клиент инициализирован');
    console.log('Base URL:', API_CONFIG.baseUrl);
});