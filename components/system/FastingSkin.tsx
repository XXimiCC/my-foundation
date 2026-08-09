'use client';

import { useEffect } from 'react';

/**
 * Обесцвечивание интерфейса на время поста.
 *
 * Признак ставится на корень документа, а не на `<main>`: нижняя панель и всё
 * прочее живут вне main, и золото в них оставалось бы гореть. А поставить его
 * серверно в layout нельзя — layout тогда стал бы динамическим, и Канон
 * перестал бы предсобираться, что было отдельно выстраданным решением.
 *
 * Поэтому корень помечают экраны, которые и так знают о посте: главный и сам
 * Пост. Цена — вспышка золота до гидратации; она короче, чем перерисовка
 * фильтром, и не стоит потери предсборки Канона.
 */
export function FastingSkin({ active }: { active: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    if (!active) {
      root.removeAttribute('data-fasting');
      return;
    }
    root.setAttribute('data-fasting', '');
    return () => root.removeAttribute('data-fasting');
  }, [active]);

  return null;
}
