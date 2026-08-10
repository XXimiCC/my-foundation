'use client';

import Link from 'next/link';
import { useState } from 'react';
import { VersionBadge } from '@/components/system/VersionBadge';
import {
  INTENSITY_HINT,
  INTENSITY_LABEL,
  WEEKDAY_SHORT,
  preview,
  toClock,
  toMinutes,
  validateSettings,
  type EditableSettings,
  type Field,
} from '@/lib/core/settings';

/**
 * Настройки ритуального дня.
 *
 * Экран отвечает на один вопрос — «во сколько меня позовут», — поэтому под
 * полями стоит предпросмотр: минуты абстрактны, а список времён конкретен.
 *
 * Отдельно объясняется интенсивность: «меньше уведомлений» здесь не урезание
 * возможностей, а способ остаться в Основе 4, когда день и так тяжёлый.
 */

const WINDOWS: { field: Field; title: string; hint: string }[] = [
  { field: 'morningAt', title: 'Утро', hint: 'благодарение Сна и Слово Дня' },
  { field: 'mindAt', title: 'День', hint: 'напоминание Разума' },
  { field: 'eveningAt', title: 'Вечер', hint: 'Декларация на завтра' },
  { field: 'nightAt', title: 'Ночь', hint: 'благодарение Тела и закрытие дня' },
];

const TIME_FIELDS = [
  'morningAt',
  'mindAt',
  'eveningAt',
  'nightAt',
  'quietFrom',
  'quietTo',
] as const;

type TimeField = (typeof TIME_FIELDS)[number];

export function Nastroyki({ initial, zones }: { initial: EditableSettings; zones: string[] }) {
  const [form, setForm] = useState(initial);
  /**
   * Поля времени НЕ контролируются React, а лишь отражаются в состояние.
   *
   * Две причины, обе выяснены в живом браузере.
   *
   * Первая: пока человек набирает «23», час введён наполовину и значение поля
   * пусто. Контролируемое поле в этот момент получает обратно прежние «21:00»
   * и стирает набранное прямо под пальцами. Поэтому `defaultValue`: полем
   * владеет браузер, а состояние держит зеркало для проверки и отправки.
   *
   * Вторая: до React вообще не доходит `change` от `input[type="time"]` —
   * нативные события в поле летят, клики по соседним кнопкам обрабатываются,
   * а обработчик поля молчит. Поэтому зеркало обновляется ещё и по уходу
   * фокуса: событие фокуса доходит всегда.
   */
  const [times, setTimes] = useState<Record<TimeField, string>>(() =>
    Object.fromEntries(TIME_FIELDS.map((f) => [f, toClock(initial[f])])) as Record<
      TimeField,
      string
    >,
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = TIME_FIELDS.map((f) => [f, toMinutes(times[f])] as const);
  const unparsed = parsed.filter(([, minutes]) => minutes === null).map(([field]) => field);

  const candidate: EditableSettings = {
    ...form,
    ...(Object.fromEntries(parsed.map(([f, m]) => [f, m ?? form[f]])) as Record<TimeField, number>),
  };

  const problems =
    unparsed.length > 0
      ? unparsed.map((field) => ({ field: field as Field, message: 'укажите время' }))
      : validateSettings(candidate);
  const problemOf = (field: Field) => problems.find((p) => p.field === field)?.message;

  const set = (patch: Partial<EditableSettings>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };

  const setTime = (field: TimeField, value: string) => {
    setTimes((t) => ({ ...t, [field]: value }));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      const data = (await res.json()) as EditableSettings & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'не сохранилось');
      setForm(data);
      setTimes(
        Object.fromEntries(TIME_FIELDS.map((f) => [f, toClock(data[f])])) as Record<
          TimeField,
          string
        >,
      );
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не сохранилось');
    } finally {
      setBusy(false);
    }
  };

  const detect = () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) set({ tz: zone });
  };

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">
      <header className="text-center">
        <h1
          className="text-xl tracking-[0.4em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          НАСТРОЙКИ
        </h1>
        <p className="mt-2 text-sm text-mute">
          Ритуал должен приходить в свой час — а час у каждого свой.
        </p>
      </header>

      {/* ── Окна ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">КОГДА ЗВАТЬ</h2>

        {WINDOWS.map(({ field, title, hint }) => (
          <div key={field} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-bone">{title}</div>
                <div className="text-[0.62rem] text-mute">{hint}</div>
              </div>
              <input
                type="time"
                defaultValue={times[field as TimeField]}
                onChange={(e) => setTime(field as TimeField, e.target.value)}
                onBlur={(e) => setTime(field as TimeField, e.target.value)}
                className={`shrink-0 rounded-sm border bg-coal px-3 py-1.5 text-sm tabular-nums text-bone outline-none focus:border-gold-600 ${
                  problemOf(field) ? 'border-frost' : 'border-ash'
                }`}
              />
            </div>
            {problemOf(field) && <p className="text-[0.68rem] text-frost">{problemOf(field)}</p>}
          </div>
        ))}
      </section>

      {/* ── Тихие часы ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ТИХИЕ ЧАСЫ</h2>
        <div className="flex items-center gap-3">
          <input
            type="time"
            defaultValue={times.quietFrom}
            onChange={(e) => setTime('quietFrom', e.target.value)}
            onBlur={(e) => setTime('quietFrom', e.target.value)}
            className="rounded-sm border border-ash bg-coal px-3 py-1.5 text-sm tabular-nums text-bone outline-none focus:border-gold-600"
          />
          <span className="text-mute">—</span>
          <input
            type="time"
            defaultValue={times.quietTo}
            onChange={(e) => setTime('quietTo', e.target.value)}
            onBlur={(e) => setTime('quietTo', e.target.value)}
            className="rounded-sm border border-ash bg-coal px-3 py-1.5 text-sm tabular-nums text-bone outline-none focus:border-gold-600"
          />
        </div>
        <p className="text-[0.62rem] text-mute">
          В эти часы не приходит ничего. Приложение не имеет права быть источником
          стресса.
        </p>
      </section>

      {/* ── Интенсивность ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">СКОЛЬКО ЗВАТЬ</h2>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((level) => (
            <button
              key={level}
              onClick={() => set({ intensity: level })}
              className={`flex-1 rounded-sm border px-2 py-2 text-[0.68rem] transition-colors ${
                form.intensity === level
                  ? 'border-gold-400 bg-gold-600/20 text-gold-200'
                  : 'border-coal-lift text-mute hover:border-gold-600/40'
              }`}
            >
              {INTENSITY_LABEL[level]}
            </button>
          ))}
        </div>
        <p className="text-[0.62rem] text-mute">{INTENSITY_HINT[form.intensity]}</p>
      </section>

      {/* ── Дни Очищения ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ДНИ ОЧИЩЕНИЯ</h2>
        <div className="flex gap-1.5">
          {WEEKDAY_SHORT.map((label, index) => {
            const day = index + 1;
            const on = form.fastWeekdays.includes(day);
            return (
              <button
                key={day}
                onClick={() =>
                  set({
                    fastWeekdays: on
                      ? form.fastWeekdays.filter((d) => d !== day)
                      : [...form.fastWeekdays, day].sort(),
                  })
                }
                className={`flex-1 rounded-sm border py-2 text-[0.62rem] transition-colors ${
                  on
                    ? 'border-gold-400 bg-gold-600/20 text-gold-200'
                    : 'border-coal-lift text-mute hover:border-gold-600/40'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-[0.62rem] text-mute">
          Желательны, но не обязательны. Пустой список — предложений не будет.
        </p>
      </section>

      {/* ── Часовой пояс ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ЧАСОВОЙ ПОЯС</h2>
        <div className="flex items-center gap-2">
          <select
            value={form.tz}
            onChange={(e) => set({ tz: e.target.value })}
            className="min-w-0 flex-1 rounded-sm border border-ash bg-coal px-3 py-2 text-sm text-bone outline-none focus:border-gold-600"
          >
            {(zones.includes(form.tz) ? zones : [form.tz, ...zones]).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <button
            onClick={detect}
            className="shrink-0 rounded border border-gold-600/60 px-3 py-2 text-[0.62rem] tracking-[0.15em] text-gold-200 transition-colors hover:bg-gold-600/15"
          >
            ОПРЕДЕЛИТЬ
          </button>
        </div>
        {problemOf('tz') && <p className="text-[0.68rem] text-frost">{problemOf('tz')}</p>}
        <p className="text-[0.62rem] text-mute">
          По нему считаются и сутки Заветов, и все окна. Без него ритуальный день
          бессмыслен.
        </p>
      </section>

      {/* ── Предпросмотр ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ДЕНЬ ВЫГЛЯДИТ ТАК</h2>
        {/* data-preview — адрес для проверки: те же слова стоят и в подписях
            окон выше, и без якоря их не различить. */}
        <ul data-preview className="flex flex-col">
          {preview(candidate).map((line) => (
            <li
              key={`${line.at}-${line.label}`}
              className="flex items-baseline justify-between gap-3 border-b border-warm-line py-2"
            >
              <span className="text-sm text-bone">{line.label}</span>
              <span className="shrink-0 text-sm tabular-nums text-gold-600">{line.at}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || problems.length > 0}
          className="rounded border border-gold-600/60 px-4 py-2 text-[0.62rem] tracking-[0.2em] text-gold-200 transition-colors hover:bg-gold-600/15 disabled:opacity-40"
        >
          {busy ? '…' : 'СОХРАНИТЬ'}
        </button>
        {saved && <span className="text-[0.68rem] text-mute">Сохранено</span>}
        {problems.length > 0 && (
          <span className="text-[0.68rem] text-frost">Сначала поправьте отмеченное</span>
        )}
      </div>

      {error && (
        <p className="text-sm text-frost" role="alert">
          {error}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between pt-2">
        <Link href="/" className="text-[0.62rem] tracking-[0.15em] text-mute">
          ← НАЗАД
        </Link>
        <VersionBadge />
      </div>
    </main>
  );
}
