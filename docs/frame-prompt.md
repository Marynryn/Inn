# Как заказывать рамки у нейросети

Требования не выдуманы: они выведены из того, как рамка живёт на сайте. Аватарка
показывается шестью размерами — 72 px в профиле, 48 в выборе рамки, 32 под
комментарием, 28 в шапке и уведомлениях, 26 в таблице игры и 24 в ответах на
комментарий. Рамка обязана читаться на самом мелком, а не только на крупном.

## Промпт

Генераторы понимают английский заметно лучше. Меняется только первая строка —
всё остальное держит форму.

```
A circular decorative avatar frame: <ЧТО ИМЕННО, см. список ниже>.

Composition: a perfect ring centered on a square canvas, drawn edge to edge.
The middle is completely empty — the ring occupies only the outer band, about
18% of the canvas width on each side, leaving an empty circular hole about 64%
of the canvas width. Radially symmetric, with one larger focal element at the
top and another at the bottom.

Style: flat cel-shaded vector illustration, bold black outlines, few flat
saturated colors, crisp high-contrast shapes, sticker art, game UI badge.
Big readable silhouette: 5 to 8 large elements around the ring, not many small
ones. No fine hatching, no thin strands, no soft airbrush gradients, no
photorealistic rendering.

Background: one solid flat pure magenta #FF00FF, filling everything the ring
does not cover, including the hole in the middle. No checkerboard, no gradient,
no shadow, no texture on the background.

Square image, 1024x1024.
```

Отрицательная часть — там, где она поддерживается:

```
text, letters, watermark, signature, checkerboard pattern, transparency
pattern, white background, gradient background, drop shadow, glow, blurry,
painterly, photorealistic, thin lines, tiny details, portrait or face in the
center, cropped, off-center
```

### Почему фон малиновый, а не прозрачный

Обе первые рамки пришли с **нарисованной шашечкой** вместо прозрачности: серые
квадратики выглядели как пустота, но были обычными пикселями. Сайт показал бы
такую рамку квадратом поверх аватарки, и обе пришлось чистить руками.

Почти ни один генератор прозрачность не отдаёт, зато плоскую заливку отдают все.
Малиновый выбран потому, что его нет ни в одном рисунке таверны, — он снимается
начисто, а шашечка нет. Если твой генератор умеет настоящий прозрачный PNG,
замени абзац Background на `Background: fully transparent PNG, alpha channel,
nothing behind the ring.` — и проверь результат скриптом, он скажет прямо.

## Что подставлять первой строкой

Держись мира таверны — рамка должна выглядеть трофеем оттуда, а не случайной
картинкой:

- a wreath of autumn maple and oak leaves, amber and rust colored
- a ring of antlers and dried herbs tied with leather cord
- a circle of stacked ale tankards with foam spilling between them
- a wreath of iron chains and hanging lantern candles with warm flames
- a ring of bones and skulls wrapped in dark red ribbon
- a circle of green fireflies and glowing moths over dark ivy
- a wreath of crossed swords and shields, worn steel
- a ring of open books and quills with ink splatters
- a circle of frost, icicles and pale blue crystals
- a wreath of mushrooms and twisted roots, deep forest colors

## Правила, которые нельзя нарушать

**Середина пустая.** Там будет чьё-то лицо. Ни портрета, ни узора, ни «рамки с
картинкой внутри» — пустой круг.

**Толстый контур и плоские заливки.** На 24 px от полутонов и мелких штрихов
остаётся каша. Первая костяная рамка была писаная, с тенями, — на мелком она
поплыла; вторая, плоская и контурная, читалась. Проверено на них же.

**Не только тёмное.** Сайт тёмно-коричневый (#1f1813). Рамка из тёмных тонов на
нём растворится: нужны светлые или насыщенные пятна.

**Свисать внутрь можно.** Капли, черепа, кончики листьев, заходящие в дырку, —
это хорошо: кольцо и так наезжает на аватарку на половину своей толщины, и такие
детали ложатся на неё естественно.

## После генерации

```
node scripts/frame-prep.mjs путь-к-картинке.png
```

Скрипт снимет фон — и малиновый, и шашечку, — уберёт крошку от сжатия, подрежет
поля, ужмёт до 512×512 webp и померит дырку. В конце он назовёт посадку: с ней и
загружай.

Проверено на трёх картинках: у рамки с настоящей прозрачностью фон не тронул и
предложил 0.69 против выбранных вручную 0.68; у мушиной предложил 0.62 — ровно
то, что подбиралось глазами; у сжатой с потерями снял 3045 крапин и выдал чистое
кольцо.

Дальше — админка, вкладка «Рамки»: название, файл, посадка ползунком. Галка
**«в раздаче»** означает, что рамка участвует в случайном жребии на ивентах.
Галка **«новичкам»** — что она достаётся при регистрации и сразу надевается;
такая рамка одна на весь сайт.
