// Адрес API мини-приложения.
// Один Worker-релей держит два независимых канала:
//   прод (Flask на сервере, WebApp @economic_games_bot) — базовый адрес без суффикса;
//   dev   (Flask на ноутбуке, WebApp @katekalina_bot)   — тот же адрес + префикс /dev.
// Dev-режим включается параметром ?env=dev в URL WebApp и действует до конца сессии WebView,
// обратно ?env=prod. Каналы разведены и на стороне бэкенда: dev-Flask принимает только
// initData от @katekalina_bot, прод-Flask — только от @economic_games_bot.
(function () {
    const RELAY = "https://fcg-relay.economfac20.workers.dev";
    const DEV_HOST = "fcg-dev.economfac20.workers.dev";

    let dev = location.hostname === DEV_HOST; // dev-сайт всегда ходит в dev-канал
    try {
        const params = new URLSearchParams(location.search);
        if (params.get("env") === "dev") sessionStorage.setItem("fcg_env", "dev");
        if (params.get("env") === "prod") sessionStorage.removeItem("fcg_env");
        dev = dev || params.get("env") === "dev" || sessionStorage.getItem("fcg_env") === "dev";
    } catch (e) {
        // Приватный режим без sessionStorage: решение остаётся по хосту и параметру URL.
    }
    window.API_BASE = dev ? RELAY + "/dev" : RELAY;
})();
