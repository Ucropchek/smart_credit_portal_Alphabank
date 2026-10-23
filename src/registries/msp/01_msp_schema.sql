-- Мок-реестр МСП по открытому формату 4.06 (набор 7707329152-rsmp).
-- Карточка субъекта: документ, организация или предприниматель, место, занятия,
-- лицензии, продукция, партнёрство. Оболочки файла (ИдФайл, ВерсФорм, ТипИнф,
-- ВерсПрог, КолДок) и блока отправителя ИдОтпр здесь нет.
-- Даты исключения, КПП и улицы в схеме 4.06 нет.
-- Схема msp не трогает egrul и egrip. Идентификаторы синтетические.

DROP SCHEMA IF EXISTS msp CASCADE;
CREATE SCHEMA msp;
SET search_path TO msp;

-- Контрольные цифры ИНН: одна для 10 знаков, две для 12. Пустое значение пропускается.
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

CREATE TABLE okved (
    code VARCHAR(8) PRIMARY KEY,
    name VARCHAR(1000) NOT NULL,
    CONSTRAINT ck_okved_code CHECK (code ~ '^\d{2}(\.\d{1,2}){0,2}$')
);

-- ВидСубМСП
CREATE TABLE subject_kind (
    code CHAR(1) PRIMARY KEY,
    name VARCHAR(80) NOT NULL
);

-- КатСубМСП
CREATE TABLE subject_category (
    code CHAR(1) PRIMARY KEY,
    name VARCHAR(40) NOT NULL
);

-- Документ. Одна строка — одна карточка. ИдДок не заменяет ИНН.
CREATE TABLE subjects (
    doc_id VARCHAR(36) PRIMARY KEY,
    registry_date DATE NOT NULL,
    included_on DATE NOT NULL,
    kind_code CHAR(1) NOT NULL REFERENCES subject_kind (code),
    kind_name VARCHAR(80) NOT NULL,
    category_code CHAR(1) NOT NULL REFERENCES subject_category (code),
    category_name VARCHAR(40) NOT NULL,
    newly_created CHAR(1) NOT NULL,
    social_enterprise CHAR(1) NOT NULL,
    employee_count INTEGER,
    org_full_name VARCHAR(1000),
    org_short_name VARCHAR(500),
    org_inn CHAR(10),
    org_ogrn CHAR(13),
    person_inn CHAR(12),
    person_ogrnip CHAR(15),
    last_name VARCHAR(60),
    first_name VARCHAR(60),
    middle_name VARCHAR(60),
    region_code CHAR(2) NOT NULL,
    region_type VARCHAR(50),
    region_name VARCHAR(255),
    district_type VARCHAR(50),
    district_name VARCHAR(255),
    city_type VARCHAR(50),
    city_name VARCHAR(255),
    settlement_type VARCHAR(50),
    settlement_name VARCHAR(255),
    CONSTRAINT ck_doc_id CHECK (char_length(doc_id) BETWEEN 1 AND 36),
    CONSTRAINT ck_included CHECK (included_on <= registry_date),
    CONSTRAINT ck_flags CHECK (newly_created IN ('1', '2') AND social_enterprise IN ('1', '2')),
    CONSTRAINT ck_headcount CHECK (
        employee_count IS NULL OR (employee_count >= 0 AND employee_count <= 999999999)
    ),
    -- Потолок численности: микро до 15, малое до 100, среднее до 250.
    CONSTRAINT ck_headcount_category CHECK (
        employee_count IS NULL
        OR (category_code = '1' AND employee_count < 16)
        OR (category_code = '2' AND employee_count < 101)
        OR (category_code = '3' AND employee_count < 251)
    ),
    -- ПризНовМСП = 1 стоит только у микропредприятия.
    CONSTRAINT ck_new_is_micro CHECK (newly_created <> '1' OR category_code = '1'),
    CONSTRAINT ck_ru_text CHECK (
        (org_full_name IS NULL OR org_full_name !~ '[A-Za-z]')
        AND (org_short_name IS NULL OR org_short_name !~ '[A-Za-z]')
        AND (last_name IS NULL OR last_name !~ '[A-Za-z]')
        AND (first_name IS NULL OR first_name !~ '[A-Za-z]')
        AND (middle_name IS NULL OR middle_name !~ '[A-Za-z]')
        AND (region_type IS NULL OR region_type !~ '[A-Za-z]')
        AND (region_name IS NULL OR region_name !~ '[A-Za-z]')
        AND (district_type IS NULL OR district_type !~ '[A-Za-z]')
        AND (district_name IS NULL OR district_name !~ '[A-Za-z]')
        AND (city_type IS NULL OR city_type !~ '[A-Za-z]')
        AND (city_name IS NULL OR city_name !~ '[A-Za-z]')
        AND (settlement_type IS NULL OR settlement_type !~ '[A-Za-z]')
        AND (settlement_name IS NULL OR settlement_name !~ '[A-Za-z]')
        AND kind_name !~ '[A-Za-z]'
        AND category_name !~ '[A-Za-z]'
    ),
    -- Описание формата велит заполнять ССЧР у юридического лица. В XSD атрибут необязательный.
    CONSTRAINT ck_headcount_org CHECK (kind_code <> '1' OR employee_count IS NOT NULL),
    CONSTRAINT ck_region CHECK (region_code ~ '^\d{2}$'),
    CONSTRAINT ck_region_pair CHECK (
        (region_type IS NULL AND region_name IS NULL)
        OR (region_type IS NOT NULL AND region_name IS NOT NULL)
    ),
    CONSTRAINT ck_district_pair CHECK (
        (district_type IS NULL AND district_name IS NULL)
        OR (district_type IS NOT NULL AND district_name IS NOT NULL)
    ),
    CONSTRAINT ck_city_pair CHECK (
        (city_type IS NULL AND city_name IS NULL)
        OR (city_type IS NOT NULL AND city_name IS NOT NULL)
    ),
    CONSTRAINT ck_settlement_pair CHECK (
        (settlement_type IS NULL AND settlement_name IS NULL)
        OR (settlement_type IS NOT NULL AND settlement_name IS NOT NULL)
    ),
    CONSTRAINT ck_org_inn CHECK (org_inn IS NULL OR (char_length(org_inn) = 10 AND msp.inn_ok(org_inn))),
    CONSTRAINT ck_org_ogrn CHECK (
        org_ogrn IS NULL
        OR (org_ogrn ~ '^[15]\d{12}$' AND (left(org_ogrn, 12)::NUMERIC % 11) % 10 = right(org_ogrn, 1)::INT)
    ),
    CONSTRAINT ck_person_inn CHECK (person_inn IS NULL OR (char_length(person_inn) = 12 AND msp.inn_ok(person_inn))),
    CONSTRAINT ck_person_ogrnip CHECK (
        person_ogrnip IS NULL
        OR (person_ogrnip ~ '^3\d{14}$' AND (left(person_ogrnip, 14)::NUMERIC % 13) % 10 = right(person_ogrnip, 1)::INT)
    ),
    CONSTRAINT ck_kind_block CHECK (
        (
            kind_code = '1'
            AND org_full_name IS NOT NULL
            AND org_inn IS NOT NULL
            AND org_ogrn IS NOT NULL
            AND person_inn IS NULL
            AND person_ogrnip IS NULL
            AND last_name IS NULL
            AND first_name IS NULL
            AND middle_name IS NULL
        )
        OR (
            kind_code IN ('2', '3')
            AND person_inn IS NOT NULL
            AND person_ogrnip IS NOT NULL
            AND org_full_name IS NULL
            AND org_short_name IS NULL
            AND org_inn IS NULL
            AND org_ogrn IS NULL
        )
    ),
    CONSTRAINT uq_org_inn UNIQUE (org_inn),
    CONSTRAINT uq_org_ogrn UNIQUE (org_ogrn),
    CONSTRAINT uq_person_inn UNIQUE (person_inn),
    CONSTRAINT uq_person_ogrnip UNIQUE (person_ogrnip)
);

-- СвОКВЭД (APPLICANT) и СвОКВЭДотч (REPORTING). НаимОКВЭД лежит в okved.name.
-- ВерсОКВЭД обязателен на каждой строке. Код в этом моке всегда заполнен.
CREATE TABLE subject_okved (
    doc_id VARCHAR(36) NOT NULL REFERENCES subjects (doc_id) ON DELETE CASCADE,
    source VARCHAR(10) NOT NULL,
    okved_code VARCHAR(8) NOT NULL REFERENCES okved (code),
    is_main BOOLEAN NOT NULL,
    okved_version CHAR(4) NOT NULL,
    PRIMARY KEY (doc_id, source, okved_code),
    CONSTRAINT ck_okved_source CHECK (source IN ('APPLICANT', 'REPORTING')),
    CONSTRAINT ck_okved_version CHECK (okved_version IN ('2001', '2014'))
);
CREATE UNIQUE INDEX uq_okved_main ON subject_okved (doc_id, source) WHERE is_main;

-- СвЛиценз. Номер дела — ИНН карточки, не номер лицензии.
CREATE TABLE licenses (
    doc_id VARCHAR(36) NOT NULL REFERENCES subjects (doc_id) ON DELETE CASCADE,
    license_no SMALLINT NOT NULL,
    series VARCHAR(10),
    license_number VARCHAR(100),
    license_kind VARCHAR(10),
    license_date DATE,
    start_date DATE,
    end_date DATE,
    issuer_name VARCHAR(500),
    suspension_date DATE,
    suspension_authority VARCHAR(500),
    PRIMARY KEY (doc_id, license_no),
    CONSTRAINT ck_lic_susp CHECK (
        (suspension_date IS NULL AND suspension_authority IS NULL)
        OR (suspension_date IS NOT NULL AND suspension_authority IS NOT NULL)
    ),
    CONSTRAINT ck_lic_dates CHECK (
        (end_date IS NULL OR start_date IS NULL OR end_date > start_date)
        AND (license_date IS NULL OR start_date IS NULL OR license_date <= start_date)
        AND (suspension_date IS NULL OR start_date IS NULL OR suspension_date >= start_date)
        AND (suspension_date IS NULL OR end_date IS NULL OR suspension_date < end_date)
    ),
    -- НомЛиценз: без кириллицы.
    CONSTRAINT ck_lic_number CHECK (
        license_number IS NULL OR license_number ~ '^[0-9A-Za-z][0-9A-Za-z./-]{0,99}$'
    ),
    CONSTRAINT ck_lic_ru CHECK (
        (issuer_name IS NULL OR issuer_name !~ '[A-Za-z]')
        AND (suspension_authority IS NULL OR suspension_authority !~ '[A-Za-z]')
    )
);

-- НаимЛицВД. У одной лицензии таких названий может быть несколько.
CREATE TABLE license_activities (
    doc_id VARCHAR(36) NOT NULL,
    license_no SMALLINT NOT NULL,
    activity_no SMALLINT NOT NULL,
    activity_name VARCHAR(1000) NOT NULL,
    PRIMARY KEY (doc_id, license_no, activity_no),
    CONSTRAINT ck_lic_act_ru CHECK (activity_name !~ '[A-Za-z]'),
    FOREIGN KEY (doc_id, license_no) REFERENCES licenses (doc_id, license_no) ON DELETE CASCADE
);

-- СвПрод
CREATE TABLE products (
    doc_id VARCHAR(36) NOT NULL REFERENCES subjects (doc_id) ON DELETE CASCADE,
    product_no SMALLINT NOT NULL,
    product_code VARCHAR(18) NOT NULL,
    product_name VARCHAR(1000) NOT NULL,
    innovative CHAR(1) NOT NULL,
    PRIMARY KEY (doc_id, product_no),
    CONSTRAINT ck_prod_flag CHECK (innovative IN ('1', '2')),
    CONSTRAINT ck_prod_code CHECK (
        char_length(product_code) BETWEEN 1 AND 18
        AND product_code ~ '^[0-9]+(\.[0-9]+)*$'
    ),
    CONSTRAINT ck_prod_name_ru CHECK (product_name !~ '[A-Za-z]')
);

-- СвПрогПарт. customer_inn — ИНН заказчика, не ИНН субъекта.
CREATE TABLE partnerships (
    doc_id VARCHAR(36) NOT NULL REFERENCES subjects (doc_id) ON DELETE CASCADE,
    partnership_no SMALLINT NOT NULL,
    customer_name VARCHAR(1000),
    customer_inn CHAR(10) NOT NULL,
    contract_number VARCHAR(60),
    contract_date DATE NOT NULL,
    PRIMARY KEY (doc_id, partnership_no),
    CONSTRAINT ck_customer_inn CHECK (char_length(customer_inn) = 10 AND msp.inn_ok(customer_inn)),
    -- НомДог: без кириллицы.
    CONSTRAINT ck_contract_number CHECK (
        contract_number IS NULL OR contract_number ~ '^[0-9A-Za-z][0-9A-Za-z./-]{0,59}$'
    ),
    CONSTRAINT ck_customer_name_ru CHECK (customer_name IS NULL OR customer_name !~ '[A-Za-z]')
);

-- ИННЮЛ_ПП — номер заказчика, не ИНН организации из карточки.
CREATE FUNCTION customer_is_not_subject() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM msp.subjects s
         WHERE s.doc_id = NEW.doc_id
           AND s.org_inn = NEW.customer_inn
    ) THEN
        RAISE EXCEPTION 'customer inn equals subject inn for %', NEW.doc_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_customer_inn
BEFORE INSERT OR UPDATE ON partnerships
FOR EACH ROW EXECUTE FUNCTION customer_is_not_subject();

CREATE VIEW v_subject_card AS
SELECT
    s.doc_id,
    s.registry_date,
    s.included_on,
    s.kind_code,
    s.kind_name,
    s.category_code,
    s.category_name,
    s.newly_created,
    s.social_enterprise,
    s.employee_count,
    s.org_inn,
    s.org_ogrn,
    s.org_short_name,
    s.org_full_name,
    s.person_inn,
    s.person_ogrnip,
    s.last_name,
    s.first_name,
    s.middle_name,
    s.region_code,
    s.region_name,
    s.city_name,
    (SELECT o.okved_code
       FROM subject_okved o
      WHERE o.doc_id = s.doc_id AND o.source = 'APPLICANT' AND o.is_main) AS main_okved_code
FROM subjects s;

INSERT INTO subject_kind (code, name) VALUES
('1', 'Юридическое лицо'),
('2', 'Индивидуальный предприниматель'),
('3', 'Глава крестьянско-фермерского хозяйства');

INSERT INTO subject_category (code, name) VALUES
('1', 'Микропредприятие'),
('2', 'Малое предприятие'),
('3', 'Среднее предприятие');

INSERT INTO okved (code, name) VALUES
('01.13', 'Выращивание овощей, бахчевых, корнеплодных и клубнеплодных культур, грибов и трюфелей'),
('01.19', 'Выращивание прочих однолетних культур'),
('10.71', 'Производство хлеба и мучных кондитерских изделий, тортов и пирожных недлительного хранения'),
('16.23', 'Производство прочих деревянных строительных конструкций и столярных изделий'),
('43.32', 'Работы столярные и плотничные'),
('43.39', 'Производство прочих отделочных и завершающих работ'),
('45.20', 'Техническое обслуживание и ремонт автотранспортных средств'),
('45.32', 'Торговля розничная автомобильными деталями, узлами и принадлежностями'),
('47.11', 'Торговля розничная преимущественно пищевыми продуктами в неспециализированных магазинах'),
('47.19', 'Торговля розничная прочая в неспециализированных магазинах'),
('47.21', 'Торговля розничная фруктами и овощами в специализированных магазинах'),
('47.24', 'Торговля розничная хлебом и хлебобулочными изделиями в специализированных магазинах'),
('47.29', 'Торговля розничная прочими пищевыми продуктами в специализированных магазинах'),
('47.75', 'Торговля розничная косметическими и товарами личной гигиены в специализированных магазинах'),
('47.91', 'Торговля розничная по почте или по информационно-коммуникационной сети Интернет'),
('49.41', 'Деятельность автомобильного грузового транспорта'),
('52.29', 'Деятельность вспомогательная прочая, связанная с перевозками'),
('56.10', 'Деятельность ресторанов и услуги по доставке продуктов питания'),
('56.29', 'Деятельность предприятий общественного питания по прочим видам организации питания'),
('62.01', 'Разработка компьютерного программного обеспечения'),
('62.02', 'Деятельность консультативная и работы в области компьютерных технологий'),
('63.11', 'Деятельность по обработке данных, предоставление услуг по размещению информации'),
('68.20', 'Аренда и управление собственным или арендованным недвижимым имуществом'),
('68.31', 'Деятельность агентств недвижимости за вознаграждение или на договорной основе'),
('69.20', 'Деятельность по оказанию услуг в области бухгалтерского учета, налоговому консультированию'),
('70.22', 'Консультирование по вопросам коммерческой деятельности и управления'),
('73.11', 'Деятельность рекламных агентств'),
('74.20', 'Деятельность в области фотографии'),
('82.92', 'Деятельность по упаковыванию товаров'),
('85.41', 'Образование дополнительное детей и взрослых'),
('85.42', 'Образование профессиональное дополнительное'),
('90.03', 'Деятельность в области художественного творчества'),
('93.29', 'Деятельность зрелищно-развлекательная прочая'),
('96.02', 'Предоставление услуг парикмахерскими и салонами красоты'),
('96.04', 'Деятельность физкультурно-оздоровительная');
