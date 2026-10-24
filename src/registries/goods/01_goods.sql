-- Категории трат обычного бизнес-кредита. Это не реестр поставщиков и не список по 44-ФЗ.
-- Слова лежат здесь, чтобы заявка узнавала цель по тексту, а не по адресу магазина.

DROP SCHEMA IF EXISTS goods CASCADE;
CREATE SCHEMA goods;
SET search_path TO goods;

CREATE TABLE categories (
    code VARCHAR(40) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    keywords TEXT[] NOT NULL,
    CONSTRAINT ck_goods_code CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT ck_goods_keywords CHECK (cardinality(keywords) >= 1)
);

INSERT INTO categories (code, title, keywords) VALUES
    ('equipment', 'Оборудование', ARRAY['оборудован', 'станок', 'станки']),
    ('vehicles', 'Транспорт', ARRAY['автомобил', 'транспорт', 'грузовик', 'погрузчик', 'автобус']),
    ('inventory', 'Товарные запасы', ARRAY['товар', 'запас', 'ассортимент']),
    ('materials', 'Материалы', ARRAY['материал', 'сырь', 'комплектующ']),
    ('commercial-real-estate', 'Коммерческая недвижимость', ARRAY['недвижимост', 'помещен', 'офис', 'склад', 'здание']),
    ('software', 'Программное обеспечение', ARRAY['программ', 'софт', 'лицензи']),
    ('working-capital', 'Оборотные средства', ARRAY['оборотн', 'зарплат', 'кассов']),
    ('renovation', 'Ремонт и модернизация', ARRAY['ремонт', 'модернизац', 'реконструкц']);
