// Адрес API мини-приложения.
// Продакшн: Cloudflare Worker, проксирующий запросы на локальный Flask (порт 8000)
// через relay.py (запускать: python D:\Work\Бот\miniapp\relay\relay.py).
// Для локальной отладки без туннеля: window.API_BASE = "http://127.0.0.1:8000";
window.API_BASE = "https://fcg-relay.economfac20.workers.dev";
