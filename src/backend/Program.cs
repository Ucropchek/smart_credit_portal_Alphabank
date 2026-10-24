using Npgsql;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration["Postgres:ConnectionString"]
    ?? throw new InvalidOperationException("Нет строки подключения Postgres:ConnectionString");

builder.Services.AddNpgsqlDataSource(connectionString);

var app = builder.Build();

app.MapGet("/", () => Results.Ok(new { service = "smart-credit-api" }));
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/companies/{inn}", async (string inn, NpgsqlDataSource dataSource) =>
{
    var legalEntities = new List<object>();
    await using (var command = dataSource.CreateCommand(
        """
        select
            le.ogrn,
            le.inn,
            le.short_name,
            le.kpp,
            le.opf_full_name,
            le.ogrn_date,
            le.capital_amount,
            le.status_name,
            le.termination_name,
            le.postcode,
            le.region_name,
            le.settlement_kind,
            le.settlement_name,
            le.street_kind,
            le.street_name,
            le.building_kind,
            le.building_number,
            le.premises_kind,
            le.premises_number,
            okved.okved_code,
            okved.okved_name,
            director.last_name,
            director.first_name,
            director.middle_name,
            director.position_name
        from egrul.legal_entities le
        left join lateral (
            select eo.okved_code, o.name as okved_name
            from egrul.entity_okved eo
            join egrul.okved o on o.code = eo.okved_code
            where eo.ogrn = le.ogrn and eo.is_main
            order by case when eo.source = 'APPLICANT' then 0 else 1 end
            limit 1
        ) okved on true
        left join lateral (
            select last_name, first_name, middle_name, position_name
            from egrul.directors
            where ogrn = le.ogrn
            order by director_no
            limit 1
        ) director on true
        where le.inn = @inn
        """))
    {
        command.Parameters.AddWithValue("inn", inn);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            legalEntities.Add(new
            {
                ogrn = Text(reader, "ogrn"),
                inn = Text(reader, "inn"),
                shortName = Text(reader, "short_name"),
                kpp = Text(reader, "kpp"),
                opfFullName = Text(reader, "opf_full_name"),
                ogrnDate = DateText(reader, "ogrn_date"),
                capitalAmount = reader.GetDecimal(reader.GetOrdinal("capital_amount")),
                statusName = Optional(reader, "status_name"),
                terminationName = Optional(reader, "termination_name"),
                address = Address(reader),
                mainOkvedCode = Optional(reader, "okved_code"),
                mainOkvedName = Optional(reader, "okved_name"),
                directorName = PersonName(
                    Optional(reader, "last_name"),
                    Optional(reader, "first_name"),
                    Optional(reader, "middle_name")),
                directorPosition = Optional(reader, "position_name")
            });
        }
    }

    var foundedOrganizations = new List<object>();
    await using (var command = dataSource.CreateCommand(
        """
        select le.ogrn, le.inn, le.short_name, f.share_nominal, f.share_percent
        from egrul.founders f
        join egrul.legal_entities le on le.ogrn = f.ogrn
        where f.founder_type = 'PERSON'
          and f.inn = @inn
        """))
    {
        command.Parameters.AddWithValue("inn", inn);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            foundedOrganizations.Add(new
            {
                ogrn = reader.GetString(0),
                inn = reader.GetString(1),
                shortName = reader.GetString(2),
                shareNominal = reader.GetDecimal(3),
                sharePercent = reader.GetDecimal(4)
            });
        }
    }

    var entrepreneurs = new List<object>();
    await using (var command = dataSource.CreateCommand(
        """
        select ogrnip, inn, last_name, first_name, middle_name
        from egrip.entrepreneurs
        where inn = @inn
        """))
    {
        command.Parameters.AddWithValue("inn", inn);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            entrepreneurs.Add(new
            {
                ogrnip = reader.GetString(0),
                inn = reader.GetString(1),
                lastName = reader.GetString(2),
                firstName = reader.GetString(3),
                middleName = reader.IsDBNull(4) ? (string?)null : reader.GetString(4)
            });
        }
    }

    return Results.Ok(new
    {
        legalEntities,
        foundedOrganizations,
        entrepreneurs
    });
});

app.Run();

static string Text(NpgsqlDataReader reader, string name) =>
    reader.GetString(reader.GetOrdinal(name)).Trim();

static string? Optional(NpgsqlDataReader reader, string name)
{
    var ordinal = reader.GetOrdinal(name);
    return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal).Trim();
}

static string DateText(NpgsqlDataReader reader, string name) =>
    reader.GetDateTime(reader.GetOrdinal(name)).ToString("yyyy-MM-dd");

static string? PersonName(string? lastName, string? firstName, string? middleName)
{
    var name = string.Join(" ", new[] { lastName, firstName, middleName }.Where(part => !string.IsNullOrWhiteSpace(part)));
    return name.Length == 0 ? null : name;
}

static string? Address(NpgsqlDataReader reader)
{
    var parts = new[]
    {
        Optional(reader, "postcode"),
        Optional(reader, "region_name"),
        Place(Optional(reader, "settlement_kind"), Optional(reader, "settlement_name")),
        Place(Optional(reader, "street_kind"), Optional(reader, "street_name")),
        Place(Optional(reader, "building_kind"), Optional(reader, "building_number")),
        Place(Optional(reader, "premises_kind"), Optional(reader, "premises_number"))
    }.Where(part => !string.IsNullOrWhiteSpace(part));
    var address = string.Join(", ", parts);
    return address.Length == 0 ? null : address;
}

static string? Place(string? kind, string? name)
{
    if (string.IsNullOrWhiteSpace(name)) return null;
    return string.IsNullOrWhiteSpace(kind) ? name : $"{kind} {name}";
}
