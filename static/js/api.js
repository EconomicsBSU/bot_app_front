// Общий слой для работы с API: авторизация через initData, запросы, валидация.

(function () {
    "use strict";

    function tgApp() {
        return window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    }

    if (tgApp()) {
        tgApp().ready();
        tgApp().expand();
    }

    // Бэкенд отвечает на проблемы с initData как {"error":"unauthorized","reason":"..."} —
    // служебные коды участнику ничего не говорят, а «кнопка не работает» выглядит поломкой
    // регистрации. Подсказываем, что сделать, тем более что данные заявки при этом не теряются.
    const AUTH_HINTS = {
        no_init_data:
            "Приложение открылось без данных Telegram. Закройте его полностью и запустите заново " +
            "кнопкой «Открыть мини-приложение» в чате с @economic_games_bot — данные команды сохранены.",
        expired:
            "Сессия Telegram устарела (прошли сутки). Закройте приложение и откройте его заново " +
            "из чата с @economic_games_bot.",
        no_bot_token: "Сервер не настроен: обратитесь к организаторам.",
        bad_signature: "Не удалось проверить данные Telegram. Откройте приложение заново из чата с @economic_games_bot.",
        no_hash: "Не удалось проверить данные Telegram. Откройте приложение заново из чата с @economic_games_bot.",
    };

    function apiError(data, status) {
        const reason = data && data.reason;
        const message = (reason && AUTH_HINTS[reason]) || (data && data.error) || "Ошибка сервера (" + status + ")";
        const error = new Error(message);
        error.status = status;
        error.errors = data && data.errors ? data.errors : null;
        return error;
    }

    function baseUrl() {
        return window.API_BASE || "";
    }

    function initHeaders(extra) {
        const headers = Object.assign({}, extra || {});
        const app = tgApp();
        if (app && app.initData) {
            headers["X-Telegram-Init-Data"] = app.initData;
        }
        // Для локальной отладки вне Telegram: ?dev=<id пользователя>.
        // Сохраняем в sessionStorage, чтобы параметр не терялся при переходах между страницами.
        const devId = new URLSearchParams(window.location.search).get("dev");
        if (devId) {
            try {
                sessionStorage.setItem("dev_user_id", devId);
            } catch (e) { /* приватный режим */ }
        } else {
            try {
                const stored = sessionStorage.getItem("dev_user_id");
                if (stored) headers["X-Dev-User-Id"] = stored;
            } catch (e) { /* приватный режим */ }
        }
        if (devId) {
            headers["X-Dev-User-Id"] = devId;
        }
        return headers;
    }

    async function apiFetch(path, options) {
        const response = await fetch(baseUrl() + path, options);
        let data = null;
        try {
            data = await response.json();
        } catch (e) {
            data = null;
        }
        if (!response.ok || !data || data.ok === false) {
            throw apiError(data, response.status);
        }
        return data;
    }

    window.API = {
        get(path) {
            return apiFetch(path, { headers: initHeaders() });
        },
        post(path, body) {
            return apiFetch(path, {
                method: "POST",
                headers: initHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(body || {}),
            });
        },
        upload(path, formData) {
            return apiFetch(path, { method: "POST", headers: initHeaders(), body: formData });
        },
        del(path) {
            return apiFetch(path, { method: "DELETE", headers: initHeaders() });
        },
        async photoUrl(path) {
            const response = await fetch(baseUrl() + path, { headers: initHeaders() });
            if (!response.ok) return null;
            return URL.createObjectURL(await response.blob());
        },
        // Файл с сервера (PDF памятки) как Blob: ссылка получается вида blob:, адрес документа не светится.
        async blob(path) {
            const response = await fetch(baseUrl() + path, { headers: initHeaders() });
            if (!response.ok) {
                let message = "Не удалось загрузить файл (" + response.status + ")";
                try {
                    const data = await response.json();
                    if (data && data.error) message = data.error;
                } catch (e) { /* не JSON */ }
                const error = new Error(message);
                error.status = response.status;
                throw error;
            }
            return response.blob();
        },
        // Файл отдаётся подписанной ссылкой. Сохранить её внутри WebView Telegram нельзя:
        // Telegram Desktop получает ответ 200 и молча выбрасывает загрузку (видно по логу
        // бэкенда), поэтому из мини-приложения ссылка уходит в системный браузер через openLink.
        async download(kind) {
            const data = await apiFetch(
                "/api/admin/download-link?kind=" + encodeURIComponent(kind),
                { headers: initHeaders() }
            );
            const url = baseUrl() + data.path;
            const app = tgApp();
            if (app && typeof app.openLink === "function") {
                try {
                    app.openLink(url);
                    return;
                } catch (e) { /* старый клиент: пробуем обычной ссылкой */ }
            }
            const link = document.createElement("a");
            link.href = url;
            document.body.appendChild(link);
            link.click();
            link.remove();
        },
    };

    // ---------- Валидация (те же правила, что на сервере) ----------

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PHONE_RE = /^\+?\d{7,15}$/;
    // Пробелы, скобки и дефисы не считаются: валидируем только цифры, как на сервере.
    const normalizePhone = (v) => v.trim().replace(/[\s\-().]/g, "");

    window.Validators = {
        notEmpty: (v) => (v.trim().length === 0 ? "Поле обязательно к заполнению" : ""),
        city: (v) => {
            v = v.trim();
            if (!v.length) return "Поле обязательно к заполнению";
            if (v.length > 60) return "Слишком длинное название города";
            if (!/\p{L}/u.test(v)) return "Введите название города, а не только цифры";
            return "";
        },
        email: (v) => {
            v = v.trim();
            if (!v.length) return "Поле обязательно к заполнению";
            return EMAIL_RE.test(v) ? "" : "Введите корректный e-mail";
        },
        phone: (v) => {
            v = normalizePhone(v);
            if (!v.length) return "Поле обязательно к заполнению";
            return PHONE_RE.test(v) ? "" : "Введите номер телефона: 7-15 цифр, при необходимости с кодом страны (+995...)";
        },
        grade: (v) => {
            v = v.trim();
            if (!v.length) return "Поле обязательно к заполнению";
            const number = parseInt(v, 10);
            if (isNaN(number) || number < 1 || number > 11) return "Класс может быть от 1 до 11";
            return "";
        },
    };

    window.setFieldError = (field, message) => {
        const el = document.getElementById(field + "Error");
        if (el) el.textContent = message || "";
    };

    window.clearErrors = () => {
        document.querySelectorAll(".error-message").forEach((el) => (el.textContent = ""));
    };

    // fields: [{ id, fns: [валидаторы] }]
    window.validateFields = (fields) => {
        clearErrors();
        let valid = true;
        for (const field of fields) {
            const input = document.getElementById(field.id);
            if (!input) continue;
            for (const fn of field.fns) {
                const message = fn(input.value || "");
                if (message) {
                    setFieldError(field.id, message);
                    valid = false;
                    break;
                }
            }
        }
        return valid;
    };

    window.handleApiError = (error) => {
        if (error.errors) {
            let hasDom = false;
            Object.keys(error.errors).forEach((field) => {
                const el = document.getElementById(field + "Error");
                if (el) {
                    el.textContent = error.errors[field];
                    hasDom = true;
                }
            });
            if (hasDom) return;
        }
        alert(error.message || "Произошла ошибка");
    };

    window.escHtml = (value) =>
        String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    // Фото команды отдаём в максимальном качестве, которое принимает сервер (5 МБ в api.py):
    // файл до PHOTO_MAX_BYTES уходит оригинальным байтом — с исходным разрешением и без
    // второго JPEG-перекодирования, которое и съедало качество. Больше лимита — снижаем
    // размер/качество по лестнице, пока не влезет.
    const PHOTO_MAX_BYTES = 4.5 * 1024 * 1024;
    const PHOTO_SERVER_FORMATS = ["png", "jpg", "jpeg", "gif"];
    // [длинная сторона, качество JPEG] — от максимального к приемлемому.
    const PHOTO_RESCALE_STEPS = [[2600, 0.95], [2200, 0.92], [1800, 0.9], [1400, 0.85]];

    function scaledCanvas(img, maxSide) {
        const longSide = Math.max(img.width, img.height);
        const ratio = longSide > maxSide ? maxSide / longSide : 1;
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        return canvas;
    }

    function encodeCanvas(canvas, type, quality) {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), type, quality);
        });
    }

    function photoFile(blob, originalName, type) {
        const base = originalName.replace(/\.[^.]+$/, "");
        const name = (base || "photo") + (type === "image/png" ? ".png" : ".jpg");
        return new File([blob], name, { type: type });
    }

    window.compressImageFile = (file, callback) => {
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (file.size <= PHOTO_MAX_BYTES && PHOTO_SERVER_FORMATS.includes(ext)) {
            callback(file);
            return;
        }
        const reader = new FileReader();
        // Не удалось прочитать (например, HEIC, который WebView не декодирует) —
        // отдаём как есть: сервер сам объяснит причину отказа.
        reader.onerror = () => callback(file);
        reader.onload = (event) => {
            const img = new Image();
            img.onerror = () => callback(file);
            img.onload = async () => {
                // PNG жмём в PNG — через JPEG прозрачность становится чёрной.
                const types = ext === "png" ? ["image/png", "image/jpeg"] : ["image/jpeg"];
                for (const type of types) {
                    for (const step of PHOTO_RESCALE_STEPS) {
                        const blob = await encodeCanvas(scaledCanvas(img, step[0]), type, step[1]);
                        if (blob && blob.size <= PHOTO_MAX_BYTES) {
                            callback(photoFile(blob, file.name, type));
                            return;
                        }
                    }
                }
                callback(file);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    function formJson(form) {
        const data = {};
        new FormData(form).forEach((value, key) => {
            data[key] = value;
        });
        return data;
    }

    // Присоединившийся по ID команды участник видит заявку, но не редактирует её.
    window.requireEditable = (data) => {
        if (data.can_edit === false) {
            window.location.replace("team_info.html");
            return false;
        }
        return true;
    };

    // Стандартная страница шага регистрации: подгрузка данных + отправка формы.
    window.bindRegForm = (options) => {
        const form = document.getElementById(options.formId);
        const submitButton = form.querySelector('button[type="submit"]');

        API.get("/api/reg/data")
            .then((data) => {
                if (!requireEditable(data)) return;
                if (options.fill) options.fill(data.team || {});
            })
            .catch((error) => {
                if (error.status === 409) {
                    // Регистрация не начата — возвращаем на страницу согласия
                    window.location.replace("privacy_policy.html");
                    return;
                }
                alert("Не удалось загрузить данные: " + error.message);
            });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (options.fields && !validateFields(options.fields)) return;
            submitButton.disabled = true;
            try {
                await API.post(options.endpoint, options.build ? options.build() : formJson(form));
                window.location.href = options.next;
            } catch (error) {
                submitButton.disabled = false;
                handleApiError(error);
            }
        });
    };
})();
