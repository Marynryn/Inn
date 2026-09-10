# Как заказывать рамки у нейросети

Требования не выдуманы: они выведены из того, как рамка живёт на сайте. Аватарка
показывается шестью разными размерами — 72 px в профиле, 48 в выборе рамки,
32 под комментарием, 28 в шапке и уведомлениях, 26 в таблице игры и 24 в ответах
на комментарий. Рамка обязана читаться на самом мелком, а не только на крупном.

## Промпт

Генераторы понимают английский заметно лучше. Меняется только первая строка —
всё остальное держит форму.

```
A circular decorative avatar frame: <ЧТО ИМЕННО, см. список ниже>.

Composition: a perfect ring centered on a square canvas. The middle of the
canvas is completely empty — the ring occupies only the outer band, roughly 18%
of the canvas width on each side, leaving an empty circular hole about 64% of
the canvas width. Radially symmetric arrangement, with one larger focal element
at the top and one at the bottom.

Style: flat cel-shaded vector illustration, bold black outlines, few flat
saturated colors, crisp high-contrast shapes, sticker art, game UI badge.
Big readable silhouette: 5 to 8 large elements around the ring, not many small
ones. No fine hatching, no thin strands, no soft airbrush gradients, no
photorealistic rendering.

Background: fully transparent PNG, alpha channel, nothing behind the ring.

Square image, 1024x1024.
```

Отрицательная часть (там, где она поддерживается):

```
text, letters, watermark, signature, checkerboard pattern, white background,
solid background, drop shadow, glow, blurry, painterly, photorealistic,
thin lines, tiny details, portrait or face in the center, cropped, off-center
```

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

**Прозрачность — настоящая.** Обе первые картинки пришли с нарисованной
шашечкой вместо альфы: серые квадратики были просто пикселями. Такую рамку
пришлось чистить вручную. Проверить можно до загрузки — `scripts/frame-prep.mjs`
скажет прямо.

Если генератор альфу не умеет (а большинство не умеет), проси **плоскую заливку
цветом, которого нет в рисунке**: `on a solid pure magenta #FF00FF background`.
Такой фон снимается начисто, а шашечка — нет.

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

Скрипт снимет фон, если он плоский или шашечкой, ужмёт до 512×512 webp, померит
дырку и подскажет посадку. Останется загрузить файл в админке (вкладка «Рамки»)
и поставить эту посадку ползунком, глядя на предпросмотр.
