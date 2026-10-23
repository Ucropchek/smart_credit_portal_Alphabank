-- Мок кредитного отчёта бюро: единый технический формат XML, версия 5.1
-- (с 01.07.2026), Положение Банка России от 11.05.2021 № 758-П.
-- Снимок на 2026-10-21, без потока событий и без галочки согласия.
-- Схема bki не трогает egrul, egrip и msp. Идентификаторы взяты из них.

DROP SCHEMA IF EXISTS bki CASCADE;
CREATE SCHEMA bki;
SET search_path TO bki;

-- Структура ИНН: одна контрольная цифра у 10 знаков, две у 12. Пустое значение пропускается.
CREATE FUNCTION inn_ok(inn TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    s INT := 0;
    i INT;
    n11 INT;
    n12 INT;
    w10 INT[] := ARRAY[2, 4, 10, 3, 5, 9, 4, 6, 8];
    w11 INT[] := ARRAY[7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    w12 INT[] := ARRAY[3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
BEGIN
    IF inn IS NULL THEN
        RETURN TRUE;
    END IF;
    IF left(inn, 2) = '00' THEN
        RETURN FALSE;
    END IF;
    IF inn ~ '^\d{10}$' THEN
        FOR i IN 1..9 LOOP
            s := s + substring(inn, i, 1)::INT * w10[i];
        END LOOP;
        RETURN (s % 11) % 10 = substring(inn, 10, 1)::INT;
    END IF;
    IF inn ~ '^\d{12}$' THEN
        FOR i IN 1..10 LOOP
            s := s + substring(inn, i, 1)::INT * w11[i];
        END LOOP;
        n11 := (s % 11) % 10;
        IF n11 <> substring(inn, 11, 1)::INT THEN
            RETURN FALSE;
        END IF;
        s := 0;
        FOR i IN 1..11 LOOP
            s := s + substring(inn, i, 1)::INT * w12[i];
        END LOOP;
        n12 := (s % 11) % 10;
        RETURN n12 = substring(inn, 12, 1)::INT;
    END IF;
    RETURN FALSE;
END;
$$;

-- Справочник 3.7. Виды соблюдения срока внесения платежей.
-- Показатель ФЛ_28.11 / ЮЛ_20.11, атрибут scheduleCode.
CREATE TABLE schedule_compliance (
    code CHAR(1) PRIMARY KEY,
    name VARCHAR(120) NOT NULL
);

-- Титульная часть. subject_inn — это taxNum: ФЛ_6.2 у человека, ЮЛ_4.2 у организации.
CREATE TABLE subjects (
    subject_inn VARCHAR(12) PRIMARY KEY,
    full_name VARCHAR(1000),
    short_name VARCHAR(500),
    last_name VARCHAR(60),
    first_name VARCHAR(60),
    middle_name VARCHAR(60),
    ogrn CHAR(13),
    ogrnip CHAR(15),
    birth_date DATE,
    CONSTRAINT ck_subject_inn CHECK (
        (subject_inn ~ '^\d{10}$' OR subject_inn ~ '^\d{12}$')
        AND bki.inn_ok(subject_inn)
    ),
    CONSTRAINT ck_ogrn CHECK (
        ogrn IS NULL
        OR (ogrn ~ '^[15]\d{12}$' AND (left(ogrn, 12)::NUMERIC % 11) % 10 = right(ogrn, 1)::INT)
    ),
    CONSTRAINT ck_ogrnip CHECK (
        ogrnip IS NULL
        OR (ogrnip ~ '^3\d{14}$' AND (left(ogrnip, 14)::NUMERIC % 13) % 10 = right(ogrnip, 1)::INT)
    )
);

-- ИНН директора и учредителей из ЕГРЮЛ. Это ключ, по которому продукт отдельно
-- спрашивает бюро о человеке. Коды ролей — метки мока, не справочник 758-П.
CREATE TABLE subject_related_person (
    subject_inn VARCHAR(12) NOT NULL REFERENCES subjects (subject_inn) ON DELETE CASCADE,
    person_inn CHAR(12) NOT NULL,
    role VARCHAR(10) NOT NULL,
    person_name VARCHAR(200) NOT NULL,
    PRIMARY KEY (subject_inn, person_inn, role),
    CONSTRAINT ck_related_inn CHECK (person_inn ~ '^\d{12}$' AND bki.inn_ok(person_inn)),
    CONSTRAINT ck_related_role CHECK (role IN ('DIRECTOR', 'FOUNDER'))
);

-- Один договор на дату среза. Колонки скоринга лежат здесь.
-- obligation_sum — сумма обязательства (атрибут sum, ФЛ_19.1 / ЮЛ_12.1), лимит линии.
-- debt_sum — сумма задолженности (debtSum, ФЛ_25.4 / ЮЛ_17.4).
-- debt_overdue_sum — сумма просроченной задолженности (debtOverdueSum, ФЛ_27.3 / ЮЛ_19.3).
--   Стоп-фактор, если значение больше нуля.
-- miss_duration — продолжительность просрочки в днях (missDuration, ФЛ_27.11 / ЮЛ_19.11).
-- schedule_code — код соблюдения срока внесения платежей (scheduleCode, ФЛ_28.11 / ЮЛ_20.11).
--   В этой выборке это худший такой код за время договора.
CREATE TABLE obligations (
    subject_inn VARCHAR(12) NOT NULL REFERENCES subjects (subject_inn) ON DELETE CASCADE,
    deal_uid VARCHAR(64) NOT NULL,
    deal_number VARCHAR(40) NOT NULL,
    opened_on DATE NOT NULL,
    calc_date DATE NOT NULL,
    currency CHAR(3) NOT NULL,
    deal_type_code VARCHAR(2) NOT NULL,
    deal_type_name VARCHAR(200) NOT NULL,
    loan_kind_code VARCHAR(2) NOT NULL,
    loan_kind_name VARCHAR(200) NOT NULL,
    obligation_sum NUMERIC(17, 2) NOT NULL,
    debt_sum NUMERIC(17, 2) NOT NULL,
    debt_due_sum NUMERIC(17, 2) NOT NULL,
    debt_overdue_sum NUMERIC(17, 2) NOT NULL,
    miss_fact CHAR(1) NOT NULL,
    miss_duration INTEGER NOT NULL,
    overdue_start_date DATE,
    repaid_miss_duration INTEGER NOT NULL,
    schedule_code CHAR(1) NOT NULL REFERENCES schedule_compliance (code),
    PRIMARY KEY (subject_inn, deal_uid),
    CONSTRAINT ck_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_calc CHECK (opened_on <= calc_date),
    CONSTRAINT ck_miss_fact CHECK (miss_fact IN ('0', '1')),
    CONSTRAINT ck_money CHECK (
        obligation_sum >= 0
        AND debt_sum >= 0
        AND debt_due_sum >= 0
        AND debt_overdue_sum >= 0
        AND obligation_sum < 1000000000000000
        AND debt_sum < 1000000000000000
        AND debt_due_sum < 1000000000000000
        AND debt_overdue_sum < 1000000000000000
    ),
    CONSTRAINT ck_debt_parts CHECK (debt_sum = debt_due_sum + debt_overdue_sum),
    CONSTRAINT ck_repaid CHECK (repaid_miss_duration >= 0),
    CONSTRAINT ck_overdue CHECK (
        (
            debt_overdue_sum = 0
            AND miss_duration = 0
            AND overdue_start_date IS NULL
            AND miss_fact = '0'
        )
        OR (
            debt_overdue_sum > 0
            AND miss_duration > 0
            AND overdue_start_date IS NOT NULL
            AND miss_fact = '1'
            AND overdue_start_date >= opened_on
            AND overdue_start_date <= calc_date
            AND miss_duration <= (calc_date - overdue_start_date) + 1
        )
    )
);

CREATE INDEX ix_obligations_inn ON obligations (subject_inn);

-- Шесть колонок, которые читает скоринг.
CREATE VIEW v_scoring_snapshot AS
SELECT
    subject_inn,
    debt_overdue_sum,
    miss_duration,
    debt_sum,
    obligation_sum,
    schedule_code
FROM obligations;
