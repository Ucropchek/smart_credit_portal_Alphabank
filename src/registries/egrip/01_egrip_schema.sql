-- Мок-реестр ЕГРИП по открытому формату 4.07 (ЕГРИП_ОТКР_СВЕД)
-- и закрытым сведениям: рождение, документ, удостоверяющий личность, адрес места жительства.
-- СНИЛС нет: в формате ЕГРИП такого элемента нет.
-- Схема egrip не трогает egrul.

DROP SCHEMA IF EXISTS egrip CASCADE;
CREATE SCHEMA egrip;
SET search_path TO egrip;

CREATE TABLE okved (
    code VARCHAR(8) PRIMARY KEY,
    name VARCHAR(300) NOT NULL,
    CONSTRAINT ck_okved_code CHECK (code ~ '^\d{2}(\.\d{1,2}){0,2}$')
);

CREATE TABLE sipst (
    code CHAR(3) PRIMARY KEY,
    name VARCHAR(500) NOT NULL
);

CREATE TABLE sippd (
    code CHAR(3) PRIMARY KEY,
    name VARCHAR(500) NOT NULL
);

CREATE TABLE spvz (
    code CHAR(5) PRIMARY KEY,
    name VARCHAR(500) NOT NULL
);

CREATE TABLE entrepreneurs (
    ogrnip CHAR(15) PRIMARY KEY,
    extract_date DATE NOT NULL,
    ogrnip_date DATE NOT NULL,
    inn CHAR(12) NOT NULL UNIQUE,
    kind_code CHAR(1) NOT NULL,
    kind_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    first_name VARCHAR(60) NOT NULL,
    middle_name VARCHAR(60),
    gender_code CHAR(1) NOT NULL,
    gender_name VARCHAR(20) NOT NULL,
    latin_last_name VARCHAR(60),
    latin_first_name VARCHAR(60),
    latin_middle_name VARCHAR(60),
    zags_last_name VARCHAR(60),
    zags_first_name VARCHAR(60),
    zags_middle_name VARCHAR(60),
    fio_grn CHAR(15) NOT NULL,
    fio_grn_date DATE NOT NULL,
    citizenship_kind CHAR(1) NOT NULL,
    citizenship_country_code CHAR(3),
    citizenship_country_name VARCHAR(80),
    citizenship_grn CHAR(15) NOT NULL,
    citizenship_grn_date DATE NOT NULL,
    email VARCHAR(45),
    email_grn CHAR(15),
    email_grn_date DATE,
    reg_authority_code CHAR(4) NOT NULL,
    reg_authority_name VARCHAR(250) NOT NULL,
    reg_authority_grn CHAR(15) NOT NULL,
    reg_authority_grn_date DATE NOT NULL,
    status_code CHAR(3) REFERENCES sipst (code),
    status_name VARCHAR(500),
    status_grn CHAR(15),
    status_grn_date DATE,
    termination_date DATE,
    termination_code CHAR(3) REFERENCES sippd (code),
    termination_name VARCHAR(500),
    termination_grn CHAR(15),
    termination_grn_date DATE,
    birth_date DATE NOT NULL,
    birth_place VARCHAR(255) NOT NULL,
    birth_grn CHAR(15) NOT NULL,
    birth_grn_date DATE NOT NULL,
    doc_type_code CHAR(2) NOT NULL,
    doc_type_name VARCHAR(160) NOT NULL,
    doc_series VARCHAR(10),
    doc_number VARCHAR(20) NOT NULL,
    doc_issue_date DATE NOT NULL,
    doc_issuer VARCHAR(200) NOT NULL,
    doc_issuer_code VARCHAR(7),
    doc_grn CHAR(15) NOT NULL,
    doc_grn_date DATE NOT NULL,
    fio_correction_grn CHAR(15),
    fio_correction_date DATE,
    fias_id VARCHAR(36),
    postcode CHAR(6),
    region_code CHAR(2) NOT NULL,
    region_name VARCHAR(50) NOT NULL,
    municipal_kind CHAR(1),
    municipal_name VARCHAR(255),
    settlement_kind VARCHAR(30),
    settlement_name VARCHAR(255),
    street_kind VARCHAR(30),
    street_name VARCHAR(255),
    building_kind VARCHAR(30),
    building_number VARCHAR(50),
    premises_kind VARCHAR(30),
    premises_number VARCHAR(50),
    address_grn CHAR(15) NOT NULL,
    address_grn_date DATE NOT NULL,
    tax_registration_date DATE NOT NULL,
    tax_office_code CHAR(4) NOT NULL,
    tax_office_name VARCHAR(250) NOT NULL,
    tax_grn CHAR(15) NOT NULL,
    tax_grn_date DATE NOT NULL,
    CONSTRAINT ck_ogrnip CHECK (ogrnip ~ '^3\d{14}$' AND (left(ogrnip, 14)::NUMERIC % 13) % 10 = right(ogrnip, 1)::INT),
    CONSTRAINT ck_inn CHECK (inn ~ '^\d{12}$'),
    CONSTRAINT ck_kind CHECK (kind_code IN ('1', '2')),
    CONSTRAINT ck_gender CHECK (gender_code IN ('1', '2')),
    CONSTRAINT ck_citizenship CHECK (
        (citizenship_kind = '1' AND citizenship_country_code IS NULL)
        OR (citizenship_kind = '2' AND citizenship_country_code IS NOT NULL AND citizenship_country_name IS NOT NULL)
        OR (citizenship_kind = '3' AND citizenship_country_code IS NULL)
    ),
    CONSTRAINT ck_status CHECK (
        (status_code IS NULL AND status_name IS NULL AND status_grn IS NULL)
        OR (status_code IS NOT NULL AND status_name IS NOT NULL AND status_grn IS NOT NULL AND termination_code IS NULL)
    ),
    CONSTRAINT ck_term CHECK (
        (termination_code IS NULL AND termination_date IS NULL AND termination_name IS NULL AND termination_grn IS NULL)
        OR (termination_code IS NOT NULL AND termination_date IS NOT NULL AND termination_name IS NOT NULL
            AND termination_grn IS NOT NULL AND termination_date >= ogrnip_date)
    ),
    CONSTRAINT ck_email CHECK ((email IS NULL AND email_grn IS NULL) OR (email IS NOT NULL AND email_grn IS NOT NULL))
);

CREATE TABLE entrepreneur_okved (
    ogrnip CHAR(15) NOT NULL REFERENCES entrepreneurs (ogrnip) ON DELETE CASCADE,
    source VARCHAR(10) NOT NULL,
    okved_code VARCHAR(8) NOT NULL REFERENCES okved (code),
    is_main BOOLEAN NOT NULL,
    grn CHAR(15) NOT NULL,
    grn_date DATE NOT NULL,
    PRIMARY KEY (ogrnip, source, okved_code),
    CONSTRAINT ck_okved_source CHECK (source IN ('APPLICANT', 'REPORTING'))
);
CREATE UNIQUE INDEX uq_egrip_okved_main ON entrepreneur_okved (ogrnip, source) WHERE is_main;

CREATE TABLE licenses (
    ogrnip CHAR(15) NOT NULL REFERENCES entrepreneurs (ogrnip) ON DELETE CASCADE,
    license_no SMALLINT NOT NULL,
    erul_number VARCHAR(40),
    license_number VARCHAR(40) NOT NULL,
    issue_date DATE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    activity_name VARCHAR(300) NOT NULL,
    issuer_name VARCHAR(300) NOT NULL,
    grn CHAR(15) NOT NULL,
    grn_date DATE NOT NULL,
    suspension_date DATE,
    suspension_authority VARCHAR(300),
    suspension_grn CHAR(15),
    suspension_grn_date DATE,
    PRIMARY KEY (ogrnip, license_no),
    CONSTRAINT ck_susp CHECK (
        (suspension_date IS NULL AND suspension_authority IS NULL AND suspension_grn IS NULL)
        OR (suspension_date IS NOT NULL AND suspension_authority IS NOT NULL AND suspension_grn IS NOT NULL)
    )
);

CREATE TABLE insurer_sfr (
    ogrnip CHAR(15) PRIMARY KEY REFERENCES entrepreneurs (ogrnip) ON DELETE CASCADE,
    reg_number VARCHAR(15) NOT NULL,
    registration_date DATE NOT NULL,
    office_code VARCHAR(15) NOT NULL,
    office_name VARCHAR(255) NOT NULL,
    grn CHAR(15) NOT NULL,
    grn_date DATE NOT NULL
);

CREATE TABLE insurer_pfr (
    ogrnip CHAR(15) PRIMARY KEY REFERENCES entrepreneurs (ogrnip) ON DELETE CASCADE,
    reg_number VARCHAR(15) NOT NULL,
    registration_date DATE NOT NULL,
    office_name VARCHAR(255) NOT NULL,
    grn CHAR(15) NOT NULL,
    grn_date DATE NOT NULL
);

CREATE TABLE insurer_fss (
    ogrnip CHAR(15) PRIMARY KEY REFERENCES entrepreneurs (ogrnip) ON DELETE CASCADE,
    reg_number VARCHAR(15) NOT NULL,
    registration_date DATE NOT NULL,
    office_name VARCHAR(255) NOT NULL,
    grn CHAR(15) NOT NULL,
    grn_date DATE NOT NULL
);

CREATE TABLE registry_records (
    ogrnip CHAR(15) NOT NULL REFERENCES entrepreneurs (ogrnip) ON DELETE CASCADE,
    record_id VARCHAR(19) NOT NULL,
    grn CHAR(15),
    record_date DATE NOT NULL,
    spvz_code CHAR(5) NOT NULL REFERENCES spvz (code),
    spvz_name VARCHAR(500) NOT NULL,
    authority_code CHAR(4) NOT NULL,
    authority_name VARCHAR(250) NOT NULL,
    PRIMARY KEY (ogrnip, record_id)
);

CREATE INDEX ix_ent_inn ON entrepreneurs (inn);
CREATE INDEX ix_ent_status ON entrepreneurs (status_code);

CREATE VIEW v_entrepreneur_card AS
SELECT
    e.ogrnip, e.inn, e.kind_code, e.kind_name,
    concat_ws(' ', e.last_name, e.first_name, e.middle_name) AS full_name,
    e.gender_code, e.ogrnip_date, e.extract_date,
    e.status_code, e.status_name, e.termination_date, e.termination_code, e.termination_name,
    e.region_code, e.email,
    (SELECT string_agg(o.okved_code, ', ' ORDER BY o.okved_code)
       FROM entrepreneur_okved o
      WHERE o.ogrnip = e.ogrnip AND o.source = 'APPLICANT' AND o.is_main) AS main_okved_code
FROM entrepreneurs e;

INSERT INTO sipst (code, name) VALUES
('110', 'Принято решение о предстоящем исключении недействующего ИП из ЕГРИП');

INSERT INTO sippd (code, name) VALUES
('201', 'Прекратил деятельность по собственному решению'),
('203', 'Прекратил деятельность в связи с принятием судом решения о признании банкротом'),
('209', 'Недействующий ИП исключен из ЕГРИП');

INSERT INTO spvz (code, name) VALUES
('21101', 'Государственная регистрация физического лица в качестве индивидуального предпринимателя'),
('22111', 'Внесение изменений в сведения об индивидуальном предпринимателе, содержащиеся в ЕГРИП'),
('23200', 'Представление сведений об учете в налоговом органе'),
('23300', 'Представление сведений о регистрации в качестве страхователя в территориальном органе Пенсионного фонда Российской Федерации'),
('23400', 'Представление сведений о регистрации в качестве страхователя в исполнительном органе Фонда социального страхования Российской Федерации'),
('23801', 'Представление сведений о выдаче или замене документа, удостоверяющего личность гражданина Российской Федерации на территории Российской Федерации'),
('23802', 'Представление сведений о регистрации физического лица по месту жительства'),
('24111', 'Прекращение физическим лицом деятельности в качестве индивидуального предпринимателя'),
('24311', 'Прекращение физическим лицом деятельности в качестве индивидуального предпринимателя в связи с признанием его несостоятельным (банкротом)');

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
