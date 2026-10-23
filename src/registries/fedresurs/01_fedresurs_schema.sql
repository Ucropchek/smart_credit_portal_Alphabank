-- Мок Федресурса для кредитного среза. Две части, без связей с egrul, egrip и msp.
-- ЕФРСБ: конверт сообщения и судебный акт, который открывает процедуру.
--   Структура публикации: «Описание структуры публикаций в ЕФРСБ»,
--   https://fedresurs.ru/helps/bankrupt/bContentMessages.pdf
--   (файл открыт 23.10.2026; даты версии на обложке нет).
--   Коды процедуры и типа акта: REST API ЕФРСБ, спецификация 1.4.0 от 19.02.2026,
--   приложения 2 и 4, https://fedresurs.ru/helps/bankrupt/Service_rest_1.4.0.pdf
--   Числовой идентификатор акта совпадает со спецификацией сервиса передачи 1.52
--   от 05.09.2024, раздел 5.1.10.1,
--   https://fedresurs.ru/helps/bankrupt/Service_1.52.pdf
-- Залог движимого имущества: сообщение ЕФРСФДЮЛ CreationRightOfPledge2.
--   Спецификация XML 1.25.1 (изменение 14.12.2023, основа 1.25 от 31.10.2023),
--   https://fedresurs.ru/helps/Sfacts/Messages_from_XML_1.25.1.pdf
-- Суммы залога в этом типе сообщения нет: колонки суммы нет.
-- procedure_active и pledge_active — колонки среза для скоринга, не теги XML.
-- Торги, собрания, отчёты АУ, внесудебное банкротство, лизинг, гарантии,
-- уступка и остальные типы сообщений в этот срез не входят.

DROP SCHEMA IF EXISTS fedresurs CASCADE;
CREATE SCHEMA fedresurs;
SET search_path TO fedresurs;

-- Приложение 4 REST 1.4.0 и раздел 6.8 структуры публикаций. Стадия процедуры.
CREATE TABLE procedure_type (
    code VARCHAR(32) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    CONSTRAINT ck_procedure_code CHECK (code ~ '^[A-Za-z]+$')
);

-- Приложение 2 REST 1.4.0. code — системное имя, id — DecisionType/@ID.
CREATE TABLE court_decision_type (
    code VARCHAR(50) PRIMARY KEY,
    decision_type_id INTEGER NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    is_old BOOLEAN NOT NULL,
    CONSTRAINT ck_decision_code CHECK (code ~ '^[A-Za-z]+$'),
    CONSTRAINT ck_decision_id CHECK (decision_type_id > 0)
);

-- Категории должников, сервис передачи 1.52, раздел «Категории должников».
-- Коды 3, 8, 11 и 21 в PDF разорваны переносом строки и собраны без пробела.
CREATE TABLE bankrupt_category (
    category_id INTEGER PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    CONSTRAINT ck_category_code CHECK (code ~ '^[A-Za-z]+$')
);

-- ArbitrManagerType судебного акта. Латинские значения из структуры публикации, раздел 4.3.
CREATE TABLE arbitr_manager_type (
    code VARCHAR(32) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    CONSTRAINT ck_manager_code CHECK (code ~ '^[A-Za-z]+$')
);

-- Сообщение ЕФРСБ. Ключ дела для скоринга — ogrn или ogrnip.
-- procedure_type — код стадии из списка процедур.
-- procedure_active — процедура этого акта ещё не завершена и не прекращена.
CREATE TABLE bankruptcy_messages (
    number VARCHAR(8) PRIMARY KEY,
    guid CHAR(36) NOT NULL UNIQUE,
    message_type VARCHAR(50) NOT NULL,
    date_publish TIMESTAMP NOT NULL,
    case_number VARCHAR(60),
    ogrn CHAR(13),
    ogrnip CHAR(15),
    inn VARCHAR(12),
    bankrupt_name VARCHAR(1024) NOT NULL,
    address VARCHAR(300) NOT NULL,
    category_id INTEGER NOT NULL REFERENCES bankrupt_category (category_id),
    court_decision_type VARCHAR(50) NOT NULL REFERENCES court_decision_type (code),
    procedure_type VARCHAR(32) REFERENCES procedure_type (code),
    procedure_active BOOLEAN,
    arbitr_manager_type VARCHAR(32) REFERENCES arbitr_manager_type (code),
    decision_date DATE,
    annulment_message_guid CHAR(36),
    message_text TEXT,
    CONSTRAINT ck_b_number CHECK (char_length(number) <= 8),
    CONSTRAINT ck_b_guid CHECK (guid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    CONSTRAINT ck_b_annul_guid CHECK (
        annulment_message_guid IS NULL
        OR annulment_message_guid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
    CONSTRAINT ck_b_type CHECK (message_type ~ '^[A-Za-z0-9]+$'),
    CONSTRAINT ck_b_ogrn CHECK (ogrn IS NULL OR ogrn ~ '^\d{13}$'),
    CONSTRAINT ck_b_ogrnip CHECK (ogrnip IS NULL OR ogrnip ~ '^\d{15}$'),
    CONSTRAINT ck_b_inn CHECK (inn IS NULL OR inn ~ '^\d{10}$' OR inn ~ '^\d{12}$')
);

CREATE INDEX ix_bankruptcy_ogrn ON bankruptcy_messages (ogrn);
CREATE INDEX ix_bankruptcy_ogrnip ON bankruptcy_messages (ogrnip);

-- Уведомление о залоге. Ключ дела — ogrn или ogrnip залогодателя.
-- pledge_active — по этому уведомлению нет последующего прекращения.
-- Суммы в CreationRightOfPledge2 нет.
CREATE TABLE pledge_notices (
    number CHAR(8) PRIMARY KEY,
    guid CHAR(36) NOT NULL UNIQUE,
    message_type VARCHAR(50) NOT NULL,
    xml_ver CHAR(3) NOT NULL,
    date_publish TIMESTAMP NOT NULL,
    ogrn CHAR(13),
    ogrnip CHAR(15),
    inn VARCHAR(12) NOT NULL,
    full_name VARCHAR(1024) NOT NULL,
    pledge_active BOOLEAN NOT NULL,
    publisher_xsi_type VARCHAR(40) NOT NULL,
    publisher_full_name VARCHAR(1024) NOT NULL,
    publisher_inn VARCHAR(255),
    publisher_ogrn CHAR(13),
    contract_number VARCHAR(50),
    contract_date DATE,
    date_of_performance DATE,
    notice_text VARCHAR(8000),
    CONSTRAINT ck_p_number CHECK (char_length(btrim(number)) = 8),
    CONSTRAINT ck_p_guid CHECK (guid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    CONSTRAINT ck_p_type CHECK (message_type ~ '^[A-Za-z0-9]+$'),
    CONSTRAINT ck_p_ver CHECK (xml_ver = '1.0'),
    CONSTRAINT ck_p_ogrn CHECK (ogrn IS NULL OR ogrn ~ '^\d{13}$'),
    CONSTRAINT ck_p_ogrnip CHECK (ogrnip IS NULL OR ogrnip ~ '^\d{15}$'),
    CONSTRAINT ck_p_inn CHECK (inn ~ '^\d{10}$' OR inn ~ '^\d{12}$'),
    CONSTRAINT ck_p_pub_type CHECK (publisher_xsi_type ~ '^[A-Za-z]+$'),
    CONSTRAINT ck_p_pub_ogrn CHECK (publisher_ogrn IS NULL OR publisher_ogrn ~ '^\d{13}$'),
    CONSTRAINT ck_p_contract CHECK (contract_number IS NULL OR char_length(contract_number) <= 50)
);

CREATE INDEX ix_pledge_ogrn ON pledge_notices (ogrn);
CREATE INDEX ix_pledge_ogrnip ON pledge_notices (ogrnip);

-- Mortgagor / Mortgagee. participant_ogrn — номер участника, не ключ скоринга.
CREATE TABLE pledge_participants (
    notice_number CHAR(8) NOT NULL REFERENCES pledge_notices (number) ON DELETE CASCADE,
    role_code VARCHAR(16) NOT NULL,
    xsi_type VARCHAR(40) NOT NULL,
    participant_type VARCHAR(32) NOT NULL,
    guid CHAR(36) NOT NULL,
    full_name VARCHAR(1024) NOT NULL,
    inn VARCHAR(100),
    participant_ogrn CHAR(13),
    address VARCHAR(512),
    ownership NUMERIC(5, 2),
    PRIMARY KEY (notice_number, role_code, guid),
    CONSTRAINT ck_role CHECK (role_code IN ('Mortgagor', 'Mortgagee')),
    CONSTRAINT ck_xsi CHECK (xsi_type ~ '^[A-Za-z]+$'),
    CONSTRAINT ck_ptype CHECK (participant_type ~ '^[A-Za-z]+$'),
    CONSTRAINT ck_pg CHECK (guid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    CONSTRAINT ck_pogrn CHECK (participant_ogrn IS NULL OR participant_ogrn ~ '^\d{13}$'),
    CONSTRAINT ck_paddr CHECK (address IS NULL OR char_length(address) <= 512),
    CONSTRAINT ck_own CHECK (ownership IS NULL OR (ownership >= 0 AND ownership <= 100))
);

-- PledgeSubject. classifier_code — код приложения 4.3 спецификации XML 1.25.1.
CREATE TABLE pledge_subjects (
    notice_number CHAR(8) NOT NULL REFERENCES pledge_notices (number) ON DELETE CASCADE,
    guid CHAR(36) NOT NULL,
    identifier VARCHAR(50),
    classifier_code VARCHAR(7) NOT NULL,
    classifier_name VARCHAR(500) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    PRIMARY KEY (notice_number, guid),
    CONSTRAINT ck_sguid CHECK (guid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    CONSTRAINT ck_sid CHECK (identifier IS NULL OR char_length(identifier) <= 50),
    CONSTRAINT ck_scode CHECK (char_length(classifier_code) BETWEEN 2 AND 7)
);

CREATE VIEW v_bankruptcy_card AS
SELECT
    m.ogrn,
    m.ogrnip,
    m.procedure_type,
    m.procedure_active,
    m.court_decision_type,
    d.decision_type_id,
    m.number,
    m.date_publish,
    m.bankrupt_name
FROM bankruptcy_messages m
JOIN court_decision_type d ON d.code = m.court_decision_type;

CREATE VIEW v_pledge_card AS
SELECT
    n.ogrn,
    n.ogrnip,
    n.pledge_active,
    n.number,
    n.message_type,
    n.full_name,
    n.contract_number,
    n.contract_date
FROM pledge_notices n;

INSERT INTO procedure_type (code, name) VALUES
('FinancialRecovery', 'Финансовое оздоровление'),
('ExternalManagement', 'Внешнее управление'),
('Tender', 'Конкурсное производство'),
('Watching', 'Наблюдение'),
('CitizenAssetsDisposal', 'Реализация имущества гражданина'),
('CitizenDebtRestructuring', 'Реструктуризация долгов гражданина');

INSERT INTO court_decision_type (code, decision_type_id, name, is_old) VALUES
('ExternalManagement', 1, 'о введении внешнего управления', FALSE),
('ChangeCourtAct', 2, 'об отмене или изменении судебных актов', TRUE),
('LegalCaseResume', 3, 'о возобновлении производства по делу о несостоятельности (банкротстве)', FALSE),
('ArbitrManagerApproval', 4, 'об утверждении арбитражного управляющего', FALSE),
('ArbitrManagerRelease', 6, 'об освобождении или отстранении арбитражного управляющего', FALSE),
('Receivership', 7, 'о признании должника банкротом и открытии конкурсного производства', FALSE),
('LegalCaseTermination', 8, 'о прекращении производства по делу', FALSE),
('FinancialRecovery', 9, 'о введении финансового оздоровления', FALSE),
('BankruptcyRefusal', 10, 'об отказе в признании должника банкротом', FALSE),
('Observation', 11, 'о введении наблюдения', FALSE),
('OtherAct', 12, 'Другие судебные акты', FALSE),
('OtherDefinition', 16, 'Другие определения', TRUE),
('ThirdPartyPayoffRequestApproval', 17, 'об удовлетворении заявлений третьих лиц о намерении погасить обязательства должника', FALSE),
('DebtRestructuring', 18, 'о признании обоснованным заявления о признании гражданина банкротом и введении реструктуризации его долгов', FALSE),
('PropertySale', 19, 'о признании гражданина банкротом и введении реализации имущества гражданина', FALSE),
('DebtRestructuringPlan', 20, 'об утверждении плана реструктуризации долгов гражданина', FALSE),
('DebtRestructuringComplete', 21, 'о завершении реструктуризации долгов гражданина', FALSE),
('ArbitrManagerActionsIllegal', 22, 'о признании действий (бездействий) арбитражного управляющего незаконными', FALSE),
('ArbitrManagerLossesRecovery', 23, 'о взыскании с арбитражного управляющего убытков в связи с неисполнением или ненадлежащим исполнением обязанностей', FALSE),
('ObligationsDischargeRefusal', 24, 'о неприменении в отношении гражданина правила об освобождении от исполнения обязательств', FALSE),
('PropertySaleComplete', 25, 'о завершении реализации имущества гражданина', FALSE),
('DeveloperBankruptcy', 26, 'о применении при банкротстве должника правил параграфа «Банкротство застройщиков»', FALSE),
('CaseTransfer', 27, 'о передаче дела на рассмотрение другого арбитражного суда', FALSE),
('LegalCaseEnd', 28, 'о завершении конкурсного производства', FALSE),
('ExtensionProcedure', 29, 'о продлении срока процедуры', FALSE),
('ChangeArbitralDecree', 30, 'об изменении судебного акта', FALSE),
('CancelArbitralDecree', 31, 'об отмене судебного акта', FALSE);

INSERT INTO bankrupt_category (category_id, code, name) VALUES
(1, 'SimpleOrganization', 'Обычная организация'),
(2, 'CityOrganization', 'Градообразующая организация'),
(3, 'AgricultureOrganization', 'Сельскохозяйственная организация'),
(4, 'CreditOrganization', 'Кредитная организация'),
(5, 'OtherOrganization', 'Иная финансовая организация'),
(7, 'StrategicOrganization', 'Стратегическое предприятие и организация'),
(8, 'MonopolyOrganization', 'Субъект естественных монополий'),
(9, 'EnterpreneurPerson', 'Индивидуальный предприниматель'),
(10, 'FarmerPerson', 'Крестьянское (фермерское) хозяйство'),
(11, 'DissolvedBankruptOrganization', 'Ликвидируемый должник'),
(12, 'AbsentBankrupt', 'Отсутствующий должник'),
(21, 'DevelopmentOrganization', 'Застройщик'),
(22, 'SimplePerson', 'Физическое лицо'),
(23, 'PrivatePensionFund', 'Негосударственный пенсионный фонд'),
(24, 'InsuranceOrganization', 'Страховая организация');

INSERT INTO arbitr_manager_type (code, name) VALUES
('Administrative', 'Административный'),
('ActingAdministrative', 'Исполняющий обязанности административного'),
('External', 'Внешний'),
('ActingExternal', 'Исполняющий обязанности внешнего'),
('Temporary', 'Временный'),
('ActingTemporary', 'Исполняющий обязанности временного'),
('Concours', 'Конкурсный'),
('ActingConcours', 'Исполняющий обязанности конкурсного'),
('Financial', 'Финансовый'),
('ActingFinancial', 'Исполняющий обязанности финансового');
