-- Мок реестра ФНС: наборы открытых данных ФНС России (nalog.gov.ru/opendata), из которых
-- собирается сервис «Прозрачный бизнес» (pb.nalog.ru).
-- Один набор — одна таблица документов, повторяющиеся элементы XML — дочерние таблицы.
-- Состав полей повторяет XSD (XML-наборы) и structure-*.csv (CSV-наборы) один в один:
-- путь элемента/атрибута или код колонки CSV указан в COMMENT ON COLUMN.
-- Даты хранятся как DATE (в файлах ФНС — ДД.ММ.ГГГГ), признаки — строковыми кодами, как в файлах.
-- Схема fns не трогает egrul и egrip. Идентификаторы синтетические.

DROP SCHEMA IF EXISTS fns CASCADE;
CREATE SCHEMA fns;
SET search_path TO fns;

-- Паспорт набора: код набора, структура, тип информации из XSD
CREATE TABLE datasets (
    code VARCHAR(40) PRIMARY KEY,
    title VARCHAR(1000) NOT NULL,
    data_format VARCHAR(3) NOT NULL,
    structure_version VARCHAR(8) NOT NULL,
    info_type VARCHAR(50),
    format_version VARCHAR(5),
    CONSTRAINT ck_dataset_code CHECK (code ~ '^7707329152-[a-z0-9]+$'),
    CONSTRAINT ck_dataset_format CHECK (
        (data_format = 'xml' AND info_type IS NOT NULL AND format_version IS NOT NULL)
        OR (data_format = 'csv' AND info_type IS NULL AND format_version IS NULL)
    )
);

-- Один опубликованный файл набора. Для XML — корневой элемент Файл и ИдОтпр, для CSV — имя файла.
CREATE TABLE releases (
    file_id VARCHAR(255) PRIMARY KEY,
    dataset_code VARCHAR(40) NOT NULL REFERENCES datasets (code),
    release_date DATE NOT NULL,
    format_version VARCHAR(5),
    info_type VARCHAR(50),
    program_version VARCHAR(40),
    doc_count INTEGER,
    sender_last_name VARCHAR(60),
    sender_first_name VARCHAR(60),
    sender_middle_name VARCHAR(60),
    sender_position VARCHAR(100),
    sender_phone VARCHAR(20),
    sender_email VARCHAR(45),
    CONSTRAINT ck_release_header CHECK (
        (format_version IS NULL AND info_type IS NULL AND doc_count IS NULL AND program_version IS NULL
            AND sender_last_name IS NULL AND sender_first_name IS NULL)
        OR (format_version IS NOT NULL AND info_type IS NOT NULL AND doc_count >= 1)
    )
);

COMMENT ON COLUMN releases.file_id IS 'Файл/@ИдФайл; для CSV-набора — имя файла data-*-structure-*.csv';
COMMENT ON COLUMN releases.release_date IS 'Дата публикации из имени архива data-ГГГГММДД (ДДММГГГГ у старых CSV-наборов)';
COMMENT ON COLUMN releases.format_version IS 'Файл/@ВерсФорм';
COMMENT ON COLUMN releases.info_type IS 'Файл/@ТипИнф';
COMMENT ON COLUMN releases.program_version IS 'Файл/@ВерсПрог';
COMMENT ON COLUMN releases.doc_count IS 'Файл/@КолДок';
COMMENT ON COLUMN releases.sender_last_name IS 'Файл/ИдОтпр/ФИООтв/@Фамилия';
COMMENT ON COLUMN releases.sender_first_name IS 'Файл/ИдОтпр/ФИООтв/@Имя';
COMMENT ON COLUMN releases.sender_middle_name IS 'Файл/ИдОтпр/ФИООтв/@Отчество';
COMMENT ON COLUMN releases.sender_position IS 'Файл/ИдОтпр/@ДолжОтв';
COMMENT ON COLUMN releases.sender_phone IS 'Файл/ИдОтпр/@Тлф';
COMMENT ON COLUMN releases.sender_email IS 'Файл/ИдОтпр/@E-mail';

-- 7707329152-sshr2019. Сведения о среднесписочной численности работников организации
CREATE TABLE headcount (
    doc_id UUID PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    doc_date DATE NOT NULL,
    state_date DATE NOT NULL,
    org_name VARCHAR(1000) NOT NULL,
    inn CHAR(10) NOT NULL,
    employee_count INTEGER NOT NULL,
    CONSTRAINT uq_headcount UNIQUE (inn, state_date),
    CONSTRAINT ck_headcount_inn CHECK (inn ~ '^\d{10}$'),
    CONSTRAINT ck_headcount_count CHECK (employee_count >= 0),
    CONSTRAINT ck_headcount_dates CHECK (doc_date > state_date)
);

COMMENT ON TABLE headcount IS 'Набор 7707329152-sshr2019, ТипИнф ОТКРДАННЫЕ3';
COMMENT ON COLUMN headcount.doc_id IS 'Документ/@ИдДок';
COMMENT ON COLUMN headcount.doc_date IS 'Документ/@ДатаДок';
COMMENT ON COLUMN headcount.state_date IS 'Документ/@ДатаСост';
COMMENT ON COLUMN headcount.org_name IS 'Документ/СведНП/@НаимОрг';
COMMENT ON COLUMN headcount.inn IS 'Документ/СведНП/@ИННЮЛ';
COMMENT ON COLUMN headcount.employee_count IS 'Документ/СведССЧР/@КолРаб';

-- 7707329152-snr. Сведения о специальных налоговых режимах, применяемых налогоплательщиками (ЮЛ).
-- В набор попадают только организации, применяющие хотя бы один режим.
CREATE TABLE org_tax_regimes (
    doc_id UUID PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    doc_date DATE NOT NULL,
    state_date DATE NOT NULL,
    org_name VARCHAR(1000) NOT NULL,
    inn CHAR(10) NOT NULL,
    esxn_flag CHAR(1) NOT NULL,
    usn_flag CHAR(1) NOT NULL,
    ausn_flag CHAR(1) NOT NULL,
    srp_flag CHAR(1) NOT NULL,
    CONSTRAINT uq_org_tax_regimes UNIQUE (inn, state_date),
    CONSTRAINT ck_otr_inn CHECK (inn ~ '^\d{10}$'),
    CONSTRAINT ck_otr_flags CHECK (
        esxn_flag IN ('0', '1') AND usn_flag IN ('0', '1') AND ausn_flag IN ('0', '1') AND srp_flag IN ('0', '1')
    ),
    CONSTRAINT ck_otr_any CHECK ('1' IN (esxn_flag, usn_flag, ausn_flag, srp_flag)),
    -- ЕСХН, УСН и АУСН взаимоисключающие (гл. 26.1, 26.2 НК РФ, 17-ФЗ)
    CONSTRAINT ck_otr_exclusive CHECK (esxn_flag::INT + usn_flag::INT + ausn_flag::INT <= 1),
    CONSTRAINT ck_otr_dates CHECK (doc_date > state_date)
);

COMMENT ON TABLE org_tax_regimes IS 'Набор 7707329152-snr, ТипИнф ОТКРДАННЫЕ1';
COMMENT ON COLUMN org_tax_regimes.doc_id IS 'Документ/@ИдДок';
COMMENT ON COLUMN org_tax_regimes.doc_date IS 'Документ/@ДатаДок';
COMMENT ON COLUMN org_tax_regimes.state_date IS 'Документ/@ДатаСост';
COMMENT ON COLUMN org_tax_regimes.org_name IS 'Документ/СведНП/@НаимОрг';
COMMENT ON COLUMN org_tax_regimes.inn IS 'Документ/СведНП/@ИННЮЛ';
COMMENT ON COLUMN org_tax_regimes.esxn_flag IS 'Документ/СведСНР/@ПризнЕСХН: 1 — применяет ЕСХН, 0 — нет';
COMMENT ON COLUMN org_tax_regimes.usn_flag IS 'Документ/СведСНР/@ПризнУСН: 1 — применяет УСН, 0 — нет';
COMMENT ON COLUMN org_tax_regimes.ausn_flag IS 'Документ/СведСНР/@ПризнАУСН: 1 — применяет АУСН, 0 — нет';
COMMENT ON COLUMN org_tax_regimes.srp_flag IS 'Документ/СведСНР/@ПризнСРП: 1 — применяет СРП, 0 — нет';

-- Значения ПризнСНР набора snrip. XSD перечисляет только коды 1–5, расшифровка восстановлена по
-- совместимости режимов в опубликованных данных (УСН и НПД встречаются вместе с ПСН, АУСН — нет).
CREATE TABLE ip_regime_codes (
    code CHAR(1) PRIMARY KEY,
    short_name VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL
);

-- 7707329152-snrip. Сведения о специальных налоговых режимах, применяемых налогоплательщиками (ИП)
CREATE TABLE ip_tax_regimes (
    doc_id UUID PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    doc_date DATE NOT NULL,
    state_date DATE NOT NULL,
    inn CHAR(12) NOT NULL,
    ogrnip CHAR(15) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    first_name VARCHAR(60) NOT NULL,
    middle_name VARCHAR(60),
    CONSTRAINT uq_ip_tax_regimes UNIQUE (ogrnip, state_date),
    CONSTRAINT ck_itr_inn CHECK (inn ~ '^\d{12}$'),
    CONSTRAINT ck_itr_ogrnip CHECK (ogrnip ~ '^3\d{14}$'),
    CONSTRAINT ck_itr_dates CHECK (doc_date > state_date)
);

CREATE TABLE ip_tax_regime_items (
    doc_id UUID NOT NULL REFERENCES ip_tax_regimes (doc_id) ON DELETE CASCADE,
    regime_code CHAR(1) NOT NULL REFERENCES ip_regime_codes (code),
    PRIMARY KEY (doc_id, regime_code)
);

COMMENT ON TABLE ip_tax_regimes IS 'Набор 7707329152-snrip, ТипИнф ОДИПСПЕЦРЕЖИМ';
COMMENT ON COLUMN ip_tax_regimes.doc_id IS 'Документ/@ИдДок';
COMMENT ON COLUMN ip_tax_regimes.doc_date IS 'Документ/@ДатаДок';
COMMENT ON COLUMN ip_tax_regimes.state_date IS 'Документ/@ДатаСост';
COMMENT ON COLUMN ip_tax_regimes.inn IS 'Документ/СведНП/@ИННФЛ';
COMMENT ON COLUMN ip_tax_regimes.ogrnip IS 'Документ/СведНП/@ОГРНИП';
COMMENT ON COLUMN ip_tax_regimes.last_name IS 'Документ/СведНП/ФИО/@Фамилия';
COMMENT ON COLUMN ip_tax_regimes.first_name IS 'Документ/СведНП/ФИО/@Имя';
COMMENT ON COLUMN ip_tax_regimes.middle_name IS 'Документ/СведНП/ФИО/@Отчество';
COMMENT ON TABLE ip_tax_regime_items IS 'Документ/СведСНР, элемент повторяется 1..n раз';
COMMENT ON COLUMN ip_tax_regime_items.regime_code IS 'Документ/СведСНР/@ПризнСНР';

-- 7707329152-paytax. Сведения об уплаченных организацией в календарном году суммах налогов и сборов
-- (без налогов при ввозе товаров в ЕАЭС и сумм, уплаченных налоговым агентом)
CREATE TABLE paid_taxes (
    doc_id UUID PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    doc_date DATE NOT NULL,
    state_date DATE NOT NULL,
    org_name VARCHAR(1000) NOT NULL,
    inn CHAR(10) NOT NULL,
    CONSTRAINT uq_paid_taxes UNIQUE (inn, state_date),
    CONSTRAINT ck_pt_inn CHECK (inn ~ '^\d{10}$'),
    CONSTRAINT ck_pt_dates CHECK (doc_date > state_date)
);

CREATE TABLE paid_tax_items (
    doc_id UUID NOT NULL REFERENCES paid_taxes (doc_id) ON DELETE CASCADE,
    tax_name VARCHAR(1000) NOT NULL,
    paid_amount NUMERIC(19, 2) NOT NULL,
    PRIMARY KEY (doc_id, tax_name)
);

COMMENT ON TABLE paid_taxes IS 'Набор 7707329152-paytax, ТипИнф ОТКРДАННЫЕ4';
COMMENT ON COLUMN paid_taxes.doc_id IS 'Документ/@ИдДок';
COMMENT ON COLUMN paid_taxes.doc_date IS 'Документ/@ДатаДок';
COMMENT ON COLUMN paid_taxes.state_date IS 'Документ/@ДатаСост';
COMMENT ON COLUMN paid_taxes.org_name IS 'Документ/СведНП/@НаимОрг';
COMMENT ON COLUMN paid_taxes.inn IS 'Документ/СведНП/@ИННЮЛ';
COMMENT ON TABLE paid_tax_items IS 'Документ/СвУплСумНал, элемент повторяется 1..n раз';
COMMENT ON COLUMN paid_tax_items.tax_name IS 'Документ/СвУплСумНал/@НаимНалог';
COMMENT ON COLUMN paid_tax_items.paid_amount IS 'Документ/СвУплСумНал/@СумУплНал';

-- 7707329152-debtam. Сведения о суммах задолженности по налогам, сборам, страховым взносам, пеням и штрафам
CREATE TABLE tax_arrears (
    doc_id UUID PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    doc_date DATE NOT NULL,
    state_date DATE NOT NULL,
    org_name VARCHAR(1000) NOT NULL,
    inn CHAR(10) NOT NULL,
    CONSTRAINT uq_tax_arrears UNIQUE (inn, state_date),
    CONSTRAINT ck_ta_inn CHECK (inn ~ '^\d{10}$'),
    CONSTRAINT ck_ta_dates CHECK (doc_date > state_date)
);

CREATE TABLE tax_arrear_items (
    doc_id UUID NOT NULL REFERENCES tax_arrears (doc_id) ON DELETE CASCADE,
    tax_name VARCHAR(1000) NOT NULL,
    arrear_amount NUMERIC(19, 2),
    penalty_amount NUMERIC(19, 2),
    fine_amount NUMERIC(19, 2),
    total_amount NUMERIC(19, 2) NOT NULL,
    PRIMARY KEY (doc_id, tax_name),
    CONSTRAINT ck_tai_amounts CHECK (
        COALESCE(arrear_amount, 0) >= 0 AND COALESCE(penalty_amount, 0) >= 0 AND COALESCE(fine_amount, 0) >= 0
        AND total_amount > 0
        AND total_amount = COALESCE(arrear_amount, 0) + COALESCE(penalty_amount, 0) + COALESCE(fine_amount, 0)
    )
);

COMMENT ON TABLE tax_arrears IS 'Набор 7707329152-debtam, ТипИнф ОТКРДАННЫЕ6';
COMMENT ON COLUMN tax_arrears.doc_id IS 'Документ/@ИдДок';
COMMENT ON COLUMN tax_arrears.doc_date IS 'Документ/@ДатаДок';
COMMENT ON COLUMN tax_arrears.state_date IS 'Документ/@ДатаСост';
COMMENT ON COLUMN tax_arrears.org_name IS 'Документ/СведНП/@НаимОрг';
COMMENT ON COLUMN tax_arrears.inn IS 'Документ/СведНП/@ИННЮЛ';
COMMENT ON TABLE tax_arrear_items IS 'Документ/СведНедоим, элемент повторяется 1..n раз';
COMMENT ON COLUMN tax_arrear_items.tax_name IS 'Документ/СведНедоим/@НаимНалог';
COMMENT ON COLUMN tax_arrear_items.arrear_amount IS 'Документ/СведНедоим/@СумНедНалог';
COMMENT ON COLUMN tax_arrear_items.penalty_amount IS 'Документ/СведНедоим/@СумПени';
COMMENT ON COLUMN tax_arrear_items.fine_amount IS 'Документ/СведНедоим/@СумШтраф';
COMMENT ON COLUMN tax_arrear_items.total_amount IS 'Документ/СведНедоим/@ОбщСумНедоим';

-- 7707329152-taxoffence. Сведения о налоговых правонарушениях и мерах ответственности за их совершение
CREATE TABLE tax_offences (
    doc_id UUID PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    doc_date DATE NOT NULL,
    state_date DATE NOT NULL,
    org_name VARCHAR(1000) NOT NULL,
    inn CHAR(10) NOT NULL,
    fine_amount NUMERIC(19, 2) NOT NULL,
    CONSTRAINT uq_tax_offences UNIQUE (inn, state_date),
    CONSTRAINT ck_to_inn CHECK (inn ~ '^\d{10}$'),
    CONSTRAINT ck_to_fine CHECK (fine_amount > 0),
    CONSTRAINT ck_to_dates CHECK (doc_date > state_date)
);

COMMENT ON TABLE tax_offences IS 'Набор 7707329152-taxoffence, ТипИнф ОТКРДАННЫЕ7';
COMMENT ON COLUMN tax_offences.doc_id IS 'Документ/@ИдДок';
COMMENT ON COLUMN tax_offences.doc_date IS 'Документ/@ДатаДок';
COMMENT ON COLUMN tax_offences.state_date IS 'Документ/@ДатаСост';
COMMENT ON COLUMN tax_offences.org_name IS 'Документ/СведНП/@НаимОрг';
COMMENT ON COLUMN tax_offences.inn IS 'Документ/СведНП/@ИННЮЛ';
COMMENT ON COLUMN tax_offences.fine_amount IS 'Документ/СведНаруш/@СумШтраф';

-- 7707329152-revexp. Сведения о суммах доходов и расходов по данным бухгалтерской (финансовой) отчетности
CREATE TABLE revenue_expenses (
    doc_id UUID PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    doc_date DATE NOT NULL,
    state_date DATE NOT NULL,
    org_name VARCHAR(1000) NOT NULL,
    inn CHAR(10) NOT NULL,
    revenue NUMERIC(19, 2) NOT NULL,
    expenses NUMERIC(19, 2) NOT NULL,
    CONSTRAINT uq_revenue_expenses UNIQUE (inn, state_date),
    CONSTRAINT ck_re_inn CHECK (inn ~ '^\d{10}$'),
    CONSTRAINT ck_re_amounts CHECK (revenue >= 0 AND expenses >= 0),
    CONSTRAINT ck_re_dates CHECK (doc_date > state_date)
);

COMMENT ON TABLE revenue_expenses IS 'Набор 7707329152-revexp, ТипИнф ОТКРДАННЫЕ5';
COMMENT ON COLUMN revenue_expenses.doc_id IS 'Документ/@ИдДок';
COMMENT ON COLUMN revenue_expenses.doc_date IS 'Документ/@ДатаДок';
COMMENT ON COLUMN revenue_expenses.state_date IS 'Документ/@ДатаСост';
COMMENT ON COLUMN revenue_expenses.org_name IS 'Документ/СведНП/@НаимОрг';
COMMENT ON COLUMN revenue_expenses.inn IS 'Документ/СведНП/@ИННЮЛ';
COMMENT ON COLUMN revenue_expenses.revenue IS 'Документ/СведДохРасх/@СумДоход';
COMMENT ON COLUMN revenue_expenses.expenses IS 'Документ/СведДохРасх/@СумРасход';

-- Коды ВидСубМСП и КатСубМСП (ст. 4 209-ФЗ)
CREATE TABLE msp_subject_kinds (
    code CHAR(1) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE msp_categories (
    code CHAR(1) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

-- 7707329152-rsmp. Единый реестр субъектов малого и среднего предпринимательства (формат 4.06)
CREATE TABLE msp_subjects (
    doc_id UUID PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    state_date DATE NOT NULL,
    inclusion_date DATE NOT NULL,
    subject_kind CHAR(1) NOT NULL REFERENCES msp_subject_kinds (code),
    category CHAR(1) NOT NULL REFERENCES msp_categories (code),
    new_subject_flag CHAR(1) NOT NULL,
    social_enterprise_flag CHAR(1) NOT NULL,
    headcount INTEGER,
    org_name VARCHAR(1000),
    org_short_name VARCHAR(500),
    org_inn CHAR(10),
    ogrn CHAR(13),
    ip_inn CHAR(12),
    ogrnip CHAR(15),
    ip_last_name VARCHAR(60),
    ip_first_name VARCHAR(60),
    ip_middle_name VARCHAR(60),
    region_code CHAR(2) NOT NULL,
    region_type VARCHAR(50),
    region_name VARCHAR(255),
    district_type VARCHAR(50),
    district_name VARCHAR(255),
    city_type VARCHAR(50),
    city_name VARCHAR(255),
    locality_type VARCHAR(50),
    locality_name VARCHAR(255),
    CONSTRAINT ck_msp_flags CHECK (new_subject_flag IN ('1', '2') AND social_enterprise_flag IN ('1', '2')),
    CONSTRAINT ck_msp_dates CHECK (inclusion_date <= state_date),
    CONSTRAINT ck_msp_headcount CHECK (headcount IS NULL OR headcount >= 0),
    CONSTRAINT ck_msp_region CHECK (region_code ~ '^\d{2}$'),
    -- ВидСубМСП 1 — блок ОргВклМСП, 2 и 3 — блок ИПВклМСП
    CONSTRAINT ck_msp_subject CHECK (
        (subject_kind = '1' AND org_name IS NOT NULL AND org_inn ~ '^\d{10}$' AND ogrn ~ '^[15]\d{12}$'
            AND ip_inn IS NULL AND ogrnip IS NULL AND ip_last_name IS NULL AND ip_first_name IS NULL AND ip_middle_name IS NULL)
        OR (subject_kind IN ('2', '3') AND ip_inn ~ '^\d{12}$' AND ogrnip ~ '^3\d{14}$'
            AND org_name IS NULL AND org_short_name IS NULL AND org_inn IS NULL AND ogrn IS NULL AND headcount IS NULL)
    )
);
CREATE UNIQUE INDEX uq_msp_org ON msp_subjects (org_inn, state_date) WHERE org_inn IS NOT NULL;
CREATE UNIQUE INDEX uq_msp_ip ON msp_subjects (ip_inn, state_date) WHERE ip_inn IS NOT NULL;

COMMENT ON TABLE msp_subjects IS 'Набор 7707329152-rsmp, ТипИнф РЕЕСТРМСП';
COMMENT ON COLUMN msp_subjects.doc_id IS 'Документ/@ИдДок';
COMMENT ON COLUMN msp_subjects.state_date IS 'Документ/@ДатаСост';
COMMENT ON COLUMN msp_subjects.inclusion_date IS 'Документ/@ДатаВклМСП';
COMMENT ON COLUMN msp_subjects.subject_kind IS 'Документ/@ВидСубМСП';
COMMENT ON COLUMN msp_subjects.category IS 'Документ/@КатСубМСП';
COMMENT ON COLUMN msp_subjects.new_subject_flag IS 'Документ/@ПризНовМСП: 1 — вновь созданное ЮЛ / вновь зарегистрированный ИП, 2 — нет';
COMMENT ON COLUMN msp_subjects.social_enterprise_flag IS 'Документ/@СведСоцПред: 1 — социальное предприятие, 2 — нет';
COMMENT ON COLUMN msp_subjects.headcount IS 'Документ/@ССЧР';
COMMENT ON COLUMN msp_subjects.org_name IS 'Документ/ОргВклМСП/@НаимОрг';
COMMENT ON COLUMN msp_subjects.org_short_name IS 'Документ/ОргВклМСП/@НаимОргСокр';
COMMENT ON COLUMN msp_subjects.org_inn IS 'Документ/ОргВклМСП/@ИННЮЛ';
COMMENT ON COLUMN msp_subjects.ogrn IS 'Документ/ОргВклМСП/@ОГРН';
COMMENT ON COLUMN msp_subjects.ip_inn IS 'Документ/ИПВклМСП/@ИННФЛ';
COMMENT ON COLUMN msp_subjects.ogrnip IS 'Документ/ИПВклМСП/@ОГРНИП';
COMMENT ON COLUMN msp_subjects.ip_last_name IS 'Документ/ИПВклМСП/ФИОИП/@Фамилия';
COMMENT ON COLUMN msp_subjects.ip_first_name IS 'Документ/ИПВклМСП/ФИОИП/@Имя';
COMMENT ON COLUMN msp_subjects.ip_middle_name IS 'Документ/ИПВклМСП/ФИОИП/@Отчество';
COMMENT ON COLUMN msp_subjects.region_code IS 'Документ/СведМН/@КодРегион';
COMMENT ON COLUMN msp_subjects.region_type IS 'Документ/СведМН/Регион/@Тип';
COMMENT ON COLUMN msp_subjects.region_name IS 'Документ/СведМН/Регион/@Наим';
COMMENT ON COLUMN msp_subjects.district_type IS 'Документ/СведМН/Район/@Тип';
COMMENT ON COLUMN msp_subjects.district_name IS 'Документ/СведМН/Район/@Наим';
COMMENT ON COLUMN msp_subjects.city_type IS 'Документ/СведМН/Город/@Тип';
COMMENT ON COLUMN msp_subjects.city_name IS 'Документ/СведМН/Город/@Наим';
COMMENT ON COLUMN msp_subjects.locality_type IS 'Документ/СведМН/НаселПункт/@Тип';
COMMENT ON COLUMN msp_subjects.locality_name IS 'Документ/СведМН/НаселПункт/@Наим';

CREATE TABLE msp_okved (
    doc_id UUID NOT NULL REFERENCES msp_subjects (doc_id) ON DELETE CASCADE,
    source VARCHAR(10) NOT NULL,
    okved_code VARCHAR(8) NOT NULL,
    okved_name VARCHAR(1000),
    okved_version CHAR(4) NOT NULL,
    is_main BOOLEAN NOT NULL,
    PRIMARY KEY (doc_id, source, okved_code),
    CONSTRAINT ck_msp_okved_source CHECK (source IN ('APPLICANT', 'REPORTING')),
    CONSTRAINT ck_msp_okved_code CHECK (okved_code ~ '^\d{2}(\.\d{1,2}){0,2}$'),
    CONSTRAINT ck_msp_okved_version CHECK (okved_version IN ('2001', '2014'))
);
CREATE UNIQUE INDEX uq_msp_okved_main ON msp_okved (doc_id, source) WHERE is_main;

COMMENT ON TABLE msp_okved IS 'Документ/СвОКВЭД (APPLICANT) и Документ/СвОКВЭДотч (REPORTING)';
COMMENT ON COLUMN msp_okved.is_main IS 'true — СвОКВЭДОсн, false — СвОКВЭДДоп';
COMMENT ON COLUMN msp_okved.okved_code IS 'СвОКВЭДОсн|СвОКВЭДДоп/@КодОКВЭД';
COMMENT ON COLUMN msp_okved.okved_name IS 'СвОКВЭДОсн|СвОКВЭДДоп/@НаимОКВЭД';
COMMENT ON COLUMN msp_okved.okved_version IS 'СвОКВЭДОсн|СвОКВЭДДоп/@ВерсОКВЭД';

CREATE TABLE msp_licenses (
    doc_id UUID NOT NULL REFERENCES msp_subjects (doc_id) ON DELETE CASCADE,
    license_no SMALLINT NOT NULL,
    series VARCHAR(10),
    number VARCHAR(100),
    kind VARCHAR(10),
    license_date DATE,
    start_date DATE,
    end_date DATE,
    issuer_name VARCHAR(500),
    suspension_date DATE,
    suspension_issuer VARCHAR(500),
    PRIMARY KEY (doc_id, license_no),
    CONSTRAINT ck_msp_lic_susp CHECK ((suspension_date IS NULL) = (suspension_issuer IS NULL))
);

CREATE TABLE msp_license_activities (
    doc_id UUID NOT NULL,
    license_no SMALLINT NOT NULL,
    activity_name VARCHAR(1000) NOT NULL,
    PRIMARY KEY (doc_id, license_no, activity_name),
    FOREIGN KEY (doc_id, license_no) REFERENCES msp_licenses (doc_id, license_no) ON DELETE CASCADE
);

COMMENT ON TABLE msp_licenses IS 'Документ/СвЛиценз, license_no — порядковый номер элемента';
COMMENT ON COLUMN msp_licenses.series IS 'Документ/СвЛиценз/@СерЛиценз';
COMMENT ON COLUMN msp_licenses.number IS 'Документ/СвЛиценз/@НомЛиценз';
COMMENT ON COLUMN msp_licenses.kind IS 'Документ/СвЛиценз/@ВидЛиценз';
COMMENT ON COLUMN msp_licenses.license_date IS 'Документ/СвЛиценз/@ДатаЛиценз';
COMMENT ON COLUMN msp_licenses.start_date IS 'Документ/СвЛиценз/@ДатаНачЛиценз';
COMMENT ON COLUMN msp_licenses.end_date IS 'Документ/СвЛиценз/@ДатаКонЛиценз';
COMMENT ON COLUMN msp_licenses.issuer_name IS 'Документ/СвЛиценз/@ОргВыдЛиценз';
COMMENT ON COLUMN msp_licenses.suspension_date IS 'Документ/СвЛиценз/@ДатаОстЛиценз';
COMMENT ON COLUMN msp_licenses.suspension_issuer IS 'Документ/СвЛиценз/@ОргОстЛиценз';
COMMENT ON COLUMN msp_license_activities.activity_name IS 'Документ/СвЛиценз/НаимЛицВД';

CREATE TABLE msp_products (
    doc_id UUID NOT NULL REFERENCES msp_subjects (doc_id) ON DELETE CASCADE,
    product_code VARCHAR(18) NOT NULL,
    product_name VARCHAR(1000) NOT NULL,
    innovative_flag CHAR(1) NOT NULL,
    PRIMARY KEY (doc_id, product_code),
    CONSTRAINT ck_msp_prod_flag CHECK (innovative_flag IN ('1', '2'))
);

COMMENT ON TABLE msp_products IS 'Документ/СвПрод';
COMMENT ON COLUMN msp_products.product_code IS 'Документ/СвПрод/@КодПрод (ОКПД2)';
COMMENT ON COLUMN msp_products.product_name IS 'Документ/СвПрод/@НаимПрод';
COMMENT ON COLUMN msp_products.innovative_flag IS 'Документ/СвПрод/@ПрОтнПрод: 1 — инновационная, высокотехнологичная, 2 — нет';

CREATE TABLE msp_partnerships (
    doc_id UUID NOT NULL REFERENCES msp_subjects (doc_id) ON DELETE CASCADE,
    customer_name VARCHAR(1000),
    customer_inn CHAR(10) NOT NULL,
    contract_number VARCHAR(60),
    contract_date DATE NOT NULL,
    PRIMARY KEY (doc_id, customer_inn),
    CONSTRAINT ck_msp_pp_inn CHECK (customer_inn ~ '^\d{10}$')
);

COMMENT ON TABLE msp_partnerships IS 'Документ/СвПрогПарт';
COMMENT ON COLUMN msp_partnerships.customer_name IS 'Документ/СвПрогПарт/@НаимЮЛ_ПП';
COMMENT ON COLUMN msp_partnerships.customer_inn IS 'Документ/СвПрогПарт/@ИННЮЛ_ПП';
COMMENT ON COLUMN msp_partnerships.contract_number IS 'Документ/СвПрогПарт/@НомДог';
COMMENT ON COLUMN msp_partnerships.contract_date IS 'Документ/СвПрогПарт/@ДатаДог';

-- 7707329152-rsmppp. Единый реестр субъектов МСП — получателей поддержки (формат 4.04)
CREATE TABLE msp_support_recipients (
    doc_id UUID PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    state_date DATE NOT NULL,
    org_name VARCHAR(1000),
    org_inn CHAR(10),
    ogrn CHAR(13),
    person_inn CHAR(12),
    ogrnip CHAR(15),
    last_name VARCHAR(60),
    first_name VARCHAR(60),
    middle_name VARCHAR(60),
    -- СвЮЛ или СвФЛ: ровно один блок
    CONSTRAINT ck_mspr_subject CHECK (
        (org_name IS NOT NULL AND org_inn ~ '^\d{10}$' AND ogrn ~ '^[15]\d{12}$'
            AND person_inn IS NULL AND ogrnip IS NULL AND last_name IS NULL AND first_name IS NULL AND middle_name IS NULL)
        OR (person_inn ~ '^\d{12}$' AND (ogrnip IS NULL OR ogrnip ~ '^3\d{14}$')
            AND org_name IS NULL AND org_inn IS NULL AND ogrn IS NULL)
    )
);

COMMENT ON TABLE msp_support_recipients IS 'Набор 7707329152-rsmppp, ТипИнф РЕЕСТРМСП-ПП';
COMMENT ON COLUMN msp_support_recipients.doc_id IS 'Документ/@ИдДок';
COMMENT ON COLUMN msp_support_recipients.state_date IS 'Документ/@ДатаСост';
COMMENT ON COLUMN msp_support_recipients.org_name IS 'Документ/СвЮЛ/@НаимОрг';
COMMENT ON COLUMN msp_support_recipients.org_inn IS 'Документ/СвЮЛ/@ИННЮЛ';
COMMENT ON COLUMN msp_support_recipients.ogrn IS 'Документ/СвЮЛ/@ОГРН';
COMMENT ON COLUMN msp_support_recipients.person_inn IS 'Документ/СвФЛ/@ИННФЛ';
COMMENT ON COLUMN msp_support_recipients.ogrnip IS 'Документ/СвФЛ/@ОГРНИП';
COMMENT ON COLUMN msp_support_recipients.last_name IS 'Документ/СвФЛ/ФИО/@Фамилия';
COMMENT ON COLUMN msp_support_recipients.first_name IS 'Документ/СвФЛ/ФИО/@Имя';
COMMENT ON COLUMN msp_support_recipients.middle_name IS 'Документ/СвФЛ/ФИО/@Отчество';

CREATE TABLE msp_supports (
    doc_id UUID NOT NULL REFERENCES msp_support_recipients (doc_id) ON DELETE CASCADE,
    support_number VARCHAR(36) NOT NULL,
    info_date DATE NOT NULL,
    update_date DATE,
    recipient_kind CHAR(1) NOT NULL,
    provider_name VARCHAR(1000) NOT NULL,
    provider_inn CHAR(10) NOT NULL,
    category CHAR(1) NOT NULL,
    support_term DATE NOT NULL,
    decision_date DATE NOT NULL,
    termination_date DATE,
    violation_flag CHAR(1) NOT NULL,
    form_code CHAR(4) NOT NULL,
    form_name VARCHAR(100) NOT NULL,
    kind_code CHAR(4) NOT NULL,
    kind_name VARCHAR(200) NOT NULL,
    PRIMARY KEY (doc_id, support_number),
    CONSTRAINT ck_msps_codes CHECK (
        recipient_kind IN ('1', '2', '3', '4') AND category IN ('1', '2', '3', '4') AND violation_flag IN ('1', '2')
    ),
    CONSTRAINT ck_msps_inn CHECK (provider_inn ~ '^\d{10}$'),
    CONSTRAINT ck_msps_kind CHECK (left(kind_code, 2) = left(form_code, 2)),
    CONSTRAINT ck_msps_dates CHECK (decision_date <= info_date AND (update_date IS NULL OR update_date >= info_date))
);

COMMENT ON TABLE msp_supports IS 'Документ/СвПредПод, элемент повторяется 1..n раз';
COMMENT ON COLUMN msp_supports.support_number IS 'Документ/СвПредПод/@НомерПод';
COMMENT ON COLUMN msp_supports.info_date IS 'Документ/СвПредПод/@ДатаСвед';
COMMENT ON COLUMN msp_supports.update_date IS 'Документ/СвПредПод/@ДатаОбнов';
COMMENT ON COLUMN msp_supports.recipient_kind IS 'Документ/СвПредПод/@ВидПП: 1 — ЮЛ, 2 — ИП, 3 — физлицо, применяющее НПД, 4 — глава КФХ';
COMMENT ON COLUMN msp_supports.provider_name IS 'Документ/СвПредПод/@НаимОрг';
COMMENT ON COLUMN msp_supports.provider_inn IS 'Документ/СвПредПод/@ИННЮЛ';
COMMENT ON COLUMN msp_supports.category IS 'Документ/СвПредПод/@КатСуб: 1 — микро, 2 — малое, 3 — среднее, 4 — физлицо, применяющее НПД';
COMMENT ON COLUMN msp_supports.support_term IS 'Документ/СвПредПод/@СрокПод';
COMMENT ON COLUMN msp_supports.decision_date IS 'Документ/СвПредПод/@ДатаПрин';
COMMENT ON COLUMN msp_supports.termination_date IS 'Документ/СвПредПод/@ДатаПрекр';
COMMENT ON COLUMN msp_supports.violation_flag IS 'Документ/СвПредПод/@ИнфНаруш: 1 — есть нарушение, 2 — нет';
COMMENT ON COLUMN msp_supports.form_code IS 'Документ/СвПредПод/ФормПод/@КодФорм';
COMMENT ON COLUMN msp_supports.form_name IS 'Документ/СвПредПод/ФормПод/@НаимФорм';
COMMENT ON COLUMN msp_supports.kind_code IS 'Документ/СвПредПод/ВидПод/@КодВид';
COMMENT ON COLUMN msp_supports.kind_name IS 'Документ/СвПредПод/ВидПод/@НаимВид';

CREATE TABLE msp_support_amounts (
    doc_id UUID NOT NULL,
    support_number VARCHAR(36) NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    unit_code CHAR(1) NOT NULL,
    PRIMARY KEY (doc_id, support_number, unit_code),
    FOREIGN KEY (doc_id, support_number) REFERENCES msp_supports (doc_id, support_number) ON DELETE CASCADE,
    CONSTRAINT ck_mspa CHECK (amount > 0 AND unit_code IN ('1', '2', '3', '4', '5'))
);

COMMENT ON TABLE msp_support_amounts IS 'Документ/СвПредПод/РазмПод';
COMMENT ON COLUMN msp_support_amounts.amount IS 'Документ/СвПредПод/РазмПод/@РазмПод';
COMMENT ON COLUMN msp_support_amounts.unit_code IS 'Документ/СвПредПод/РазмПод/@ЕдПод: 1 — рубль (финансовая и имущественная поддержка), 3 — час (консультации, обучение)';

CREATE TABLE msp_support_violations (
    doc_id UUID NOT NULL,
    support_number VARCHAR(36) NOT NULL,
    violation_no SMALLINT NOT NULL,
    violation_kind CHAR(1) NOT NULL,
    violation_date DATE,
    fix_deadline DATE,
    fixed_date DATE,
    PRIMARY KEY (doc_id, support_number, violation_no),
    FOREIGN KEY (doc_id, support_number) REFERENCES msp_supports (doc_id, support_number) ON DELETE CASCADE,
    CONSTRAINT ck_mspv_kind CHECK (violation_kind IN ('1', '2'))
);

COMMENT ON TABLE msp_support_violations IS 'Документ/СвПредПод/Нарушения';
COMMENT ON COLUMN msp_support_violations.violation_kind IS 'Документ/СвПредПод/Нарушения/@ВидНаруш';
COMMENT ON COLUMN msp_support_violations.violation_date IS 'Документ/СвПредПод/Нарушения/@ДатаНаруш';
COMMENT ON COLUMN msp_support_violations.fix_deadline IS 'Документ/СвПредПод/Нарушения/@СрокНаруш';
COMMENT ON COLUMN msp_support_violations.fixed_date IS 'Документ/СвПредПод/Нарушения/@ДатаУстрНаруш';

CREATE TABLE msp_support_documents (
    doc_id UUID NOT NULL,
    support_number VARCHAR(36) NOT NULL,
    document_no SMALLINT NOT NULL,
    document_kind VARCHAR(100),
    document_type VARCHAR(100),
    authority VARCHAR(1000),
    document_date DATE,
    document_number VARCHAR(1000),
    document_name VARCHAR(2000),
    PRIMARY KEY (doc_id, support_number, document_no),
    FOREIGN KEY (doc_id, support_number) REFERENCES msp_supports (doc_id, support_number) ON DELETE CASCADE
);

COMMENT ON TABLE msp_support_documents IS 'Документ/СвПредПод/РегДок';
COMMENT ON COLUMN msp_support_documents.document_kind IS 'Документ/СвПредПод/РегДок/@ВидРД';
COMMENT ON COLUMN msp_support_documents.document_type IS 'Документ/СвПредПод/РегДок/@ТипРД';
COMMENT ON COLUMN msp_support_documents.authority IS 'Документ/СвПредПод/РегДок/@ОрганРД';
COMMENT ON COLUMN msp_support_documents.document_date IS 'Документ/СвПредПод/РегДок/@ДатаРД';
COMMENT ON COLUMN msp_support_documents.document_number IS 'Документ/СвПредПод/РегДок/@НомерРД';
COMMENT ON COLUMN msp_support_documents.document_name IS 'Документ/СвПредПод/РегДок/@НаимРД';

-- 7707329152-registerdisqualified. Реестр дисквалифицированных лиц (CSV, structure-20150624)
CREATE TABLE disqualified_persons (
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    record_number VARCHAR(20) NOT NULL,
    full_name VARCHAR(500) NOT NULL,
    birth_date DATE NOT NULL,
    birth_place VARCHAR(500),
    org_name VARCHAR(1000) NOT NULL,
    org_inn VARCHAR(12),
    position VARCHAR(500) NOT NULL,
    koap_article VARCHAR(200) NOT NULL,
    protocol_authority VARCHAR(500) NOT NULL,
    judge_name VARCHAR(200) NOT NULL,
    judge_position VARCHAR(200) NOT NULL,
    disqualification_term VARCHAR(30) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    PRIMARY KEY (file_id, record_number),
    CONSTRAINT ck_dq_inn CHECK (org_inn IS NULL OR org_inn ~ '^(\d{10}|\d{12})$'),
    CONSTRAINT ck_dq_term CHECK (disqualification_term ~ '^\d+ г \d+ м \d+ д$'),
    CONSTRAINT ck_dq_dates CHECK (end_date > start_date)
);

COMMENT ON TABLE disqualified_persons IS 'Набор 7707329152-registerdisqualified. Колонки файла G1..G14 = поля структуры GA, GB, G1..G12';
COMMENT ON COLUMN disqualified_persons.record_number IS 'GA — номер записи РДЛ';
COMMENT ON COLUMN disqualified_persons.full_name IS 'GB — ФИО';
COMMENT ON COLUMN disqualified_persons.birth_date IS 'G1 — дата рождения ФЛ';
COMMENT ON COLUMN disqualified_persons.birth_place IS 'G2 — место рождения ФЛ';
COMMENT ON COLUMN disqualified_persons.org_name IS 'G3 — организация, где ФЛ работало во время правонарушения';
COMMENT ON COLUMN disqualified_persons.org_inn IS 'G4 — ИНН организации';
COMMENT ON COLUMN disqualified_persons.position IS 'G5 — должность во время правонарушения';
COMMENT ON COLUMN disqualified_persons.koap_article IS 'G6 — статья КоАП РФ';
COMMENT ON COLUMN disqualified_persons.protocol_authority IS 'G7 — орган, составивший протокол';
COMMENT ON COLUMN disqualified_persons.judge_name IS 'G8 — ФИО судьи';
COMMENT ON COLUMN disqualified_persons.judge_position IS 'G9 — должность судьи';
COMMENT ON COLUMN disqualified_persons.disqualification_term IS 'G10 — срок дисквалификации, в файле вида «1 г 8 м 0 д»';
COMMENT ON COLUMN disqualified_persons.start_date IS 'G11 — дата начала';
COMMENT ON COLUMN disqualified_persons.end_date IS 'G12 — дата окончания';

-- 7707329152-disqualifiedpersons. ЮЛ, в состав исполнительных органов которых входят дисквалифицированные лица
CREATE TABLE orgs_with_disqualified (
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    full_name VARCHAR(256) NOT NULL,
    ogrn CHAR(13) NOT NULL,
    inn VARCHAR(12) NOT NULL,
    kpp CHAR(9) NOT NULL,
    address VARCHAR(124) NOT NULL,
    PRIMARY KEY (file_id, ogrn),
    CONSTRAINT ck_owd_ids CHECK (ogrn ~ '^[15]\d{12}$' AND inn ~ '^\d{10}$' AND kpp ~ '^\d{9}$')
);

COMMENT ON TABLE orgs_with_disqualified IS 'Набор 7707329152-disqualifiedpersons';
COMMENT ON COLUMN orgs_with_disqualified.full_name IS 'G1 — полное наименование ЮЛ';
COMMENT ON COLUMN orgs_with_disqualified.ogrn IS 'G2 — ОГРН';
COMMENT ON COLUMN orgs_with_disqualified.inn IS 'G3 — ИНН';
COMMENT ON COLUMN orgs_with_disqualified.kpp IS 'G4 — КПП';
COMMENT ON COLUMN orgs_with_disqualified.address IS 'G5 — адрес: индекс,регион,район,город,нас. пункт,улица,дом,корпус,помещение';

-- 7707329152-massleaders. ФЛ, являющиеся руководителями нескольких ЮЛ
CREATE TABLE mass_leaders (
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    row_no INTEGER NOT NULL,
    inn VARCHAR(12),
    last_name VARCHAR(256) NOT NULL,
    first_name VARCHAR(256) NOT NULL,
    middle_name VARCHAR(256),
    org_count INTEGER NOT NULL,
    PRIMARY KEY (file_id, row_no),
    CONSTRAINT ck_ml_inn CHECK (inn IS NULL OR inn ~ '^\d{12}$'),
    CONSTRAINT ck_ml_count CHECK (org_count >= 10)
);

COMMENT ON TABLE mass_leaders IS 'Набор 7707329152-massleaders, row_no — номер строки файла';
COMMENT ON COLUMN mass_leaders.inn IS 'G1 — ИНН (при наличии)';
COMMENT ON COLUMN mass_leaders.last_name IS 'G2 — фамилия ФЛ';
COMMENT ON COLUMN mass_leaders.first_name IS 'G3 — имя ФЛ';
COMMENT ON COLUMN mass_leaders.middle_name IS 'G4 — отчество ФЛ';
COMMENT ON COLUMN mass_leaders.org_count IS 'G5 — количество ЮЛ, где ФЛ является руководителем';

-- 7707329152-massfounders. ФЛ, являющиеся учредителями (участниками) нескольких ЮЛ
CREATE TABLE mass_founders (
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    row_no INTEGER NOT NULL,
    inn VARCHAR(12),
    last_name VARCHAR(256) NOT NULL,
    first_name VARCHAR(256) NOT NULL,
    middle_name VARCHAR(256),
    org_count INTEGER NOT NULL,
    PRIMARY KEY (file_id, row_no),
    CONSTRAINT ck_mf_inn CHECK (inn IS NULL OR inn ~ '^\d{12}$'),
    CONSTRAINT ck_mf_count CHECK (org_count >= 10)
);

COMMENT ON TABLE mass_founders IS 'Набор 7707329152-massfounders, row_no — номер строки файла';
COMMENT ON COLUMN mass_founders.inn IS 'G1 — ИНН (при наличии)';
COMMENT ON COLUMN mass_founders.last_name IS 'G2 — фамилия ФЛ';
COMMENT ON COLUMN mass_founders.first_name IS 'G3 — имя ФЛ';
COMMENT ON COLUMN mass_founders.middle_name IS 'G4 — отчество ФЛ';
COMMENT ON COLUMN mass_founders.org_count IS 'G5 — количество ЮЛ, где ФЛ является учредителем (участником)';

-- 7707329152-masaddress. Адреса, указанные при госрегистрации местом нахождения несколькими ЮЛ
CREATE TABLE mass_addresses (
    file_id VARCHAR(255) NOT NULL REFERENCES releases (file_id),
    row_no INTEGER NOT NULL,
    region VARCHAR(150) NOT NULL,
    district VARCHAR(150),
    city VARCHAR(150),
    locality VARCHAR(150),
    street VARCHAR(150),
    house VARCHAR(4),
    building VARCHAR(4),
    flat VARCHAR(4),
    org_count INTEGER NOT NULL,
    PRIMARY KEY (file_id, row_no),
    CONSTRAINT ck_ma_count CHECK (org_count >= 10)
);

COMMENT ON TABLE mass_addresses IS 'Набор 7707329152-masaddress, row_no — номер строки файла';
COMMENT ON COLUMN mass_addresses.region IS 'G1 — регион';
COMMENT ON COLUMN mass_addresses.district IS 'G2 — район';
COMMENT ON COLUMN mass_addresses.city IS 'G3 — город';
COMMENT ON COLUMN mass_addresses.locality IS 'G4 — населенный пункт';
COMMENT ON COLUMN mass_addresses.street IS 'G5 — улица';
COMMENT ON COLUMN mass_addresses.house IS 'G6 — номер дома';
COMMENT ON COLUMN mass_addresses.building IS 'G7 — номер корпуса';
COMMENT ON COLUMN mass_addresses.flat IS 'G8 — квартира (офис)';
COMMENT ON COLUMN mass_addresses.org_count IS 'G9 — количество ЮЛ, зарегистрированных по адресу';

-- Признаки из карточки «Прозрачного бизнеса», перенесенные туда из выведенного из эксплуатации сервиса
-- «Сведения о юридических лицах, имеющих задолженность по уплате налогов и/или не представляющих налоговую
-- отчетность более года» (service.nalog.ru/zd.do). Отдельного набора открытых данных и XSD у этих сведений нет,
-- поэтому колонки повторяют формулировки сервиса, а не элементы файла. В таблицу попадает ЮЛ хотя бы с одним признаком.
CREATE TABLE debt_and_reporting_flags (
    inn CHAR(10) NOT NULL,
    state_date DATE NOT NULL,
    ogrn CHAR(13) NOT NULL,
    org_name VARCHAR(1000) NOT NULL,
    has_bailiff_debt BOOLEAN NOT NULL,
    no_reporting_over_year BOOLEAN NOT NULL,
    PRIMARY KEY (inn, state_date),
    CONSTRAINT ck_drf_ids CHECK (inn ~ '^\d{10}$' AND ogrn ~ '^[15]\d{12}$'),
    CONSTRAINT ck_drf_any CHECK (has_bailiff_debt OR no_reporting_over_year)
);

COMMENT ON TABLE debt_and_reporting_flags IS 'Признаки «Прозрачного бизнеса» (бывший сервис ЗД); официального формата открытых данных нет';
COMMENT ON COLUMN debt_and_reporting_flags.state_date IS 'Дата, по состоянию на которую сформированы сведения';
COMMENT ON COLUMN debt_and_reporting_flags.has_bailiff_debt IS 'Имеет задолженность по уплате налогов, превышающую 1000 рублей, которая направлена на взыскание судебному приставу-исполнителю';
COMMENT ON COLUMN debt_and_reporting_flags.no_reporting_over_year IS 'Не представляет налоговую отчетность более года';

CREATE INDEX ix_headcount_inn ON headcount (inn);
CREATE INDEX ix_revexp_inn ON revenue_expenses (inn);
CREATE INDEX ix_paid_taxes_inn ON paid_taxes (inn);
CREATE INDEX ix_tax_arrears_inn ON tax_arrears (inn);
CREATE INDEX ix_tax_offences_inn ON tax_offences (inn);
CREATE INDEX ix_org_tax_regimes_inn ON org_tax_regimes (inn);
CREATE INDEX ix_ip_tax_regimes_inn ON ip_tax_regimes (inn);
CREATE INDEX ix_mspr_org_inn ON msp_support_recipients (org_inn);
CREATE INDEX ix_mspr_person_inn ON msp_support_recipients (person_inn);
CREATE INDEX ix_dq_org_inn ON disqualified_persons (org_inn);
CREATE INDEX ix_ml_inn ON mass_leaders (inn);
CREATE INDEX ix_mf_inn ON mass_founders (inn);

-- Карточка организации, как в «Прозрачном бизнесе»: последние значения каждого набора по ИНН
CREATE VIEW v_org_card AS
WITH inns AS (
    SELECT inn FROM headcount UNION SELECT inn FROM revenue_expenses UNION SELECT inn FROM paid_taxes
    UNION SELECT inn FROM tax_arrears UNION SELECT inn FROM tax_offences UNION SELECT inn FROM org_tax_regimes
    UNION SELECT org_inn FROM msp_subjects WHERE org_inn IS NOT NULL
    UNION SELECT inn FROM debt_and_reporting_flags
)
SELECT
    i.inn,
    hc.state_date AS headcount_date,
    hc.employee_count,
    re.state_date AS revexp_date,
    re.revenue,
    re.expenses,
    re.revenue - re.expenses AS profit,
    pt.state_date AS paid_taxes_date,
    (SELECT sum(p.paid_amount) FROM paid_tax_items p WHERE p.doc_id = pt.doc_id) AS paid_taxes_total,
    ta.state_date AS arrears_date,
    (SELECT sum(a.total_amount) FROM tax_arrear_items a WHERE a.doc_id = ta.doc_id) AS arrears_total,
    tof.state_date AS offences_date,
    tof.fine_amount AS offences_fine,
    NULLIF(concat_ws(', ',
        CASE WHEN tr.esxn_flag = '1' THEN 'ЕСХН' END,
        CASE WHEN tr.usn_flag = '1' THEN 'УСН' END,
        CASE WHEN tr.ausn_flag = '1' THEN 'АУСН' END,
        CASE WHEN tr.srp_flag = '1' THEN 'СРП' END), '') AS special_regimes,
    ms.category AS msp_category,
    mc.name AS msp_category_name,
    EXISTS (SELECT 1 FROM orgs_with_disqualified d WHERE d.inn = i.inn) AS has_disqualified_manager,
    COALESCE(fl.has_bailiff_debt, false) AS has_bailiff_debt,
    COALESCE(fl.no_reporting_over_year, false) AS no_reporting_over_year
FROM inns i
LEFT JOIN LATERAL (SELECT * FROM headcount x WHERE x.inn = i.inn ORDER BY x.state_date DESC LIMIT 1) hc ON true
LEFT JOIN LATERAL (SELECT * FROM revenue_expenses x WHERE x.inn = i.inn ORDER BY x.state_date DESC LIMIT 1) re ON true
LEFT JOIN LATERAL (SELECT * FROM paid_taxes x WHERE x.inn = i.inn ORDER BY x.state_date DESC LIMIT 1) pt ON true
LEFT JOIN LATERAL (SELECT * FROM tax_arrears x WHERE x.inn = i.inn ORDER BY x.state_date DESC LIMIT 1) ta ON true
LEFT JOIN LATERAL (SELECT * FROM tax_offences x WHERE x.inn = i.inn ORDER BY x.state_date DESC LIMIT 1) tof ON true
LEFT JOIN LATERAL (SELECT * FROM org_tax_regimes x WHERE x.inn = i.inn ORDER BY x.state_date DESC LIMIT 1) tr ON true
LEFT JOIN LATERAL (SELECT * FROM msp_subjects x WHERE x.org_inn = i.inn ORDER BY x.state_date DESC LIMIT 1) ms ON true
LEFT JOIN LATERAL (SELECT * FROM debt_and_reporting_flags x WHERE x.inn = i.inn ORDER BY x.state_date DESC LIMIT 1) fl ON true
LEFT JOIN msp_categories mc ON mc.code = ms.category;

-- Карточка ИП: спецрежимы, реестр МСП, поддержка. ИП на ОСН в snrip нет — тогда ОГРНИП из реестра МСП.
CREATE VIEW v_entrepreneur_card AS
WITH inns AS (
    SELECT inn FROM ip_tax_regimes
    UNION SELECT ip_inn FROM msp_subjects WHERE ip_inn IS NOT NULL
    UNION SELECT person_inn FROM msp_support_recipients WHERE ogrnip IS NOT NULL
)
SELECT
    i.inn,
    COALESCE(tr.ogrnip, ms.ogrnip) AS ogrnip,
    tr.state_date AS regimes_date,
    (SELECT string_agg(c.short_name, ', ' ORDER BY c.code)
       FROM ip_tax_regime_items it JOIN ip_regime_codes c ON c.code = it.regime_code
      WHERE it.doc_id = tr.doc_id) AS special_regimes,
    ms.subject_kind AS msp_subject_kind,
    ms.category AS msp_category,
    mc.name AS msp_category_name,
    (SELECT count(*) FROM msp_support_recipients r JOIN msp_supports s ON s.doc_id = r.doc_id
      WHERE r.person_inn = i.inn) AS supports_count
FROM inns i
LEFT JOIN LATERAL (SELECT * FROM ip_tax_regimes x WHERE x.inn = i.inn ORDER BY x.state_date DESC LIMIT 1) tr ON true
LEFT JOIN LATERAL (SELECT * FROM msp_subjects x WHERE x.ip_inn = i.inn ORDER BY x.state_date DESC LIMIT 1) ms ON true
LEFT JOIN msp_categories mc ON mc.code = ms.category;

INSERT INTO msp_subject_kinds (code, name) VALUES
('1', 'Юридическое лицо'),
('2', 'Индивидуальный предприниматель'),
('3', 'Глава крестьянского (фермерского) хозяйства');

INSERT INTO msp_categories (code, name) VALUES
('1', 'Микропредприятие'),
('2', 'Малое предприятие'),
('3', 'Среднее предприятие');
