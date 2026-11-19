# Выпуск FlightDeck для macOS и Windows

## Версии

Публичные выпуски имеют формат `vMAJOR.MINOR.0`. Третья цифра используется для внутренних сборок, которые не публикуются в GitHub Releases. Укажите один номер версии в `FlightDesk/Info.plist` и `FlightDeck-Windows/package.json`. Увеличьте `CFBundleVersion` в macOS. Этот номер определяет порядок автообновления и версию пакета Installer.

## Сборка на macOS

Из корня проекта выполните:

```sh
python3 FlightDesk/build-web.py
UNIVERSAL_BUILD=1 bash FlightDesk/build-mac.sh
bash FlightDesk/build-installer.sh
```

Пакет появится в `releases/`. Для Windows используйте [инструкцию сборки Windows](FlightDeck-Windows/README.md).

## Публикация

1. Добавьте раздел новой версии в [историю выпусков](CHANGELOG.md) и отправьте изменения в `main`.
2. Откройте [Release FlightDeck](https://github.com/valerii-palch/FlightDeck/actions/workflows/release.yml) и запустите **Run workflow** с новым тегом.
3. Проверьте результаты сборки, подписи манифеста, контрольных сумм и тестовой установки Windows. Убедитесь, что новый выпуск отмечен как `latest`.
4. Проверьте обновление с предыдущего публичного выпуска на реальном оборудовании.

Workflow получает ключ подписи манифеста через секрет GitHub Actions `FLIGHTDECK_UPDATE_PRIVATE_KEY`. Закрытый ключ хранится вне репозитория, а открытый ключ встраивается в приложение. На macOS приложение проверяет подпись манифеста и SHA-256 пакета перед запуском системного установщика. На Windows `electron-updater` проверяет установщик по данным `latest.yml`.

Кнопка **Обновить приложение** находится в профиле. При переходе со старой серии 0.22–0.24 на 0.1.0 пользователям Windows нужно запустить новый установщик вручную. Версии iOS распространяются отдельно через TestFlight или App Store.

Настройка входа Google, облачного журнала и статистики реальных рейсов описана в [руководстве по облачным функциям](SETUP-0.19.md).
