import { describe, expect, it } from "vitest";
import { assertSafeTestDatabase } from "./support/safe-db";

const MAIN = "postgresql://u@localhost:5432/verde_marea";

describe("защита тестовой базы", () => {
  it("пропускает отдельную локальную тестовую базу и отсутствие адреса", () => {
    expect(() => assertSafeTestDatabase("postgresql://u@localhost:5432/verde_marea_test", MAIN)).not.toThrow();
    expect(() => assertSafeTestDatabase("postgresql://u:p@127.0.0.1/vm_TEST?schema=public", MAIN)).not.toThrow();
    expect(() => assertSafeTestDatabase(undefined, MAIN)).not.toThrow();
    expect(() => assertSafeTestDatabase("", MAIN)).not.toThrow();
  });

  it("останавливает тесты, если адрес совпадает с рабочей базой", () => {
    expect(() => assertSafeTestDatabase(MAIN, MAIN)).toThrow(/test|совпадает/);
    expect(() => assertSafeTestDatabase("postgresql://u@localhost:5432/prod_test", "postgresql://u@localhost:5432/prod_test")).toThrow(/совпадает/);
  });

  it("останавливает тесты, если в имени базы нет «test»", () => {
    expect(() => assertSafeTestDatabase("postgresql://u@localhost:5432/verde_marea_dev", MAIN)).toThrow(/не содержит/);
  });

  it("останавливает тесты для нелокального сервера", () => {
    expect(() => assertSafeTestDatabase("postgresql://u@db.example.com:5432/verde_marea_test", MAIN)).toThrow(/не на локальный/);
  });

  it("останавливает тесты для мусорного адреса", () => {
    expect(() => assertSafeTestDatabase("not a url", MAIN)).toThrow(/не похож/);
  });
});
