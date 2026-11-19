import Foundation

enum FlightLanguage {
    static let preferenceKey = "flightdeck.language"

    static var current: String {
        resolve(UserDefaults.standard.string(forKey: preferenceKey) ?? "system")
    }

    static func resolve(_ preference: String, locales: [String] = Locale.preferredLanguages) -> String {
        if preference == "ru" || preference == "en" { return preference }
        return locales.lazy.compactMap {
            Locale(identifier: $0).language.languageCode?.identifier
        }.first { $0 == "ru" || $0 == "en" } ?? "en"
    }

    static func text(_ key: String, language: String, args: [String] = []) -> String {
        let template = language == "en" ? english[key] ?? key : key
        return args.isEmpty ? template : String(format: template, arguments: args)
    }

    static func error(_ message: String, language: String) -> String {
        let prefix = "Облако недоступно (HTTP "
        if message.hasPrefix(prefix), message.hasSuffix(").") {
            return text(prefix + "%@).", language: language, args: [String(message.dropFirst(prefix.count).dropLast(2))])
        }
        return text(message, language: language)
    }

    private static let english = [
        "Вход в FlightDeck": "Sign in to FlightDeck",
        "Продолжить без входа · Демо": "Continue without signing in · Demo",
        "Выйти из демо": "Exit demo",
        "Демо": "Demo",
        "Сбросить рейсы и профиль": "Reset flights and profile",
        "Сбросить рейсы и профиль?": "Reset flights and profile?",
        "Все рейсы и имя профиля будут удалены из облака. Аэропорты сохранятся.": "All flights and your profile name will be deleted from the cloud. Airports will be kept.",
        "Удалить все рейсы": "Delete all flights",
        "Журнал изменился. Подтверди сброс снова.": "The logbook changed. Confirm the reset again.",
        "Один аккаунт открывает общий журнал на компьютере и iPhone.": "Use the same account to access your logbook on your computer and iPhone.",
        "Запуск FlightDeck": "Starting FlightDeck",
        "Оформление": "Appearance",
        "Светлая": "Light",
        "Темная": "Dark",
        "Имя в профиле": "Profile name",
        "Не удалось открыть окно входа Google. Попробуй еще раз.": "Could not open Google sign-in. Try again.",
        "Добавь первый рейс": "Add your first flight",
        "Укажи маршрут и время вылета. FlightDeck предложит длительность по журналу и реальным рейсам.": "Enter a route and departure time. FlightDeck suggests a duration from your logbook and real flights.",
        "Актуальный рейс под рукой": "Your current flight",
        "На главной появляется текущий или ближайший рейс. Открой его данные, чтобы отмечать этапы полета.": "Home shows your current or upcoming flight. Open its details to log flight stages.",
        "Весь журнал полетов": "Your flight logbook",
        "Здесь можно найти рейс, проверить время прилета и открыть его для редактирования.": "Find a flight, check its arrival time and open it to make changes.",
        "Подключи облако": "Connect your account",
        "Войди через Google или по почте. Один аккаунт открывает общий журнал на компьютере и iPhone.": "Sign in with Google or email to access your logbook on your computer and iPhone.",
        "Настрой FlightDeck под себя": "Make FlightDeck yours",
        "Выбери язык и тему. В настройках можно повторить обучение и написать обратную связь.": "Choose your language and theme. Settings also lets you replay this guide and send feedback.",
        "Здесь виден актуальный рейс, время и статус. Потяни экран вниз, чтобы обновить журнал.": "See your current flight, times and status here. Pull down to refresh the logbook.",
        "В профиле можно выбрать язык, повторить обучение и написать обратную связь.": "In Profile, choose a language, replay this guide or send feedback.",
        "Пропустить": "Skip",
        "Готово": "Done",
        "Далее": "Next",
        "Назад": "Back",
        "Обратная связь": "Feedback",
        "Повторить обучение": "Replay introduction",
        "Тема": "Subject",
        "Сообщение": "Message",
        "Откроется черновик письма. Отправь его из почты, чтобы сообщение дошло.": "A draft will open in your mail app. Send the email to deliver your feedback.",
        "Получатель": "To",
        "Открыть письмо": "Open email",
        "Написать через Gmail": "Write in Gmail",
        "Напиши сообщение.": "Enter a message.",
        "Открой ссылку Gmail в форме обратной связи.": "Use the Gmail link in the feedback form.",
        "Письмо отправлено.": "Email sent.",
        "Черновик сохранен.": "Draft saved.",
        "Не удалось отправить письмо. Попробуй Gmail.": "Could not send the email. Try Gmail.",
        "Продолжить с Google": "Continue with Google",
        "Примерное время": "Estimated duration",
        "English": "English",
        "Аккаунт FlightDeck": "FlightDeck account",
        "Без номера": "No flight number",
        "Ближайший рейс": "Upcoming flight",
        "В облачном журнале нет рейсов для отображения.": "There are no flights in the cloud logbook.",
        "Войди под тем же аккаунтом, что и в FlightDeck на компьютере.": "Sign in with the same account you use in FlightDeck on your computer.",
        "Войти": "Sign in",
        "Выйти": "Sign out",
        "Вылет": "Departure",
        "Вылет: %@": "Departure: %@",
        "Вылетел": "Departed",
        "Выполнен": "Completed",
        "Загружаем журнал…": "Loading logbook…",
        "Задержан": "Delayed",
        "Задержка на %@ мин": "%@ min late",
        "Запасной · %@": "Alternate · %@",
        "Запасной аэропорт · %@": "Alternate airport · %@",
        "Запланирован": "Scheduled",
        "Идет посадка": "Boarding",
        "Как в системе": "System language",
        "Настройки": "Settings",
        "Не удалось запустить Live Activity. Попробуй еще раз.": "Couldn't start Live Activity. Try again.",
        "Не удалось подключиться к облаку. Потяни экран вниз, чтобы повторить.": "Couldn't connect to the cloud. Pull down to try again.",
        "Не удалось прочитать облачный журнал.": "Couldn't read the cloud logbook.",
        "Не удалось сохранить сеанс в защищенном хранилище.": "Couldn't save the session securely.",
        "Облако недоступно (HTTP %@).": "Cloud unavailable (HTTP %@).",
        "Облачный журнал": "Cloud logbook",
        "Обновить журнал": "Refresh logbook",
        "Обновлено в %@ UTC": "Updated at %@ UTC",
        "Остановить слежение": "Stop tracking",
        "Открой FlightDeck для обновления": "Open FlightDeck to refresh",
        "Открыть профиль": "Open profile",
        "Отменен": "Canceled",
        "Отображение": "Display",
        "Пароль": "Password",
        "План  %@   ·   Факт  %@": "Scheduled  %@   ·   Actual  %@",
        "План · %@ UTC": "Scheduled · %@ UTC",
        "Подготовка": "Preparing",
        "Показывать деморейсы": "Show demo flights",
        "Посадка завершена": "Boarding complete",
        "Последний рейс": "Latest flight",
        "Прилет": "Arrival",
        "Прилет: %@": "Arrival: %@",
        "Проверь email и пароль.": "Check your email and password.",
        "Почта не подтверждена. Подтверди адрес и попробуй снова.": "Confirm your email address and try again.",
        "Слишком много попыток входа. Попробуй позже.": "Too many sign-in attempts. Try again later.",
        "Профиль": "Profile",
        "Разреши Live Activity для FlightDeck в настройках iPhone.": "Allow Live Activities for FlightDeck in iPhone Settings.",
        "Раньше на %@ мин": "%@ min early",
        "Рейс": "Flight",
        "Рейс в работе": "Active flight",
        "Рейс по расписанию": "Scheduled flight",
        "Рейсов пока нет": "No flights yet",
        "Русский": "Русский",
        "Сеанс закончился. Войди снова.": "Your session expired. Sign in again.",
        "Синхронизируй журнал в FlightDeck на компьютере.": "Sync the logbook in FlightDeck on your computer.",
        "Следить за рейсом": "Track flight",
        "Уход на запасной": "Diverted",
        "Язык": "Language",
    ]
}
