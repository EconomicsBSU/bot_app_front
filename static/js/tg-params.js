// Telegram отдаёт initData только в хэше URL первой страницы мини-аппа; при переходах между
// страницами SDK подхватывает его из sessionStorage, а Android чистит sessionStorage после
// убийения WebView — приложение «сбрасывалось» на страницу согласия, где каждая кнопка ловила 401.
// Храним хэши инициализации в localStorage (он переживает перезагрузку) и возвращаем их в URL,
// если страница открылась без tgWebAppData. Скрипт обязан подключаться ДО telegram-web-app.js.
(function () {
    "use strict";

    const KEY = "fcg_tg_init_hash";
    const current = String(location.hash || "").replace(/^#/, "");

    try {
        if (current.indexOf("tgWebAppData=") !== -1) {
            localStorage.setItem(KEY, current);
            return;
        }
        const saved = localStorage.getItem(KEY);
        if (!saved || saved.indexOf("tgWebAppData=") === -1) return;
        if (history && history.replaceState) {
            history.replaceState(null, "", "#" + saved);
        } else {
            location.hash = saved;
        }
    } catch (e) {
        // Приватный режим без localStorage — остаётся прежнее поведение.
    }
})();
