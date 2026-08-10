'use client';

import { useCallback, useState } from 'react';
import { VersionBadge } from '@/components/system/VersionBadge';
import {
  MAX_ITEMS,
  reasonLabel,
  validateItem,
  type DeclarationItem,
  type PutView,
  type Verdict,
} from '@/lib/core/put';
import { SHELL_LABEL, SHELLS, type Shell } from '@/lib/core/shells';
import { Sled } from './Sled';

/**
 * Экран Завета ПУТЬ.
 *
 * Порядок блоков повторяет сам ритуал: сначала выполнение сегодняшнего
 * («Делаю»), потом Декларация на завтра («Планирую»), потом След и Свиток
 * («Фиксирую»). Цикл вечер→утро замыкается здесь целиком.
 *
 * Кнопок «поделиться» и «выгрузить» на этом экране нет и не будет: «никому не
 * рассказывайте о своих намерениях, потому что ваша трансформация — это
 * интимный процесс».
 */

interface Row {
  text: string;
  shell: Shell | null;
}

const EMPTY_ROW: Row = { text: '', shell: null };

function human(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function Put({ initial }: { initial: PutView }) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<'today' | 'tomorrow' | null>(null);
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [verdicts, setVerdicts] = useState<(Verdict | null)[]>([]);

  const [closing, setClosing] = useState(false);
  const [reflection, setReflection] = useState('');

  const send = useCallback(async (method: 'POST' | 'PATCH', body: object, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch('/api/put', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data.verdicts)) setVerdicts(data.verdicts);
        throw new Error(data.error ?? 'не записалось');
      }
      setView(data as PutView);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не записалось');
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  const openEditor = (which: 'today' | 'tomorrow', from: DeclarationItem[]) => {
    setEditing(which);
    setVerdicts([]);
    setError(null);
    setRows(
      from.length > 0
        ? from.map((i) => ({ text: i.text, shell: i.shell }))
        : [{ ...EMPTY_ROW }],
    );
  };

  const declare = async () => {
    // Локальная проверка — чтобы отказ пришёл сразу, а не после запроса.
    // Решает всё равно сервер: валидатор Завета живёт там же, что и запись.
    const local = rows.map((r) => (r.text.trim() ? validateItem(r.text) : null));
    setVerdicts(local);
    if (local.some((v) => v && !v.ok)) {
      setError('Завет ПУТЬ не принимает такие пункты');
      return;
    }

    const date = editing === 'today' ? view.today.date : view.tomorrow.date;
    const ok = await send(
      'POST',
      { date, items: rows.map((r) => ({ text: r.text, shell: r.shell })) },
      'declare',
    );
    if (ok) {
      setEditing(null);
      setVerdicts([]);
    }
  };

  const closeDay = async () => {
    const ok = await send('PATCH', { close: true, reflection }, 'close');
    if (ok) {
      setClosing(false);
      setReflection('');
    }
  };

  const { today, tomorrow } = view;

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
      <header className="text-center">
        <h1
          className="text-xl tracking-[0.4em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ПУТЬ
        </h1>
        <p className="mt-1 text-[0.68rem] text-mute">
          {view.streak > 0
            ? `Цепь: ${view.streak} ${plural(view.streak, 'день', 'дня', 'дней')} подряд`
            : 'Делаю, планирую, фиксирую'}
        </p>
      </header>

      {/* ── Выполнение ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">СЕГОДНЯ</h2>
          <span className="text-[0.62rem] tabular-nums text-mute">{human(today.date)}</span>
        </div>

        {today.exists ? (
          <>
            <ul className="flex flex-col">
              {today.items.map((item, index) => (
                <li key={`${item.text}-${index}`} className="border-b border-warm-line">
                  <button
                    onClick={() => send('PATCH', { index, done: !item.done }, `item-${index}`)}
                    disabled={busy !== null}
                    className="flex w-full items-start gap-3 py-2.5 text-left disabled:opacity-40"
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[0.6rem] ${
                        item.done
                          ? 'border-gold-400 bg-gold-600/25 text-gold-200'
                          : 'border-ash text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className="flex-1">
                      <span
                        className={`block text-sm ${item.done ? 'text-mute line-through' : 'text-bone'}`}
                      >
                        {item.text}
                      </span>
                      {item.shell && (
                        <span className="text-[0.62rem] text-gold-600">
                          {SHELL_LABEL[item.shell]} · выполнение засчитается Актом
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <p className="text-[0.62rem] text-mute">
              {today.done} из {today.total}
              {today.done === today.total
                ? ' — задекларированное выполнено'
                : ' · скорость не так важна, как постоянство'}
            </p>

            {today.closedAt ? (
              <p className="text-[0.68rem] text-mute">
                День закрыт.
                {today.reflection ? ` «${today.reflection}»` : ''}
              </p>
            ) : closing ? (
              <div className="flex flex-col gap-2">
                <label className="text-[0.62rem] text-mute" htmlFor="reflection">
                  Обернитесь назад: что замечено за день?
                </label>
                <textarea
                  id="reflection"
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="rounded-sm border border-ash bg-coal px-3 py-2 text-sm text-bone outline-none focus:border-gold-600"
                />
                <div className="flex gap-2">
                  <button
                    onClick={closeDay}
                    disabled={busy !== null}
                    className="rounded border border-gold-600/60 px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-gold-200 transition-colors hover:bg-gold-600/15 disabled:opacity-40"
                  >
                    {busy === 'close' ? '…' : 'ЗАКРЫТЬ ДЕНЬ'}
                  </button>
                  <button
                    onClick={() => setClosing(false)}
                    className="px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-mute"
                  >
                    ПОЗЖЕ
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setClosing(true)}
                className="self-start text-[0.62rem] tracking-[0.15em] text-mute transition-colors hover:text-gold-400"
              >
                ЗАКРЫТЬ ДЕНЬ ↓
              </button>
            )}
          </>
        ) : editing === 'today' ? (
          <Editor
            rows={rows}
            verdicts={verdicts}
            busy={busy === 'declare'}
            weakest={view.weakest}
            onChange={setRows}
            onSubmit={declare}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-mute">
              Декларации на сегодня нет. Её составляют накануне вечером — но день
              ещё идёт.
            </p>
            <button
              onClick={() => openEditor('today', [])}
              className="self-start rounded border border-gold-600/60 px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-gold-200 transition-colors hover:bg-gold-600/15"
            >
              ЗАДЕКЛАРИРОВАТЬ СЕГОДНЯ
            </button>
            <p className="text-[0.62rem] text-mute">
              Сегодняшнюю Декларацию потом не переписать: подгонка плана под уже
              сделанное убивает напряжение, ради которого он и составляется.
            </p>
          </div>
        )}
      </section>

      {/* ── Декларация ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ЗАВТРА</h2>
          <span className="text-[0.62rem] tabular-nums text-mute">{human(tomorrow.date)}</span>
        </div>

        {editing === 'tomorrow' ? (
          <Editor
            rows={rows}
            verdicts={verdicts}
            busy={busy === 'declare'}
            weakest={view.weakest}
            onChange={setRows}
            onSubmit={declare}
            onCancel={() => setEditing(null)}
          />
        ) : tomorrow.exists ? (
          <>
            <ul className="flex flex-col">
              {tomorrow.items.map((item, index) => (
                <li
                  key={`${item.text}-${index}`}
                  className="flex items-baseline gap-2 border-b border-warm-line py-2"
                >
                  <span className="text-sm text-bone">{item.text}</span>
                  {item.shell && (
                    <span className="text-[0.62rem] text-gold-600">
                      {SHELL_LABEL[item.shell]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <button
              onClick={() => openEditor('tomorrow', tomorrow.items)}
              className="self-start text-[0.62rem] tracking-[0.15em] text-mute transition-colors hover:text-gold-400"
            >
              ПЕРЕПИСАТЬ
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-mute">
              «Каждый вечер необходимо зафиксировать то, что я совершу завтра.»
            </p>
            <button
              onClick={() => openEditor('tomorrow', [])}
              className="self-start rounded border border-gold-600/60 px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-gold-200 transition-colors hover:bg-gold-600/15"
            >
              ДЕКЛАРИРОВАТЬ
            </button>
          </div>
        )}
      </section>

      {/* ── След ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">СЛЕД</h2>
        <Sled
          trail={view.trail}
          today={view.today.date}
          className="mx-auto aspect-square w-full max-w-[17rem]"
        />
        <p className="text-center text-[0.62rem] text-mute">
          Каждая точка — день, яркость — Сила этого дня. Обводка: выполненная
          Декларация, светлая — сегодня.
        </p>
      </section>

      {/* ── Свиток недели ──────────────────────────────────────────────── */}
      {view.week && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">СВИТОК НЕДЕЛИ</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Line label="Дней с Декларацией" value={`${view.week.declaredDays} из 7`} />
            <Line label="Выполнено целиком" value={`${view.week.fulfilledDays}`} />
            <Line
              label="Пунктов пройдено"
              value={`${view.week.doneItems} из ${view.week.totalItems}`}
            />
            <Line label="Средняя Сила" value={view.week.avgSila.toFixed(0)} />
            <Line
              label="Сила за неделю"
              value={`${view.week.silaFrom.toFixed(0)} → ${view.week.silaTo.toFixed(0)}`}
            />
          </dl>
          <p className="text-[0.62rem] text-mute">
            Сравнение только с собой: «мы оцениваем свой прогресс завтра
            относительно себя сегодня». Пропущенный день ничего не отнимает.
          </p>
        </section>
      )}

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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-mute">{label}</dt>
      <dd className="text-right tabular-nums text-bone">{value}</dd>
    </>
  );
}

/**
 * Редактор Декларации.
 *
 * Пунктов не больше пяти: «не планируйте заведомо сложные для выполнения
 * действия», а провал 2024 года записан прямо — «планы были не реалистичными».
 */
function Editor({
  rows,
  verdicts,
  busy,
  weakest,
  onChange,
  onSubmit,
  onCancel,
}: {
  rows: Row[];
  verdicts: (Verdict | null)[];
  busy: boolean;
  weakest: Shell;
  onChange: (rows: Row[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const set = (index: number, patch: Partial<Row>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.62rem] text-mute">
        Слабое звено — {SHELL_LABEL[weakest]}. Действия должны быть выполнимыми и
        развивающими; лень, потребление и удовольствие Завет не принимает.
      </p>

      {rows.map((row, index) => {
        const verdict = verdicts[index];
        const bad = verdict && !verdict.ok && row.text.trim().length > 0;

        return (
          <div key={index} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                value={row.text}
                onChange={(e) => set(index, { text: e.target.value })}
                placeholder={index === 0 ? 'Что я совершу' : 'Ещё одно действие'}
                maxLength={140}
                className={`min-w-0 flex-1 rounded-sm border bg-coal px-3 py-2 text-sm text-bone outline-none focus:border-gold-600 ${
                  bad ? 'border-frost' : 'border-ash'
                }`}
              />
              {rows.length > 1 && (
                <button
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  aria-label="убрать пункт"
                  className="shrink-0 px-2 text-mute transition-colors hover:text-gold-400"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex gap-1.5">
              {SHELLS.map((shell) => (
                <button
                  key={shell}
                  onClick={() => set(index, { shell: row.shell === shell ? null : shell })}
                  className={`rounded-sm border px-2 py-1 text-[0.6rem] transition-colors ${
                    row.shell === shell
                      ? 'border-gold-400 bg-gold-600/20 text-gold-200'
                      : 'border-coal-lift text-mute hover:border-gold-600/40'
                  }`}
                >
                  {SHELL_LABEL[shell]}
                </button>
              ))}
            </div>

            {bad && verdict?.reason && (
              <p className="text-[0.68rem] text-frost">
                {reasonLabel(verdict.reason)}. {verdict.hint}
              </p>
            )}
          </div>
        );
      })}

      {rows.length < MAX_ITEMS && (
        <button
          onClick={() => onChange([...rows, { ...EMPTY_ROW }])}
          className="self-start text-[0.62rem] tracking-[0.15em] text-mute transition-colors hover:text-gold-400"
        >
          + ПУНКТ
        </button>
      )}

      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={busy}
          className="rounded border border-gold-600/60 px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-gold-200 transition-colors hover:bg-gold-600/15 disabled:opacity-40"
        >
          {busy ? '…' : 'ЗАДЕКЛАРИРОВАТЬ'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-mute"
        >
          ОТМЕНА
        </button>
      </div>

      <p className="text-[0.62rem] text-mute">
        Достаточно одного действия — но его нужно выполнить. Привязка к оболочке
        необязательна: с ней выполнение пункта сразу засчитывается Актом.
      </p>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod = n % 100;
  if (mod >= 11 && mod <= 14) return many;
  switch (mod % 10) {
    case 1:
      return one;
    case 2:
    case 3:
    case 4:
      return few;
    default:
      return many;
  }
}
