# Logo dashboardu

Plik `logo.png` w tym folderze to logo wyświetlane w dashboardzie
(Sidebar, TopBar mobilny, strona logowania, `/unauthorized`, podania `/apply`
oraz favicon przeglądarki).

## Jak podmienić na własne logo

1. Przygotuj kwadratowy obrazek (najlepiej **512×512 PNG**).
   - Dobrze wygląda na granatowym tle (`#101320`) albo z przezroczystością.
2. Nadpisz ten plik zachowując nazwę: `dashboard/public/logo.png`.
3. Zrestartuj dashboard (`npm run dev` / redeploy) i wyczyść cache przeglądarki
   (favicon lubi się cachować — `Ctrl+Shift+R`).

## Zachowanie awaryjne

Komponent `components/AppLogo.tsx` automatycznie pokazuje złoty monogram "UC",
gdy plik nie istnieje albo nie ładuje się — layout nigdy nie zostaje z pustym
miejscem po logo.
