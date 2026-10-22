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
        select ogrn, inn, short_name
        from egrul.legal_entities
        where inn = @inn
        """))
    {
        command.Parameters.AddWithValue("inn", inn);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            legalEntities.Add(new
            {
                ogrn = reader.GetString(0),
                inn = reader.GetString(1),
                shortName = reader.GetString(2)
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
