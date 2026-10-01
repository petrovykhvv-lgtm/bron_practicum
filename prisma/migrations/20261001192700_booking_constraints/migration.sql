-- Защита от дублей и некорректных данных на уровне БД.
-- Приложение проверяет те же правила заранее, но гонку двух запросов закрывает только БД.
-- Время в колонках хранится в UTC (timestamp без часового пояса), поэтому используем tsrange.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Table"
  ADD CONSTRAINT "table_capacity_positive" CHECK ("capacity" > 0);

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_time_order" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "booking_party_size_range" CHECK ("partySize" BETWEEN 1 AND 8);

-- Один стол нельзя отдать двум активным броням на пересекающийся интервал.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_table_no_overlap"
  EXCLUDE USING gist (
    "tableId" WITH =,
    tsrange("startsAt", "endsAt") WITH &&
  ) WHERE ("status" IN ('pending', 'confirmed'));

-- У одного пользователя не может быть двух активных броней на пересекающееся время.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_user_no_overlap"
  EXCLUDE USING gist (
    "userId" WITH =,
    tsrange("startsAt", "endsAt") WITH &&
  ) WHERE ("status" IN ('pending', 'confirmed'));

-- Гостей не больше вместимости стола, стол должен быть активным (для новых и изменённых броней).
CREATE FUNCTION booking_check_table_fit() RETURNS trigger AS $$
DECLARE
  t_capacity integer;
  t_active boolean;
BEGIN
  SELECT "capacity", "isActive" INTO t_capacity, t_active FROM "Table" WHERE "id" = NEW."tableId";
  IF NEW."partySize" > t_capacity THEN
    RAISE EXCEPTION 'party size % exceeds table capacity %', NEW."partySize", t_capacity
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND NOT t_active THEN
    RAISE EXCEPTION 'table is not active' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "booking_table_fit"
  BEFORE INSERT OR UPDATE OF "tableId", "partySize" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION booking_check_table_fit();
