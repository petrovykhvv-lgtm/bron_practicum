-- Моменты времени: timestamp -> timestamptz.
-- Раньше колонки хранили время без пояса и держались на соглашении «всегда UTC»; теперь тип сам знает момент.
-- Существующие значения были UTC, поэтому преобразование явное: AT TIME ZONE 'UTC' (без USING Postgres
-- применил бы часовой пояс сессии и сдвинул данные).

-- Исключающие ограничения построены на tsrange: пересоздаём их на tstzrange после смены типа.
ALTER TABLE "Booking"
  DROP CONSTRAINT "booking_table_no_overlap",
  DROP CONSTRAINT "booking_user_no_overlap";

ALTER TABLE "User"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Session"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Table"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Slot"
  ALTER COLUMN "startsAt" TYPE TIMESTAMPTZ(3) USING "startsAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Booking"
  ALTER COLUMN "startsAt" TYPE TIMESTAMPTZ(3) USING "startsAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "endsAt" TYPE TIMESTAMPTZ(3) USING "endsAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Notification"
  ALTER COLUMN "readAt" TYPE TIMESTAMPTZ(3) USING "readAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "AuditLog"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- Те же правила, что в booking_constraints, но на tstzrange.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_table_no_overlap"
  EXCLUDE USING gist (
    "tableId" WITH =,
    tstzrange("startsAt", "endsAt") WITH &&
  ) WHERE ("status" IN ('pending', 'confirmed'));

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_user_no_overlap"
  EXCLUDE USING gist (
    "userId" WITH =,
    tstzrange("startsAt", "endsAt") WITH &&
  ) WHERE ("status" IN ('pending', 'confirmed'));
