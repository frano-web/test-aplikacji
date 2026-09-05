# PLANER

Aplikacja klubowa do hostowania na **GitHub Pages** z backendem **Supabase**.

## Najważniejsze funkcje

- jedno logowanie dla wszystkich ról,
- role: Administrator, Trener, Zawodnik, Mechanik, Kierowca,
- kod Zawodnika: **wielokrotnego użytku przez 24 godziny**,
- kody Mechanika, Kierowcy, Trenera i Administratora: **jednorazowe**,
- Row Level Security po stronie Supabase,
- zawodnik widzi wyłącznie wyjazdy, do których został przypisany,
- wiele aut na jednym wyjeździe i możliwość dodania kilku aut jednocześnie,
- osobny kierowca i godzina startu dla każdego auta,
- punkty odbioru i miejsca wsiadania,
- hotel i pokoje,
- miesięczny widok kalendarza,
- lista zakupów, zadania i checklista,
- rowery oraz zgłoszenia serwisowe,
- mechanik ma również pełny podgląd transportu i może zostać przypisany jako kierowca,
- komunikaty z trwałym statusem „odczytano”,
- czat prywatny i grupowy z Realtime,
- czerwone liczniki nieprzeczytanych wiadomości,
- powiadomienia przeglądarkowe o nowych wiadomościach po wyrażeniu zgody,
- dokumenty ukryte dla roli Zawodnik,
- finanse tylko dla Administratora,
- PWA / instalacja na ekranie głównym.

## Jeśli baza PLANER była już wcześniej wgrana

Nie uruchamiaj ponownie starego schematu. W Supabase przejdź do **SQL Editor → New query**, wklej cały plik:

`supabase-update-v2.sql`

i kliknij **Run**.

Ten plik aktualizuje istniejącą bazę bez kasowania użytkowników, wyjazdów i pozostałych danych.

## Jeśli tworzysz nową bazę od zera

W **SQL Editor** uruchom cały plik:

`supabase-schema.sql`

Na końcu wygeneruj pierwszy kod Administratora:

```sql
insert into public.invite_codes(code, role, max_uses)
values (upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)), 'admin', 1)
returning code;
```

## Authentication

W Supabase wejdź w **Authentication → Sign In / Providers → Email** i wyłącz **Confirm Email**, jeśli konto ma być aktywne od razu po wpisaniu kodu dostępu.

## Połączenie z Supabase

`config.js` zawiera Project URL i Publishable key. **Nigdy nie dodawaj do frontendu `service_role` ani Secret key.**

## GitHub Pages

1. Wrzuć zawartość folderu PLANER do głównego katalogu repozytorium.
2. `Settings → Pages`.
3. `Deploy from a branch`.
4. Branch `main`, katalog `/root`.
5. Zapisz.

Nie ma `npm install` ani builda. Projekt to HTML/CSS/JS korzystający z `supabase-js` przez moduł ESM.

## Powiadomienia czatu

W zakładce **Czat** kliknij **Włącz powiadomienia** i zaakceptuj zgodę przeglądarki. Czerwony licznik działa niezależnie od tej zgody. Powiadomienia przeglądarkowe działają, gdy aplikacja jest uruchomiona lub pozostaje otwarta w tle; pełny push do całkowicie zamkniętej aplikacji wymagałby osobnej usługi Web Push.

## Pliki

- `index.html` — start aplikacji,
- `styles.css` — interfejs,
- `app.js` — logika aplikacji,
- `config.js` — konfiguracja Supabase,
- `supabase-schema.sql` — pełny schemat dla nowej bazy,
- `supabase-update-v2.sql` — aktualizacja istniejącej bazy,
- `manifest.webmanifest` — PWA,
- `sw.js` — cache i obsługa kliknięcia powiadomienia,
- `.nojekyll` — GitHub Pages.


## v2.1 — poprawka uruchamiania

- klient Supabase zaktualizowany do 2.115.0,
- start aplikacji ma timeout i nie wisi bez końca na ekranie Uruchamianie,
- dodano automatyczną stronę naprawy cache PWA/GitHub Pages,
- cache aplikacji ma wersję planer-v21.

## PLANER v2.2 — poprawka uruchamiania
Frontend nie używa już importu ESM `+esm`. Supabase JS jest ładowany jako klasyczny skrypt UMD z jsDelivr, z automatycznym fallbackiem do unpkg. Dodano `diagnostyka.html`, która sprawdza config, bibliotekę i odpowiedź Supabase Auth. `supabase-update-v2.sql` nadal jest aktualizacją dla istniejącej bazy.


## Aktualizacja v2.3 — telefon

- czytelniejszy układ mobilny i większe elementy dotykowe,
- stały przycisk **Wyloguj** u góry ekranu telefonu,
- dolny pasek ograniczony do Start / Wyjazdy / Kalendarz / Czat / Więcej,
- pełne menu mobilne po kliknięciu **Więcej** lub ikony ☰,
- druga opcja wylogowania w pełnym menu,
- lepszy układ czatu, kart, tabel/wierszy i formularzy na małych ekranach,
- nowy cache PWA `planer-v23`.

Ta aktualizacja nie wymaga zmian SQL.
