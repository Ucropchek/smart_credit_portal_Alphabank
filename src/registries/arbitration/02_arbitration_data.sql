-- Синтетические карточки. ИНН, ОГРН и имена скопированы из учебной схемы egrul.
-- Нет строки — дела нет. Пустых карточек на организацию без дела нет.
-- История A: первое юрлицо вставки egrul, дело открыто, участник — ответчик.
-- История B: второе юрлицо, дело закончено, участник — ответчик.
-- ОГРН 1247700099008 в эту выборку не входит.

SET search_path TO arbitration;

INSERT INTO cases (
    case_id, case_number, registration_date, claim_amount, status_code,
    category_name, court_name, judge_last_name
) VALUES
    (
        'arb-7701862572',
        'А40-99001/25',
        DATE '2025-11-18',
        1250000.00,
        'open',
        'Гражданские',
        'Арбитражный суд города Москвы',
        NULL
    ),
    (
        'arb-7801513494',
        'А56-99002/26',
        DATE '2026-09-02',
        84000.00,
        'finished',
        'Гражданские',
        'Арбитражный суд города Санкт-Петербурга и Ленинградской области',
        NULL
    );

INSERT INTO participants (
    case_id, participant_no, role_code, role_name, participant_name, inn, ogrn, ogrnip
) VALUES
    (
        'arb-7701862572',
        1,
        'defendant',
        'Ответчик',
        'ООО «Первая контора»',
        '7701862572',
        '1177700010014',
        NULL
    ),
    (
        'arb-7801513494',
        1,
        'defendant',
        'Ответчик',
        'ООО «Восточная лавка»',
        '7801513494',
        '1267800010125',
        NULL
    );

SELECT case_number, registration_date, claim_amount, status_code,
       role_code, inn, ogrn, ogrnip
FROM arbitration.v_case_card
ORDER BY registration_date;
