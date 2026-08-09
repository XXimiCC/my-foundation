'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { FastingSkin } from '@/components/system/FastingSkin';
import { VersionBadge } from '@/components/system/VersionBadge';
import { Triquetra } from '@/components/triquetra/Triquetra';
import type { RitualCounts } from '@/lib/core/rituals';
import { SHELL_LABEL, SHELLS, type Shell } from '@/lib/core/shells';
import type { CoreState } from '@/lib/core/state';
import { RITUAL_SECTIONS } from '@/lib/sections';

/**
 * Боевой экран: Триквестр на настоящих уровнях и два Завета, которые
 * закрываются одним касанием — АКТ и БЛАГ.
 *
 * Нормы взяты из Завета АКТ буквально: тело через день, разум каждый день,
 * дух весь день. Поэтому у оболочки показано не «сколько сделано вообще», а
 * закрыт ли сегодняшний долг.
 */

const BLESSINGS: { kind: string; title: string; phrase: string }[] = [
  {
    kind: 'SLEEP',
    title: 'Сон',
    phrase: 'Благодарю Тебя, Сон, за восстановление моей энергии и регенерацию. Сила с Нами',
  },
  {
    kind: 'WATER',
    title: 'Вода',
    phrase: 'Благодарю Тебя, Вода, за свежесть, очищение и питание моего тела. Сила с Нами!',
  },
  {
    kind: 'FOOD',
    title: 'Еда',
    phrase: 'Благодарю Тебя, Еда, за энергию, строительный материал и удовольствие. Сила с Нами!',
  },
  {
    kind: 'WARMTH',
    title: 'Тепло',
    phrase:
      'Благодарю тебя, Тепло, за комфорт, энергию и помощь в восстановлении моего тела. Сила с Нами',
  },
  { kind: 'BODY', title: 'Тело', phrase: 'Благодарю тебя, Тело, за службу. Сила с Нами' },
];

const ACT_HINT: Record<Shell, string> = {
  BODY: 'через день, от 30 минут',
  MIND: 'каждый день, от 10 минут',
  SPIRIT: 'весь день: одно благое дело',
};

/**
 * Состояние Завета одной строкой. Ни одного числа сверх того, что отвечает на
 * вопрос «сделано ли сегодня»: главный экран не заменяет собой ритуал.
 */
function ritualStatus(key: string, counts: RitualCounts): string {
  switch (key) {
    case 'put':
      return counts.put.exists
        ? `${counts.put.done} из ${counts.put.total}`
        : 'Декларации нет';
    case 'duh':
      return counts.duh.practiced ? `${counts.duh.minutes} мин` : 'сегодня не было';
    case 'dar':
      return counts.dar.week > 0 ? `на неделе ${counts.dar.week}` : 'норма не закрыта';
    case 'post':
      return counts.post.active
        ? `день ${counts.post.day} из ${counts.post.total}`
        : 'не идёт';
    default:
      return '';
  }
}

export function Today({
  initial,
  rituals,
  name,
}: {
  initial: CoreState;
  rituals: RitualCounts;
  name: string | null;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [spoken, setSpoken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (url: string, body: object, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'не записалось');
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не записалось');
    } finally {
      setBusy(null);
    }
  }, []);

  const blessToday = new Set(state.today.blessings);

  return (
    <main className="mx-auto flex h-full max-w-md flex-col gap-4 overflow-y-auto px-5 py-4">
      {/* Пока идёт пост, интерфейс обесцвечен: приложение снижает собственную
          сенсорную награду наравне с прочими быстрыми удовольствиями. */}
      <FastingSkin active={rituals.post.active} />
      <header className="text-center">
        <h1
          className="text-xl tracking-[0.4em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ОСНОВАНИЕ
        </h1>
        {name && <p className="mt-1 text-[0.68rem] tracking-[0.16em] text-mute">{name}</p>}
      </header>

      <Triquetra
        levels={state.levels}
        sila={state.sila}
        fasting={rituals.post.active}
        highlight={state.weakest}
        readouts={{
          left: { label: 'СИЛА', value: state.sila.toFixed(0), tone: 'gold' },
          right: { label: 'БОЛЬ', value: state.bol.toFixed(0), tone: 'frost' },
          bottom: {
            label: 'СЛАБОЕ ЗВЕНО',
            value: SHELL_LABEL[state.weakest],
            tone: 'gold',
          },
        }}
        className="mx-auto aspect-square w-full max-w-[19rem] shrink-0"
      />

      {state.passivityDays > 0 && (
        <p className="text-center text-sm text-frost">
          Без актов {state.passivityDays} {plural(state.passivityDays)}. Боль растёт сама.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ЗАВЕТ АКТ</h2>
        {SHELLS.map((shell) => {
          const done = state.today.acts[shell];
          return (
            <div
              key={shell}
              className="flex items-center gap-3 border-b border-warm-line py-2"
            >
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={state.weakest === shell ? 'text-gold-200' : 'text-bone'}
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {SHELL_LABEL[shell]}
                  </span>
                  <span className="text-[0.62rem] tabular-nums text-gold-600">
                    {state.levels[shell].toFixed(0)}
                  </span>
                </div>
                <div className="text-[0.68rem] text-mute">
                  {done > 0 ? `сегодня ${done}` : ACT_HINT[shell]}
                </div>
              </div>
              <button
                onClick={() => send('/api/akt', { shell }, `akt-${shell}`)}
                disabled={busy !== null}
                className="shrink-0 rounded border border-gold-600/60 px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-gold-200 transition-colors hover:bg-gold-600/15 disabled:opacity-40"
              >
                {busy === `akt-${shell}` ? '…' : 'АКТ'}
              </button>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ЗАВЕТ БЛАГ</h2>
          <span className="text-[0.62rem] tabular-nums text-mute">
            {blessToday.size} из 5 · касаний {state.today.blessingTaps}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {BLESSINGS.map((b) => (
            <button
              key={b.kind}
              onClick={() => {
                setSpoken(b.phrase);
                void send('/api/blago', { blessing: b.kind }, `blago-${b.kind}`);
              }}
              disabled={busy !== null}
              className={`rounded-sm border px-1 py-2.5 text-[0.62rem] transition-colors disabled:opacity-40 ${
                blessToday.has(b.kind)
                  ? 'border-gold-400 bg-gold-600/20 text-gold-200'
                  : 'border-coal-lift text-mute hover:border-gold-600/40'
              }`}
            >
              {b.title}
            </button>
          ))}
        </div>

        {spoken && (
          <p
            className="border-l-2 border-patina pl-3 text-sm text-bone/85"
            style={{ fontFamily: 'var(--font-canon)' }}
          >
            {spoken}
          </p>
        )}
        <p className="text-[0.62rem] text-mute">
          Фразу произносят вслух. Уровень поднимает новый вид Блага за сутки, а не
          количество касаний.
        </p>
      </section>

      {/* Заветы, у которых свой экран. Они не вкладки: вкладка зовёт зайти,
          а ритуал приходит в свой час — и заканчивается. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ЗАВЕТЫ ДНЯ</h2>
        <ul className="flex flex-col">
          {RITUAL_SECTIONS.map((section) => (
            <li key={section.key} className="border-b border-warm-line">
              <Link
                href={section.href}
                className="flex items-baseline justify-between gap-3 py-2.5 transition-colors hover:bg-coal/60"
              >
                <span>
                  <span className="text-bone" style={{ fontFamily: 'var(--font-display)' }}>
                    {section.title}
                  </span>
                  <span className="ml-2 text-[0.62rem] text-mute">{section.source}</span>
                </span>
                <span className="shrink-0 text-[0.62rem] tabular-nums text-gold-600">
                  {ritualStatus(section.key, rituals)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p className="text-center text-sm text-frost" role="alert">
          {error}
        </p>
      )}

      <div className="mt-auto flex justify-center pt-2">
        <VersionBadge />
      </div>
    </main>
  );
}

function plural(days: number): string {
  const n = days % 100;
  if (n >= 11 && n <= 14) return 'дней';
  switch (n % 10) {
    case 1:
      return 'день';
    case 2:
    case 3:
    case 4:
      return 'дня';
    default:
      return 'дней';
  }
}
