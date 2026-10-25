from decimal import Decimal

from smart_credit_ml.product_search.extract import extract_page, is_rub, parse_price


def test_parse_price_handles_russian_formats():
    assert parse_price("1 250 000 ₽") == Decimal("1250000")
    assert parse_price("12 990,50 руб.") == Decimal("12990.50")
    assert parse_price(349900) == Decimal("349900")
    assert parse_price("цена по запросу") is None
    assert parse_price(0) is None
    assert parse_price(True) is None


def test_currency_without_code_counts_as_roubles():
    assert is_rub(None)
    assert is_rub("RUB")
    assert not is_rub("USD")


def test_json_ld_product_with_lowest_offer():
    html = """
    <html><head><title>Витрина ВХС-1,5 купить</title>
    <script type="application/ld+json">
    {"@context": "https://schema.org", "@graph": [
      {"@type": "BreadcrumbList"},
      {"@type": "Product", "name": "Холодильная витрина ВХС-1,5",
       "offers": [{"@type": "Offer", "price": "89900", "priceCurrency": "RUB"},
                  {"@type": "Offer", "price": "84 500", "priceCurrency": "RUB"}]}
    ]}
    </script></head>
    <body><h1>Холодильная витрина</h1><p>В наличии</p><script>var x = 1;</script></body></html>
    """
    facts = extract_page(html)
    assert facts.title == "Витрина ВХС-1,5 купить"
    assert facts.product_name == "Холодильная витрина ВХС-1,5"
    assert facts.price == Decimal("84500")
    assert facts.currency == "RUB"
    assert "В наличии" in facts.text
    assert "var x" not in facts.text


def test_aggregate_offer_low_price():
    html = """<script type="application/ld+json">
    {"@type": ["Product"], "name": "Газель Next", "offers": {"@type": "AggregateOffer", "lowPrice": 2890000}}
    </script>"""
    facts = extract_page(html)
    assert facts.price == Decimal("2890000")
    assert facts.currency is None


def test_microdata_and_open_graph_fallbacks():
    microdata = '<div itemscope><span itemprop="name">Печь конвекционная</span><span itemprop="price">145000</span></div>'
    assert extract_page(microdata).price == Decimal("145000")
    assert extract_page(microdata).product_name == "Печь конвекционная"

    og = '<meta property="og:title" content="Кофемашина"><meta property="product:price:amount" content="230000.00">'
    facts = extract_page(og)
    assert facts.price == Decimal("230000.00")
    assert facts.product_name == "Кофемашина"


CATALOG = """
<title>Компьютеры — каталог</title>
<script type="application/ld+json">{"@type": "WebSite", "name": "Магазин"}</script>
<script type="application/ld+json">
{"@type": "ItemList", "itemListElement": [
  {"@type": "ListItem", "position": 1, "item": {"@type": "Product", "name": "ПК Office i3",
     "url": "/card/pc-office-i3", "offers": {"@type": "Offer", "price": 39483, "priceCurrency": "RUB"}}},
  {"@type": "ListItem", "position": 2, "item": {"@type": "Product", "name": "ПК  Gamer\\nRX 580",
     "url": "https://shop.ru/card/pc-gamer", "offers": {"@type": "Offer", "price": "53 282", "priceCurrency": "RUB"}}},
  {"@type": "Product", "name": "Без ссылки", "offers": {"@type": "Offer", "price": 1000}},
  {"@type": "Product", "name": "Без цены", "url": "/card/no-price"}
]}
</script>
<div itemprop="price" content="39483"></div>
"""


def test_item_list_gives_cards_not_a_page_price():
    facts = extract_page(CATALOG)
    assert facts.is_catalog
    assert facts.product_name is None
    assert facts.price is None
    assert [(card.name, card.url, card.price) for card in facts.listed] == [
        ("ПК Office i3", "/card/pc-office-i3", Decimal("39483")),
        ("ПК Gamer RX 580", "https://shop.ru/card/pc-gamer", Decimal("53282")),
    ]


def test_several_top_level_products_are_a_catalog():
    html = """<script type="application/ld+json">[
      {"@type": "Product", "name": "A", "url": "/a", "offers": {"price": 100}},
      {"@type": "Product", "name": "B", "url": "/b", "offers": {"price": 200}}
    ]</script>"""
    facts = extract_page(html)
    assert facts.is_catalog
    assert [card.url for card in facts.listed] == ["/a", "/b"]


def test_product_page_with_related_goods_stays_a_product():
    html = """
    <script type="application/ld+json">{"@type": "Product", "name": "ПК Office i3", "url": "/card/1",
      "offers": {"@type": "Offer", "price": 39483},
      "isRelatedTo": [{"@type": "Product", "name": "Мышь", "offers": {"price": 900}},
                      {"@type": "Product", "name": "Клавиатура", "offers": {"price": 1500}}]}</script>
    <script type="application/ld+json">{"@type": "Product", "name": "ПК Office i3", "url": "/card/1"}</script>
    """
    facts = extract_page(html)
    assert not facts.is_catalog
    assert facts.product_name == "ПК Office i3"
    assert facts.price == Decimal("39483")


def test_microdata_catalog_has_no_page_price():
    html = """
    <div itemscope itemtype="https://schema.org/Product"><span itemprop="price">100</span></div>
    <div itemscope itemtype="https://schema.org/Product"><span itemprop="price">200</span></div>
    """
    facts = extract_page(html)
    assert facts.is_catalog
    assert facts.price is None
    assert facts.listed == ()


def test_broken_json_ld_is_skipped():
    facts = extract_page('<script type="application/ld+json">{not json</script><p>Текст</p>')
    assert facts.price is None
    assert facts.text == "Текст"
