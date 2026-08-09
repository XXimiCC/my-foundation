import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  dataCheckString,
  initDataSecret,
  verifyInitData,
  verifyLoginWidget,
  widgetSecret,
} from './telegram';

const TOKEN = '8886890984:TESTTESTTESTTESTTESTTESTTESTTESTTEST';
const NOW = new Date('2026-08-09T12:00:00Z');
const AUTH_DATE = Math.floor(NOW.getTime() / 1000) - 30;

const USER = {
  id: 777000123,
  first_name: 'Андрій',
  username: 'brother',
  language_code: 'ru',
};

/**
 * Подпись собирается здесь заново, по буквальному описанию из документации,
 * а не вызовом проверяемого кода — иначе тест доказывал бы сам себя.
 */
function signInitData(fields: Record<string, string>, token = TOKEN): string {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function signWidget(fields: Record<string, string>, token = TOKEN) {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHash('sha256').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return { ...fields, hash };
}

const validInitData = () =>
  signInitData({
    user: JSON.stringify(USER),
    auth_date: String(AUTH_DATE),
    query_id: 'AAH1234',
  });

describe('Схемы вывода секрета различны', () => {
  it('Mini App и Login Widget дают РАЗНЫЕ секреты из одного токена', () => {
    // Если их перепутать, подделка либо не пройдёт вовсе, либо пройдёт зря.
    expect(initDataSecret(TOKEN).toString('hex')).not.toBe(
      widgetSecret(TOKEN).toString('hex'),
    );
  });

  it('секрет Mini App — это HMAC по ключу WebAppData', () => {
    const expected = createHmac('sha256', 'WebAppData').update(TOKEN).digest('hex');
    expect(initDataSecret(TOKEN).toString('hex')).toBe(expected);
  });

  it('секрет виджета — это обычный SHA-256 от токена', () => {
    const expected = createHash('sha256').update(TOKEN).digest('hex');
    expect(widgetSecret(TOKEN).toString('hex')).toBe(expected);
  });
});

describe('Строка проверки', () => {
  it('исключает hash, сортирует по ключу и склеивает переводом строки', () => {
    const s = dataCheckString([
      ['b', '2'],
      ['hash', 'ЛИШНЕЕ'],
      ['a', '1'],
    ]);
    expect(s).toBe('a=1\nb=2');
  });
});

describe('initData из Mini App', () => {
  it('принимает подлинные данные', () => {
    const r = verifyInitData(validInitData(), TOKEN, { now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.id).toBe(777000123n);
      expect(r.user.username).toBe('brother');
      expect(r.user.firstName).toBe('Андрій');
    }
  });

  it('отвергает подделанное поле', () => {
    const tampered = validInitData().replace('777000123', '777000999');
    const r = verifyInitData(tampered, TOKEN, { now: NOW });
    expect(r).toEqual({ ok: false, reason: 'подпись не совпадает' });
  });

  it('отвергает подпись от чужого токена', () => {
    const foreign = signInitData(
      { user: JSON.stringify(USER), auth_date: String(AUTH_DATE) },
      '111:ЧУЖОЙ',
    );
    expect(verifyInitData(foreign, TOKEN, { now: NOW }).ok).toBe(false);
  });

  it('не принимает секрет, выведенный по схеме виджета', () => {
    const check = `auth_date=${AUTH_DATE}\nuser=${JSON.stringify(USER)}`;
    const wrong = createHmac('sha256', widgetSecret(TOKEN)).update(check).digest('hex');
    const raw = new URLSearchParams({
      user: JSON.stringify(USER),
      auth_date: String(AUTH_DATE),
      hash: wrong,
    }).toString();
    expect(verifyInitData(raw, TOKEN, { now: NOW }).ok).toBe(false);
  });

  it('отвергает просроченную подпись', () => {
    const old = signInitData({
      user: JSON.stringify(USER),
      auth_date: String(AUTH_DATE - 200_000),
    });
    expect(verifyInitData(old, TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: 'подпись устарела',
    });
  });

  it('отвергает дату из будущего', () => {
    const future = signInitData({
      user: JSON.stringify(USER),
      auth_date: String(AUTH_DATE + 3600),
    });
    expect(verifyInitData(future, TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: 'подпись устарела',
    });
  });

  it('отвергает данные без подписи', () => {
    expect(verifyInitData('user=%7B%7D', TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: 'нет подписи',
    });
  });

  it('отвергает подлинную подпись без пользователя', () => {
    const raw = signInitData({ auth_date: String(AUTH_DATE), query_id: 'AAH1' });
    expect(verifyInitData(raw, TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: 'нет данных пользователя',
    });
  });

  it('переживает испорченный JSON пользователя', () => {
    const raw = signInitData({ user: '{не json', auth_date: String(AUTH_DATE) });
    expect(verifyInitData(raw, TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: 'данные пользователя испорчены',
    });
  });

  it('не падает на пустой строке', () => {
    expect(() => verifyInitData('', TOKEN, { now: NOW })).not.toThrow();
    expect(verifyInitData('', TOKEN, { now: NOW }).ok).toBe(false);
  });

  it('id больше 2^53 не теряет точность', () => {
    const big = { ...USER, id: '9007199254740993' };
    const raw = signInitData({ user: JSON.stringify(big), auth_date: String(AUTH_DATE) });
    const r = verifyInitData(raw, TOKEN, { now: NOW });
    expect(r.ok && r.user.id).toBe(9007199254740993n);
  });
});

describe('Login Widget из браузера', () => {
  const fields = () => ({
    id: String(USER.id),
    first_name: USER.first_name,
    username: USER.username,
    auth_date: String(AUTH_DATE),
  });

  it('принимает подлинные данные', () => {
    const r = verifyLoginWidget(signWidget(fields()), TOKEN, { now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe(777000123n);
  });

  it('отвергает подделку', () => {
    const bad = { ...signWidget(fields()), id: '999' };
    expect(verifyLoginWidget(bad, TOKEN, { now: NOW }).ok).toBe(false);
  });

  it('не принимает секрет, выведенный по схеме Mini App', () => {
    const f = fields();
    const check = Object.keys(f)
      .sort()
      .map((k) => `${k}=${f[k as keyof typeof f]}`)
      .join('\n');
    const wrong = createHmac('sha256', initDataSecret(TOKEN)).update(check).digest('hex');
    expect(verifyLoginWidget({ ...f, hash: wrong }, TOKEN, { now: NOW }).ok).toBe(false);
  });

  it('окно свежести у виджета жёстче: пять минут', () => {
    const stale = signWidget({ ...fields(), auth_date: String(AUTH_DATE - 600) });
    expect(verifyLoginWidget(stale, TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: 'подпись устарела',
    });
    // Те же десять минут для Mini App ещё в пределах суток.
    const sameForMiniApp = signInitData({
      user: JSON.stringify(USER),
      auth_date: String(AUTH_DATE - 600),
    });
    expect(verifyInitData(sameForMiniApp, TOKEN, { now: NOW }).ok).toBe(true);
  });
});
