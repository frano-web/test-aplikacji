# PLANER

Statyczna aplikacja klubowa przygotowana do hostowania na **GitHub Pages** z backendem **Supabase**.

## Co działa

- jedno logowanie dla wszystkich ról,
- pierwsze logowanie przez **jednorazowy kod składający się wyłącznie z liter i cyfr**,
- role: Administrator, Trener, Zawodnik, Mechanik, Kierowca,
- zabezpieczenia RLS po stronie Supabase,
- wyjazdy, uczestnicy, status udziału i informacje o rowerze,
- wiele aut na jednym wyjeździe,
- kierowcy, pasażerowie, punkty odbioru i trasa,
- hotel i informacje o zakwaterowaniu,
- kalendarz,
- zadania i checklista,
- aktywowana przez kadrę lista zakupów,
- rowery i zgłoszenia serwisowe,
- komunikaty z potwierdzeniem przeczytania,
- czaty grupowe + Realtime,
- dokumenty w prywatnym Supabase Storage,
- finanse widoczne tylko dla administratora,
- PWA / możliwość dodania do ekranu głównego,
- responsywny interfejs i Tryb Wyjazdu.

## 1. Utwórz projekt Supabase

Utwórz pusty projekt w Supabase.

### Authentication

Na start najprościej wyłączyć wymaganie potwierdzenia e-maila, aby konto aktywowało się od razu po wpisaniu jednorazowego kodu. Jeśli później włączysz potwierdzanie e-maila, zmieni się przepływ pierwszego logowania.

## 2. Wgraj bazę

Otwórz **SQL Editor** w Supabase i uruchom cały plik:

`supabase-schema.sql`

Na samym końcu pliku znajduje się zakomentowane polecenie generujące pierwszy kod administratora. Uruchom je osobno:

```sql
insert into public.invite_codes(code, role)
values (upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)), 'admin')
returning code;
```

Skopiuj zwrócony kod. Jest jednorazowy.

## 3. Ustaw połączenie

W Supabase skopiuj:

- Project URL
- Publishable key

Edytuj `config.js`:

```js
export const SUPABASE_URL = 'https://TWOJ-PROJEKT.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'TWÓJ_PUBLISHABLE_KEY';
```

**Nie umieszczaj `service_role` key w aplikacji ani na GitHubie.**

## 4. Pierwszy administrator

Otwórz stronę PLANER i wybierz **Pierwsze logowanie**.

Podaj:

- imię i nazwisko,
- e-mail,
- hasło,
- wygenerowany kod administratora.

Po utworzeniu konta kod jest oznaczany jako wykorzystany i nie działa drugi raz.

Kolejne kody administrator tworzy już w:

`Administracja → Generuj kod`

Może generować osobne kody dla zawodnika, mechanika, kierowcy, trenera i administratora.

## 5. GitHub Pages

1. Utwórz nowe repozytorium.
2. Wrzuć **zawartość folderu PLANER** do głównego katalogu repozytorium.
3. Wejdź w `Settings → Pages`.
4. Ustaw `Deploy from a branch`.
5. Wybierz branch `main` i katalog `/root`.
6. Zapisz.

Nie ma `npm install` ani procesu buildowania. To celowo zwykła aplikacja HTML/CSS/JS.

## Bezpieczeństwo

Ukrycie przycisku w interfejsie nie jest zabezpieczeniem. Dlatego PLANER używa Row Level Security w Supabase.

Przykłady:

- zawodnik nie może bezpośrednio edytować wyjazdów,
- zawodnik aktualizuje wyłącznie własną odpowiedź na wyjazd przez kontrolowaną funkcję RPC,
- mechanik widzi i zmienia serwis, ale nie finanse,
- kierowca widzi przypisany transport i może odznaczać punkty odbioru,
- finanse są dostępne tylko dla administratora,
- kod dostępu jest sprawdzany przez trigger w bazie podczas tworzenia konta,
- kod nie nadaje roli po stronie JavaScriptu.

## Ważne

`config.js` może zawierać Supabase **Publishable key**, ponieważ bezpieczeństwo zapewniają polityki RLS. Nie należy jednak umieszczać w nim klucza `service_role`, który omija RLS.

## Pliki

- `index.html` — start aplikacji,
- `styles.css` — interfejs i responsywność,
- `app.js` — logika PLANER + Supabase,
- `config.js` — dane projektu Supabase,
- `supabase-schema.sql` — baza, funkcje, role, RLS, Realtime i Storage,
- `manifest.webmanifest` — instalacja jako PWA,
- `sw.js` — cache podstawowych plików,
- `.nojekyll` — poprawne publikowanie na GitHub Pages.
