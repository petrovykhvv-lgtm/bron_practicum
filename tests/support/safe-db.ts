// Защита от потери данных: интеграционные тесты очищают таблицы тестовой БД.
// Если TEST_DATABASE_URL указывает на рабочую базу, не локальный сервер или базу без «test» в имени, тесты не запускаются.
function parse(url: string): { host: string; port: string; db: string } {
  const u = new URL(url);
  return { host: u.hostname, port: u.port || "5432", db: decodeURIComponent(u.pathname.replace(/^\//, "")) };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertSafeTestDatabase(testUrl: string | undefined, mainUrl: string | undefined): void {
  if (!testUrl) return; // не задана: интеграционные тесты пропускаются
  let test;
  try {
    test = parse(testUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL не похож на адрес PostgreSQL. Тесты остановлены, чтобы не тронуть данные.");
  }
  if (!LOCAL_HOSTS.has(test.host)) {
    throw new Error(`TEST_DATABASE_URL указывает не на локальный сервер (${test.host}). Тесты очищают таблицы, поэтому остановлены.`);
  }
  if (!/test/i.test(test.db)) {
    throw new Error(`Имя тестовой базы «${test.db}» не содержит «test». Тесты очищают таблицы, поэтому остановлены. Создайте базу командой: createdb verde_marea_test`);
  }
  if (mainUrl) {
    try {
      const main = parse(mainUrl);
      if (main.host === test.host && main.port === test.port && main.db === test.db) {
        throw new Error("TEST_DATABASE_URL совпадает с DATABASE_URL: тесты стёрли бы рабочие данные, поэтому остановлены.");
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("TEST_DATABASE_URL совпадает")) throw error;
    }
  }
}
