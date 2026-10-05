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
            const error = new Error((data && data.error) || "Ошибка сервера (" + response.status + ")");
            error.status = response.status;
            error.errors = data && data.errors ? data.errors : null;
            throw error;
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
        async download(path, filename) {
            const response = await fetch(baseUrl() + path, { headers: initHeaders() });
            if (!response.ok) throw new Error("Не удалось скачать файл");
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
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

    // Сжатие фото команды: не более 800x800, JPEG
    window.compressImageFile = (file, callback) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                const maxWidth = 800;
                const maxHeight = 800;
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
                        callback(new File([blob], name, { type: "image/jpeg" }));
                    } else {
                        callback(file);
                    }
                }, "image/jpeg", 0.7);
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
