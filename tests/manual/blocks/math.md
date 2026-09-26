---
title: Math
---

A math root whose single rich `math` carrier holds MathML markup directly
(display="block"). The field is noSplit — Enter inside a formula never splits
the block.

## Checks

- [ ] The quadratic formula renders as real math notation — fraction bar, square root, superscript — centered on its own line.
- [ ] Click into the formula — caret lands; editing a number or identifier updates the rendered math live.
- [ ] Enter inside the formula stays inside — the block never splits in two.
- [ ] Select the block — the breadcrumb reads Document › Math.
- [ ] Undo reverts the last formula edit cleanly.

## Fixture

```html
<math data-pb-block="math" data-pb-rich="math" display="block" class="block py-2 text-center"
  ><mrow
    ><mi>x</mi><mo>=</mo
    ><mfrac
      ><mrow
        ><mo>−</mo><mi>b</mi><mo>±</mo
        ><msqrt
          ><mrow
            ><msup><mi>b</mi><mn>2</mn></msup
            ><mo>−</mo><mn>4</mn><mi>a</mi><mi>c</mi></mrow
          ></msqrt
        ></mrow
      ><mrow><mn>2</mn><mi>a</mi></mrow></mfrac
    ></mrow
  ></math
>
```
