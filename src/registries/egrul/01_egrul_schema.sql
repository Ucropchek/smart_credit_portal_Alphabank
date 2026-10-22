-- Мок-реестр ЕГРЮЛ по открытому формату 4.08 (ЕГРЮЛ_ОТКР_СВЕД)
-- и закрытым сведениям о физлицах (рождение, документ, адрес места жительства).
-- Схема egrul не трогает egrip. Идентификаторы синтетические.
-- ГРН блока — номер записи, которой сведения внесены. ГРНДатаИспр не заполняется:
-- в наборе нет исправления технических ошибок.

DROP SCHEMA IF EXISTS egrul CASCADE;
CREATE SCHEMA egrul;
SET search_path TO egrul;

CREATE TABLE okved (
    code VARCHAR(8) PRIMARY KEY,
    name VARCHAR(300) NOT NULL,
    CONSTRAINT ck_okved_code CHECK (code ~ '^\d{2}(\.\d{1,2}){0,2}$')
);

CREATE TABLE opf (
    code CHAR(5) PRIMARY KEY,
    classifier VARCHAR(10) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    CONSTRAINT ck_opf_classifier CHECK (classifier = 'ОКОПФ')
);

-- СЮЛНД
CREATE TABLE formation_method (
    code CHAR(2) PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- СЮЛСТ, коды состояния, пока лицо не прекращено, и коды реорганизации
CREATE TABLE syulst (
    code CHAR(3) PRIMARY KEY,
    name VARCHAR(500) NOT NULL
);

-- СЮЛПД
CREATE TABLE syulpd (
    code CHAR(3) PRIMARY KEY,
    name VARCHAR(500) NOT NULL
);

-- СПВЗ, только коды, которые есть в истории этого мока
CREATE TABLE spvz (
    code CHAR(5) PRIMARY KEY,
    name VARCHAR(500) NOT NULL
);

-- СКФЛЮЛ
CREATE TABLE position_kind (
    code CHAR(2) PRIMARY KEY,
    name VARCHAR(200) NOT NULL
);

CREATE TABLE legal_entities (
    ogrn CHAR(13) PRIMARY KEY,
    extract_date DATE NOT NULL,
    ogrn_date DATE NOT NULL,
    inn CHAR(10) NOT NULL UNIQUE,
    kpp CHAR(9) NOT NULL,
    opf_classifier VARCHAR(10) NOT NULL,
    opf_code CHAR(5) NOT NULL REFERENCES opf (code),
    opf_full_name VARCHAR(200) NOT NULL,
    full_name VARCHAR(500) NOT NULL UNIQUE,
    short_name VARCHAR(300) NOT NULL UNIQUE,
    full_name_en VARCHAR(500),
    short_name_en VARCHAR(300),
    name_grn CHAR(13) NOT NULL,
    name_grn_date DATE NOT NULL,
    formation_code CHAR(2) NOT NULL REFERENCES formation_method (code),
    formation_name VARCHAR(255) NOT NULL,
    legacy_reg_number VARCHAR(50),
    legacy_reg_date DATE,
    legacy_reg_authority VARCHAR(255),
    formation_grn CHAR(13) NOT NULL,
    formation_grn_date DATE NOT NULL,
    capital_type VARCHAR(40) NOT NULL,
    capital_amount NUMERIC(15, 2) NOT NULL,
    capital_grn CHAR(13) NOT NULL,
    capital_grn_date DATE NOT NULL,
    email VARCHAR(45),
    email_grn CHAR(13),
    email_grn_date DATE,
    name_correction_grn CHAR(13),
    name_correction_date DATE,
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
    address_grn CHAR(13) NOT NULL,
    address_grn_date DATE NOT NULL,
    address_unreliable_code CHAR(1),
    address_unreliable_text VARCHAR(500),
    address_unreliable_grn CHAR(13),
    address_unreliable_grn_date DATE,
    reg_authority_code CHAR(4) NOT NULL,
    reg_authority_name VARCHAR(250) NOT NULL,
    reg_authority_grn CHAR(13) NOT NULL,
    reg_authority_grn_date DATE NOT NULL,
    status_code CHAR(3) REFERENCES syulst (code),
    status_name VARCHAR(500),
    status_grn CHAR(13),
    status_grn_date DATE,
    termination_date DATE,
    termination_code CHAR(3) REFERENCES syulpd (code),
    termination_name VARCHAR(500),
    termination_grn CHAR(13),
    termination_grn_date DATE,
    tax_registration_date DATE NOT NULL,
    tax_office_code CHAR(4) NOT NULL,
    tax_office_name VARCHAR(250) NOT NULL,
    tax_grn CHAR(13) NOT NULL,
    tax_grn_date DATE NOT NULL,
    CONSTRAINT ck_le_ogrn CHECK (ogrn ~ '^[15]\d{12}$' AND (left(ogrn, 12)::NUMERIC % 11) % 10 = right(ogrn, 1)::INT),
    CONSTRAINT ck_le_inn CHECK (inn ~ '^\d{10}$'),
    CONSTRAINT ck_le_kpp CHECK (kpp ~ '^\d{9}$' AND left(kpp, 4) = left(inn, 4) AND substring(kpp from 5 for 2) = '01'),
    CONSTRAINT ck_le_capital CHECK (
        (opf_code = '12247' AND capital_type = 'УСТАВНЫЙ КАПИТАЛ' AND capital_amount >= 100000)
        OR (opf_code IN ('12300', '12267') AND capital_type = 'УСТАВНЫЙ КАПИТАЛ' AND capital_amount >= 10000)
        OR (opf_code = '14200' AND capital_type = 'ПАЕВОЙ ФОНД' AND capital_amount >= 10000)
    ),
    CONSTRAINT ck_le_legacy CHECK (
        (formation_code = '01' AND legacy_reg_number IS NOT NULL AND legacy_reg_date IS NOT NULL AND legacy_reg_date < DATE '2002-07-01')
        OR (formation_code <> '01' AND legacy_reg_number IS NULL AND legacy_reg_date IS NULL AND legacy_reg_authority IS NULL)
    ),
    CONSTRAINT ck_le_status CHECK (
        (status_code IS NULL AND status_name IS NULL AND status_grn IS NULL)
        OR (status_code IS NOT NULL AND status_name IS NOT NULL AND status_grn IS NOT NULL)
    ),
    CONSTRAINT ck_le_termination CHECK (
        (termination_date IS NULL AND termination_code IS NULL AND termination_name IS NULL AND termination_grn IS NULL)
        OR (termination_date IS NOT NULL AND termination_code IS NOT NULL AND termination_name IS NOT NULL AND termination_grn IS NOT NULL AND termination_date >= ogrn_date)
    ),
    CONSTRAINT ck_le_email CHECK (
        (email IS NULL AND email_grn IS NULL) OR (email IS NOT NULL AND email_grn IS NOT NULL)
    ),
    CONSTRAINT ck_le_addr_bad CHECK (
        (address_unreliable_code IS NULL AND address_unreliable_text IS NULL AND address_unreliable_grn IS NULL)
        OR (address_unreliable_code IN ('2', '3') AND address_unreliable_text IS NOT NULL AND address_unreliable_grn IS NOT NULL)
    )
);

CREATE TABLE entity_okved (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    source VARCHAR(10) NOT NULL,
    okved_code VARCHAR(8) NOT NULL REFERENCES okved (code),
    is_main BOOLEAN NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    PRIMARY KEY (ogrn, source, okved_code),
    CONSTRAINT ck_okved_source CHECK (source IN ('APPLICANT', 'REPORTING'))
);
CREATE UNIQUE INDEX uq_okved_main ON entity_okved (ogrn, source) WHERE is_main;

-- Руководитель — физлицо. Закрытые поля: рождение, документ, адрес.
CREATE TABLE directors (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    director_no SMALLINT NOT NULL,
    inn CHAR(12) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    first_name VARCHAR(60) NOT NULL,
    middle_name VARCHAR(60),
    gender_code CHAR(1) NOT NULL,
    gender_name VARCHAR(20) NOT NULL,
    citizenship_kind CHAR(1) NOT NULL,
    citizenship_country_code CHAR(3),
    citizenship_country_name VARCHAR(80),
    position_kind_code CHAR(2) NOT NULL REFERENCES position_kind (code),
    position_kind_name VARCHAR(200) NOT NULL,
    position_name VARCHAR(100) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    unreliable_code CHAR(1),
    unreliable_text VARCHAR(500),
    unreliable_grn CHAR(13),
    unreliable_grn_date DATE,
    disqualification_start DATE,
    disqualification_end DATE,
    disqualification_decision_date DATE,
    disqualification_grn CHAR(13),
    disqualification_grn_date DATE,
    birth_date DATE NOT NULL,
    birth_place VARCHAR(255) NOT NULL,
    birth_grn CHAR(13) NOT NULL,
    birth_grn_date DATE NOT NULL,
    doc_type_code CHAR(2) NOT NULL,
    doc_type_name VARCHAR(120) NOT NULL,
    doc_series CHAR(4) NOT NULL,
    doc_number CHAR(6) NOT NULL,
    doc_issue_date DATE NOT NULL,
    doc_issuer VARCHAR(200) NOT NULL,
    doc_issuer_code CHAR(7) NOT NULL,
    doc_grn CHAR(13) NOT NULL,
    doc_grn_date DATE NOT NULL,
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
    address_grn CHAR(13) NOT NULL,
    address_grn_date DATE NOT NULL,
    PRIMARY KEY (ogrn, director_no),
    CONSTRAINT ck_dir_gender CHECK (gender_code IN ('1', '2')),
    CONSTRAINT ck_dir_inn CHECK (inn ~ '^\d{12}$'),
    CONSTRAINT ck_dir_doc CHECK (doc_type_code = '21'),
    CONSTRAINT ck_dir_bad CHECK (
        (unreliable_code IS NULL AND unreliable_text IS NULL AND unreliable_grn IS NULL)
        OR (unreliable_code IN ('1', '2', '3') AND unreliable_text IS NOT NULL AND unreliable_grn IS NOT NULL)
    ),
    CONSTRAINT ck_dir_disq CHECK (
        (disqualification_start IS NULL AND disqualification_end IS NULL AND disqualification_grn IS NULL)
        OR (disqualification_start IS NOT NULL AND disqualification_end IS NOT NULL AND disqualification_grn IS NOT NULL
            AND disqualification_end > disqualification_start)
    )
);

CREATE TABLE managing_companies (
    ogrn CHAR(13) PRIMARY KEY REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    manager_ogrn CHAR(13) NOT NULL,
    manager_inn CHAR(10) NOT NULL,
    manager_name VARCHAR(500) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL
);

CREATE TABLE founders (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    founder_no SMALLINT NOT NULL,
    founder_type VARCHAR(20) NOT NULL,
    name VARCHAR(500) NOT NULL,
    inn VARCHAR(12),
    founder_ogrn CHAR(13),
    country_code CHAR(3),
    country_name VARCHAR(80),
    foreign_reg_number VARCHAR(50),
    foreign_name_latin VARCHAR(500),
    public_kind CHAR(1),
    public_authority_name VARCHAR(300),
    public_authority_inn CHAR(10),
    public_authority_ogrn CHAR(13),
    pif_manager_name VARCHAR(300),
    pif_manager_inn CHAR(10),
    pif_manager_ogrn CHAR(13),
    share_nominal NUMERIC(15, 2) NOT NULL,
    share_percent NUMERIC(6, 2) NOT NULL,
    share_numerator INTEGER,
    share_denominator INTEGER,
    share_grn CHAR(13) NOT NULL,
    share_grn_date DATE NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    unreliable_code CHAR(1),
    unreliable_text VARCHAR(500),
    unreliable_grn CHAR(13),
    unreliable_grn_date DATE,
    gender_code CHAR(1),
    gender_name VARCHAR(20),
    citizenship_kind CHAR(1),
    birth_date DATE,
    birth_place VARCHAR(255),
    birth_grn CHAR(13),
    birth_grn_date DATE,
    doc_type_code CHAR(2),
    doc_type_name VARCHAR(120),
    doc_series CHAR(4),
    doc_number CHAR(6),
    doc_issue_date DATE,
    doc_issuer VARCHAR(200),
    doc_issuer_code CHAR(7),
    doc_grn CHAR(13),
    doc_grn_date DATE,
    exerciser_last_name VARCHAR(60),
    exerciser_first_name VARCHAR(60),
    exerciser_middle_name VARCHAR(60),
    exerciser_inn CHAR(12),
    investment_contract_name VARCHAR(1000),
    investment_contract_number VARCHAR(50),
    investment_contract_date DATE,
    notary_last_name VARCHAR(60),
    notary_first_name VARCHAR(60),
    notary_middle_name VARCHAR(60),
    fias_id VARCHAR(36),
    postcode CHAR(6),
    region_code CHAR(2),
    region_name VARCHAR(50),
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
    address_grn CHAR(13),
    address_grn_date DATE,
    PRIMARY KEY (ogrn, founder_no),
    CONSTRAINT ck_founder_type CHECK (founder_type IN (
        'PERSON', 'COMPANY', 'FOREIGN_COMPANY', 'PUBLIC_RF', 'PUBLIC_REGION', 'PUBLIC_MUNICIPAL', 'PIF', 'INVESTMENT'
    )),
    CONSTRAINT ck_share_fraction CHECK (
        (share_numerator IS NULL AND share_denominator IS NULL)
        OR (share_numerator >= 1 AND share_denominator >= 2)
    ),
    CONSTRAINT ck_founder_share CHECK (share_percent > 0 AND share_percent <= 100 AND share_nominal > 0),
    CONSTRAINT ck_founder_bad CHECK (
        (unreliable_code IS NULL AND unreliable_text IS NULL AND unreliable_grn IS NULL)
        OR (unreliable_code IN ('1', '2', '3') AND unreliable_text IS NOT NULL AND unreliable_grn IS NOT NULL)
    ),
    CONSTRAINT ck_founder_actor CHECK (
        (founder_type = 'PIF'
            AND pif_manager_name IS NOT NULL AND pif_manager_inn IS NOT NULL AND pif_manager_ogrn IS NOT NULL
            AND public_authority_name IS NULL AND public_authority_inn IS NULL AND public_authority_ogrn IS NULL)
        OR (founder_type IN ('PUBLIC_RF', 'PUBLIC_REGION', 'PUBLIC_MUNICIPAL')
            AND public_authority_name IS NOT NULL AND public_authority_inn IS NOT NULL AND public_authority_ogrn IS NOT NULL
            AND pif_manager_name IS NULL AND pif_manager_inn IS NULL AND pif_manager_ogrn IS NULL)
        OR (founder_type = 'INVESTMENT'
            AND investment_contract_name IS NOT NULL AND investment_contract_number IS NOT NULL
            AND investment_contract_date IS NOT NULL AND notary_last_name IS NOT NULL
            AND pif_manager_name IS NULL AND public_authority_name IS NULL)
        OR (founder_type NOT IN ('PIF', 'PUBLIC_RF', 'PUBLIC_REGION', 'PUBLIC_MUNICIPAL', 'INVESTMENT')
            AND pif_manager_name IS NULL AND public_authority_name IS NULL
            AND investment_contract_name IS NULL)
    )
);

CREATE TABLE founder_encumbrances (
    ogrn CHAR(13) NOT NULL,
    founder_no SMALLINT NOT NULL,
    encumbrance_kind VARCHAR(20) NOT NULL,
    pledgee_name VARCHAR(300) NOT NULL,
    pledgee_inn VARCHAR(12),
    contract_number VARCHAR(255),
    contract_date DATE,
    notary_last_name VARCHAR(60),
    notary_first_name VARCHAR(60),
    notary_middle_name VARCHAR(60),
    notary_inn CHAR(12),
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    PRIMARY KEY (ogrn, founder_no, grn),
    FOREIGN KEY (ogrn, founder_no) REFERENCES founders (ogrn, founder_no) ON DELETE CASCADE,
    CONSTRAINT ck_encumbrance CHECK (encumbrance_kind IN ('ЗАЛОГ', 'ИНОЕ ОБРЕМЕНЕНИЕ'))
);

CREATE TABLE share_registrars (
    ogrn CHAR(13) PRIMARY KEY REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    registrar_ogrn CHAR(13) NOT NULL,
    registrar_inn CHAR(10) NOT NULL,
    registrar_name VARCHAR(500) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL
);

CREATE TABLE treasury_shares (
    ogrn CHAR(13) PRIMARY KEY REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    nominal NUMERIC(15, 2) NOT NULL,
    percent NUMERIC(6, 2) NOT NULL,
    share_numerator INTEGER NOT NULL,
    share_denominator INTEGER NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    CONSTRAINT ck_treasury CHECK (nominal > 0 AND percent > 0 AND percent < 100)
);

CREATE TABLE subdivisions (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    unit_no SMALLINT NOT NULL,
    unit_kind VARCHAR(16) NOT NULL,
    name VARCHAR(300) NOT NULL,
    country_code CHAR(3),
    country_name VARCHAR(80),
    foreign_address VARCHAR(300),
    fias_id VARCHAR(36),
    postcode CHAR(6),
    region_code CHAR(2),
    region_name VARCHAR(50),
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
    address_grn CHAR(13),
    address_grn_date DATE,
    tax_kpp CHAR(9),
    tax_registration_date DATE,
    tax_office_code CHAR(4),
    tax_office_name VARCHAR(250),
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    PRIMARY KEY (ogrn, unit_no),
    CONSTRAINT ck_unit_kind CHECK (unit_kind IN ('BRANCH', 'REPRESENTATION'))
);

CREATE TABLE licenses (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    license_no SMALLINT NOT NULL,
    erul_number VARCHAR(40),
    license_number VARCHAR(40) NOT NULL,
    issue_date DATE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    activity_name VARCHAR(300) NOT NULL,
    issuer_name VARCHAR(300) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    suspension_date DATE,
    suspension_authority VARCHAR(300),
    suspension_grn CHAR(13),
    suspension_grn_date DATE,
    PRIMARY KEY (ogrn, license_no),
    CONSTRAINT ck_lic_susp CHECK (
        (suspension_date IS NULL AND suspension_authority IS NULL AND suspension_grn IS NULL)
        OR (suspension_date IS NOT NULL AND suspension_authority IS NOT NULL AND suspension_grn IS NOT NULL)
    )
);

CREATE TABLE reorganizations (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    status_code CHAR(3) NOT NULL REFERENCES syulst (code),
    status_name VARCHAR(500) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    PRIMARY KEY (ogrn, grn)
);

CREATE TABLE reorganization_parties (
    ogrn CHAR(13) NOT NULL,
    reorg_grn CHAR(13) NOT NULL,
    party_ogrn CHAR(13) NOT NULL,
    party_inn CHAR(10) NOT NULL,
    party_name VARCHAR(500) NOT NULL,
    after_state VARCHAR(50) NOT NULL,
    PRIMARY KEY (ogrn, reorg_grn, party_ogrn),
    FOREIGN KEY (ogrn, reorg_grn) REFERENCES reorganizations (ogrn, grn) ON DELETE CASCADE,
    CONSTRAINT ck_after_state CHECK (after_state IN (
        'ПРЕКРАТИТ ДЕЯТЕЛЬНОСТЬ ПОСЛЕ РЕОРГАНИЗАЦИИ',
        'ПРОДОЛЖИТ ДЕЯТЕЛЬНОСТЬ ПОСЛЕ РЕОРГАНИЗАЦИИ'
    ))
);

CREATE TABLE predecessors (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    predecessor_ogrn CHAR(13) NOT NULL,
    predecessor_inn CHAR(10),
    predecessor_name VARCHAR(500) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    PRIMARY KEY (ogrn, predecessor_ogrn)
);

CREATE TABLE successors (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    successor_ogrn CHAR(13) NOT NULL,
    successor_inn CHAR(10),
    successor_name VARCHAR(500) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    PRIMARY KEY (ogrn, successor_ogrn)
);

CREATE TABLE insurer_sfr (
    ogrn CHAR(13) PRIMARY KEY REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    reg_number VARCHAR(15) NOT NULL,
    registration_date DATE NOT NULL,
    office_code VARCHAR(15) NOT NULL,
    office_name VARCHAR(255) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL
);

CREATE TABLE insurer_pfr (
    ogrn CHAR(13) PRIMARY KEY REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    reg_number VARCHAR(15) NOT NULL,
    registration_date DATE NOT NULL,
    office_name VARCHAR(255) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL
);

CREATE TABLE insurer_fss (
    ogrn CHAR(13) PRIMARY KEY REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    reg_number VARCHAR(15) NOT NULL,
    registration_date DATE NOT NULL,
    office_name VARCHAR(255) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL
);

CREATE TABLE registry_records (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    record_id VARCHAR(19) NOT NULL,
    grn CHAR(13),
    record_date DATE NOT NULL,
    spvz_code CHAR(5) NOT NULL REFERENCES spvz (code),
    spvz_name VARCHAR(500) NOT NULL,
    authority_code CHAR(4) NOT NULL,
    authority_name VARCHAR(250) NOT NULL,
    PRIMARY KEY (ogrn, record_id)
);

CREATE INDEX ix_le_inn ON legal_entities (inn);
CREATE INDEX ix_le_status ON legal_entities (status_code);

CREATE TABLE founder_rights (
    ogrn CHAR(13) NOT NULL,
    founder_no SMALLINT NOT NULL,
    rights_text VARCHAR(500) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    PRIMARY KEY (ogrn, founder_no),
    FOREIGN KEY (ogrn, founder_no) REFERENCES founders (ogrn, founder_no) ON DELETE CASCADE
);

CREATE TABLE share_arrests (
    ogrn CHAR(13) NOT NULL,
    founder_no SMALLINT NOT NULL,
    document_kind CHAR(1) NOT NULL,
    document_number VARCHAR(50) NOT NULL,
    document_date DATE NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    PRIMARY KEY (ogrn, founder_no),
    FOREIGN KEY (ogrn, founder_no) REFERENCES founders (ogrn, founder_no) ON DELETE CASCADE,
    CONSTRAINT ck_arrest_doc CHECK (document_kind IN ('1', '2'))
);

CREATE TABLE access_restrictions (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    block_name VARCHAR(40) NOT NULL,
    subject_no SMALLINT NOT NULL,
    restricted CHAR(1) NOT NULL,
    grn CHAR(13) NOT NULL,
    grn_date DATE NOT NULL,
    PRIMARY KEY (ogrn, block_name, subject_no),
    CONSTRAINT ck_restricted CHECK (restricted = '1')
);

CREATE TABLE record_documents (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    grn CHAR(13) NOT NULL,
    doc_name VARCHAR(255) NOT NULL,
    doc_number VARCHAR(255),
    doc_date DATE,
    PRIMARY KEY (ogrn, grn, doc_name)
);

CREATE TABLE record_applicants (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    grn CHAR(13) NOT NULL,
    applicant_code VARCHAR(4) NOT NULL,
    applicant_name VARCHAR(500) NOT NULL,
    last_name VARCHAR(60),
    first_name VARCHAR(60),
    middle_name VARCHAR(60),
    inn CHAR(12),
    PRIMARY KEY (ogrn, grn)
);

CREATE TABLE record_certificates (
    ogrn CHAR(13) NOT NULL REFERENCES legal_entities (ogrn) ON DELETE CASCADE,
    grn CHAR(13) NOT NULL,
    series CHAR(2),
    number VARCHAR(9),
    issue_date DATE NOT NULL,
    PRIMARY KEY (ogrn, grn, issue_date)
);

CREATE VIEW v_legal_entity_card AS
SELECT
    le.ogrn, le.inn, le.kpp, le.short_name, le.full_name,
    le.opf_code, le.opf_full_name, le.capital_type, le.capital_amount,
    le.ogrn_date, le.extract_date, le.status_code, le.status_name,
    le.termination_date, le.termination_code, le.termination_name,
    le.region_code, le.email,
    (SELECT string_agg(e.okved_code, ', ' ORDER BY e.okved_code)
       FROM entity_okved e WHERE e.ogrn = le.ogrn AND e.source = 'APPLICANT' AND e.is_main) AS main_okved_code
FROM legal_entities le;

INSERT INTO opf (code, classifier, full_name) VALUES
('12300', 'ОКОПФ', 'Общества с ограниченной ответственностью'),
('12267', 'ОКОПФ', 'Непубличные акционерные общества'),
('12247', 'ОКОПФ', 'Публичные акционерные общества'),
('14200', 'ОКОПФ', 'Производственные кооперативы (кроме сельскохозяйственных производственных кооперативов)');

INSERT INTO formation_method (code, name) VALUES
('01', 'Создание юридического лица до 01.07.2002'),
('11', 'Создание юридического лица'),
('21', 'Создание юридического лица путем реорганизации');

INSERT INTO syulst (code, name) VALUES
('101', 'Находится в стадии ликвидации'),
('105', 'Принято решение о предстоящем исключении недействующего юрлица из ЕГРЮЛ'),
('113', 'Возбуждено производство по делу о несостоятельности (банкротстве)'),
('117', 'Признано несостоятельным (банкротом) и в отношении него открыто конкурсное производство'),
('122', 'Находится в процессе реорганизации в форме слияния');

INSERT INTO syulpd (code, name) VALUES
('201', 'Ликвидация юридического лица'),
('202', 'Ликвидация юридического лица по решению суда'),
('203', 'Прекращение деятельности в связи с ликвидацией на основании определения арбитражного суда о завершении конкурсного производства'),
('302', 'Прекращение деятельности путем реорганизации в форме слияния'),
('304', 'Прекращение деятельности путем реорганизации в форме присоединения'),
('407', 'Исключение из ЕГРЮЛ недействующего юридического лица');

INSERT INTO position_kind (code, name) VALUES
('02', 'Руководитель юридического лица');

INSERT INTO spvz (code, name) VALUES
('11101', 'Внесение в ЕГРЮЛ сведений о юридическом лице, зарегистрированном до 01.07.2002'),
('11201', 'Внесение в ЕГРЮЛ сведений о создании юридического лица'),
('11301', 'Создание юридического лица путем реорганизации в форме преобразования'),
('13801', 'Представление сведений о выдаче или замене документов, удостоверяющих личность гражданина Российской Федерации на территории Российской Федерации'),
('13802', 'Представление сведений о регистрации физического лица по месту жительства'),
('12101', 'Внесение изменений в сведения о юридическом лице, содержащиеся в ЕГРЮЛ, связанных с внесением изменений в учредительные документы'),
('12201', 'Внесение изменений в сведения о юридическом лице, содержащиеся в ЕГРЮЛ, не связанных с внесением изменений в учредительные документы'),
('13200', 'Представление сведений об учете юридического лица в налоговом органе'),
('14201', 'Внесение в ЕГРЮЛ сведений о прекращении деятельности юридического лица в связи с его ликвидацией по решению учредителей (участников) или органа юридического лица'),
('13300', 'Представление сведений о регистрации юридического лица в качестве страхователя в территориальном органе Пенсионного фонда Российской Федерации'),
('13301', 'Представление сведений о регистрации юридического лица в качестве страхователя в Социальном фонде Российской Федерации (обязательное пенсионное страхование)'),
('13400', 'Представление сведений о регистрации юридического лица в качестве страхователя в исполнительном органе Фонда социального страхования Российской Федерации'),
('13401', 'Представление сведений о регистрации юридического лица в качестве страхователя в Социальном фонде Российской Федерации (обязательное социальное страхование)'),
('13700', 'Принятие судом решения о дисквалификации лица имеющего право без доверенности действовать от имени юридического лица'),
('14202', 'Внесение в ЕГРЮЛ сведений о прекращении деятельности юридического лица в связи с его ликвидацией по решению суда'),
('14203', 'Прекращение юридического лица (ликвидация юридического лица в связи с завершением конкурсного производства в деле о несостоятельности (банкротстве))'),
('14304', 'Внесение в ЕГРЮЛ сведений о прекращении деятельности юридического лица при реорганизации в форме присоединения'),
('14404', 'Прекращение юридического лица (исключение из ЕГРЮЛ недействующего юридического лица)'),
('15101', 'Внесение изменений в сведения о юридическом лице, содержащиеся в Едином государственном реестре юридических лиц, в связи ошибками, допущенными регистрирующим органом');

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
