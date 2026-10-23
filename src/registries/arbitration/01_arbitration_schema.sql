-- Мок картотеки арбитражных дел (kad.arbitr.ru).
-- Одна строка cases — одна карточка. Участника ищут по ОГРН или ОГРНИП.
-- Схема arbitration не трогает egrul, egrip и msp.
-- role_code и status_code — латинские колонки скоринга.
-- Номер дела — не кодовое поле: в нём официальный индекс суда с кириллической «А».

DROP SCHEMA IF EXISTS arbitration CASCADE;
CREATE SCHEMA arbitration;
SET search_path TO arbitration;

-- Краткая информация карточки: номер производства, дата регистрации, сумма иска, суд.
-- status_code различает незакрытое дело и законченное. Словаря такого кода на открытой карточке нет.
CREATE TABLE cases (
    case_id VARCHAR(36) PRIMARY KEY,
    case_number VARCHAR(40) NOT NULL UNIQUE,
    registration_date DATE NOT NULL,
    claim_amount NUMERIC(18, 2),
    status_code VARCHAR(16) NOT NULL,
    category_name VARCHAR(40) NOT NULL,
    court_name VARCHAR(255) NOT NULL,
    judge_last_name VARCHAR(60),
    CONSTRAINT ck_case_id CHECK (char_length(case_id) BETWEEN 1 AND 36),
    CONSTRAINT ck_case_number CHECK (char_length(case_number) BETWEEN 1 AND 40),
    CONSTRAINT ck_status_code CHECK (status_code ~ '^[a-z]+$'),
    CONSTRAINT ck_category CHECK (
        category_name IN ('Административные', 'Гражданские', 'Банкротные')
    ),
    CONSTRAINT ck_case_text CHECK (
        court_name !~ '[A-Za-z]'
        AND (judge_last_name IS NULL OR judge_last_name !~ '[A-Za-z]')
    )
);

-- Участник дела. role_code: plaintiff или defendant. role_name — подпись с картотеки.
-- Заполнен ровно один ключ: ogrn организации или ogrnip предпринимателя.
CREATE TABLE participants (
    case_id VARCHAR(36) NOT NULL REFERENCES cases (case_id) ON DELETE CASCADE,
    participant_no SMALLINT NOT NULL,
    role_code VARCHAR(16) NOT NULL,
    role_name VARCHAR(40) NOT NULL,
    participant_name VARCHAR(1000) NOT NULL,
    inn VARCHAR(12) NOT NULL,
    ogrn CHAR(13),
    ogrnip CHAR(15),
    PRIMARY KEY (case_id, participant_no),
    CONSTRAINT ck_role_code CHECK (role_code ~ '^[a-z]+$'),
    CONSTRAINT ck_role_name CHECK (
        role_name IN ('Истец', 'Ответчик', 'Третье лицо', 'Иное лицо')
    ),
    CONSTRAINT ck_participant_name CHECK (participant_name !~ '[A-Za-z]'),
    CONSTRAINT ck_inn CHECK (inn ~ '^\d{10}$' OR inn ~ '^\d{12}$'),
    CONSTRAINT ck_ogrn CHECK (ogrn IS NULL OR ogrn ~ '^\d{13}$'),
    CONSTRAINT ck_ogrnip CHECK (ogrnip IS NULL OR ogrnip ~ '^\d{15}$'),
    CONSTRAINT ck_participant_key CHECK (
        (ogrn IS NOT NULL AND ogrnip IS NULL)
        OR (ogrn IS NULL AND ogrnip IS NOT NULL)
    )
);

CREATE VIEW v_case_card AS
SELECT
    c.case_id,
    c.case_number,
    c.registration_date,
    c.claim_amount,
    c.status_code,
    c.category_name,
    c.court_name,
    c.judge_last_name,
    p.participant_no,
    p.role_code,
    p.role_name,
    p.participant_name,
    p.inn,
    p.ogrn,
    p.ogrnip
FROM cases c
JOIN participants p ON p.case_id = c.case_id;
