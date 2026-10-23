-- Синтетические сообщения Федресурса. ИНН, ОГРН и названия взяты из учебной схемы egrul.
-- Пустая карточка не заводится: строки есть только у двух дел.
-- ООО «Демо-альфа» (1247700099008) и ИП Сорокин (324770009900019) сюда не входят.
-- История A — первое юридическое лицо вставки egrul после пропуска 1247700099008.
-- История B — второе такое лицо. Остальных дел в этой схеме нет.

SET search_path TO fedresurs;

-- История A. Наблюдение открыто и не завершено.
-- ООО «Первая контора», ИНН 7701862572, ОГРН 1177700010014.
-- В ЕГРЮЛ у этого лица нет кода статуса и нет прекращения.
INSERT INTO bankruptcy_messages (
    number, guid, message_type, date_publish, case_number,
    ogrn, ogrnip, inn, bankrupt_name, address, category_id,
    court_decision_type, procedure_type, procedure_active,
    arbitr_manager_type, decision_date, annulment_message_guid, message_text
) VALUES (
    '10000011',
    'a0000001-0812-4001-8001-117770001014',
    'ArbitralDecree',
    TIMESTAMP '2026-08-13 10:00:00',
    'А40-18625/2026',
    '1177700010014',
    NULL,
    '7701862572',
    'Общество с ограниченной ответственностью «Первая контора»',
    '777963, г. Москва, ул. Лесная, д. 67',
    1,
    'Observation',
    'Watching',
    TRUE,
    'Temporary',
    DATE '2026-08-12',
    NULL,
    'Арбитражный суд ввёл процедуру наблюдения. Акт о завершении или прекращении производства не опубликован.'
);

-- История B. Один действующий залог, банкротства нет.
-- ООО «Восточная лавка», ИНН 7801513494, ОГРН 1267800010125.
-- Зарегистрировано 2026-08-20. В ЕГРЮЛ нет кода статуса и нет прекращения.
-- Залогодержатель назван на этом уведомлении и своей строки-дела не имеет.
INSERT INTO pledge_notices (
    number, guid, message_type, xml_ver, date_publish,
    ogrn, ogrnip, inn, full_name, pledge_active,
    publisher_xsi_type, publisher_full_name, publisher_inn, publisher_ogrn,
    contract_number, contract_date, date_of_performance, notice_text
) VALUES (
    '10000021',
    'a0000002-0901-4001-8001-126780001012',
    'CreationRightOfPledge2',
    '1.0',
    TIMESTAMP '2026-09-16 10:00:00',
    '1267800010125',
    NULL,
    '7801513494',
    'ООО «Восточная лавка»',
    TRUE,
    'PublisherInfoCompany',
    'ООО «Восточная лавка»',
    '7801513494',
    '1267800010125',
    'ZL-2026-09',
    DATE '2026-09-15',
    DATE '2027-03-15',
    'Возникновение права залога движимого имущества. Сообщение о прекращении не опубликовано.'
);

INSERT INTO pledge_participants (
    notice_number, role_code, xsi_type, participant_type, guid,
    full_name, inn, participant_ogrn, address, ownership
) VALUES
(
    '10000021',
    'Mortgagor',
    'MessageCompanyWithGuid',
    'Company',
    'a0000002-0901-4001-8002-126780001012',
    'ООО «Восточная лавка»',
    '7801513494',
    '1267800010125',
    '780752, г. Санкт-Петербург, ул. Мира, д. 91',
    100.00
),
(
    '10000021',
    'Mortgagee',
    'MessageCompanyWithGuid',
    'Company',
    'a0000002-0901-4001-8003-502610001082',
    'ООО «Тихая станция»',
    '6154099311',
    '5026100010822',
    '619699, г. Ростов-на-Дону, ул. Лесная, д. 23',
    100.00
);

INSERT INTO pledge_subjects (
    notice_number, guid, identifier, classifier_code, classifier_name, description
) VALUES (
    '10000021',
    'a0000002-0901-4001-8004-010600800001',
    NULL,
    '0106008',
    'Автомобили',
    'Грузовой автомобиль, год выпуска 2019'
);

SELECT 'bankruptcy' AS part, ogrn, ogrnip, procedure_type, procedure_active::text AS active_flag
FROM fedresurs.v_bankruptcy_card
UNION ALL
SELECT 'pledge', ogrn, ogrnip, message_type, pledge_active::text
FROM fedresurs.v_pledge_card;
