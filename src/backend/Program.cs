using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration["Postgres:ConnectionString"]
    ?? throw new InvalidOperationException("Нет строки подключения Postgres:ConnectionString");

builder.Services.AddNpgsqlDataSource(connectionString);
builder.Services.AddSingleton<BkiConsentStore>();
builder.Services.AddSingleton<PortalSchema>();
builder.Services.AddHttpClient(PurposeHandoff.HttpClientName, client =>
{
    client.Timeout = TimeSpan.FromSeconds(3);
});

var app = builder.Build();

app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

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

// TEMPORARY test route, delete after Andrey has seen it.
app.MapGet("/test/registries/{inn}", async (string inn, NpgsqlDataSource dataSource) =>
{
    string? ogrn = null;
    string? ogrnip = null;

    await using (var command = dataSource.CreateCommand(
        """
        select ogrn
        from egrul.legal_entities
        where inn = @inn
        """))
    {
        command.Parameters.AddWithValue("inn", inn);
        await using var reader = await command.ExecuteReaderAsync();
        if (await reader.ReadAsync())
            ogrn = reader.GetString(0).Trim();
    }

    await using (var command = dataSource.CreateCommand(
        """
        select ogrnip
        from egrip.entrepreneurs
        where inn = @inn
        """))
    {
        command.Parameters.AddWithValue("inn", inn);
        await using var reader = await command.ExecuteReaderAsync();
        if (await reader.ReadAsync())
            ogrnip = reader.GetString(0).Trim();
    }

    // Own inn wins: a legal entity, otherwise an entrepreneur.
    // A 12-digit inn can belong to a founder. Take that company's ogrn only when this inn has none of its own.
    if (ogrn is null && ogrnip is null && inn.Length == 12)
    {
        await using var command = dataSource.CreateCommand(
            """
            select le.ogrn
            from egrul.founders f
            join egrul.legal_entities le on le.ogrn = f.ogrn
            where f.founder_type = 'PERSON'
              and f.inn = @inn
            """);
        command.Parameters.AddWithValue("inn", inn);
        await using var reader = await command.ExecuteReaderAsync();
        if (await reader.ReadAsync())
            ogrn = reader.GetString(0).Trim();
    }

    var registryOgrn = ogrn;
    var registryOgrnip = ogrn is null ? ogrnip : null;

    var bankruptcy = new List<object>();
    var pledges = new List<object>();
    string? fedresursMissing = null;
    var arbitrationCases = new List<object>();
    string? arbitrationMissing = null;
    var bkiRows = new List<object>();
    string? bkiMissing = null;
    var fnsOrganizations = new List<object>();
    var fnsEntrepreneurs = new List<object>();
    string? fnsMissing = null;

    async Task<bool> SchemaExists(string schema)
    {
        await using var command = dataSource.CreateCommand(
            """
            select 1
            from information_schema.schemata
            where schema_name = @schema
            """);
        command.Parameters.AddWithValue("schema", schema);
        return await command.ExecuteScalarAsync() is not null;
    }

    async Task<bool> TableExists(string schema, string table)
    {
        await using var command = dataSource.CreateCommand(
            """
            select 1
            from information_schema.tables
            where table_schema = @schema
              and table_name = @table
            """);
        command.Parameters.AddWithValue("schema", schema);
        command.Parameters.AddWithValue("table", table);
        return await command.ExecuteScalarAsync() is not null;
    }

    static string? Text(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal).Trim();

    static string? DateText(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetFieldValue<DateOnly>(ordinal).ToString("yyyy-MM-dd");

    static decimal? Money(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetDecimal(ordinal);

    static int? Whole(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);

    if (!await SchemaExists("fedresurs"))
    {
        fedresursMissing = "schema fedresurs";
    }
    else
    {
        var fedresursNotes = new List<string>();
        if (!await TableExists("fedresurs", "bankruptcy_messages"))
            fedresursNotes.Add("table fedresurs.bankruptcy_messages");
        else if (registryOgrn is not null || registryOgrnip is not null)
        {
            await using var command = dataSource.CreateCommand(
                """
                select number, case_number, procedure_type, procedure_active, court_decision_type, ogrn, ogrnip
                from fedresurs.bankruptcy_messages
                where (@ogrn is not null and ogrn = @ogrn)
                   or (@ogrnip is not null and ogrnip = @ogrnip)
                """);
            command.Parameters.Add(new NpgsqlParameter("ogrn", NpgsqlDbType.Text) { Value = (object?)registryOgrn ?? DBNull.Value });
            command.Parameters.Add(new NpgsqlParameter("ogrnip", NpgsqlDbType.Text) { Value = (object?)registryOgrnip ?? DBNull.Value });
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                bankruptcy.Add(new
                {
                    number = Text(reader, 0),
                    caseNumber = Text(reader, 1),
                    procedureType = Text(reader, 2),
                    procedureActive = reader.IsDBNull(3) ? (bool?)null : reader.GetBoolean(3),
                    courtDecisionType = Text(reader, 4),
                    ogrn = Text(reader, 5),
                    ogrnip = Text(reader, 6)
                });
            }
        }

        if (!await TableExists("fedresurs", "pledge_notices"))
            fedresursNotes.Add("table fedresurs.pledge_notices");
        else if (registryOgrn is not null || registryOgrnip is not null)
        {
            await using var command = dataSource.CreateCommand(
                """
                select number, contract_number, pledge_active, ogrn, ogrnip
                from fedresurs.pledge_notices
                where (@ogrn is not null and ogrn = @ogrn)
                   or (@ogrnip is not null and ogrnip = @ogrnip)
                """);
            command.Parameters.Add(new NpgsqlParameter("ogrn", NpgsqlDbType.Text) { Value = (object?)registryOgrn ?? DBNull.Value });
            command.Parameters.Add(new NpgsqlParameter("ogrnip", NpgsqlDbType.Text) { Value = (object?)registryOgrnip ?? DBNull.Value });
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                pledges.Add(new
                {
                    number = Text(reader, 0),
                    contractNumber = Text(reader, 1),
                    pledgeActive = reader.GetBoolean(2),
                    ogrn = Text(reader, 3),
                    ogrnip = Text(reader, 4)
                });
            }
        }

        if (fedresursNotes.Count > 0)
            fedresursMissing = string.Join("; ", fedresursNotes);
    }

    if (!await SchemaExists("arbitration"))
    {
        arbitrationMissing = "schema arbitration";
    }
    else if (!await TableExists("arbitration", "cases") || !await TableExists("arbitration", "participants"))
    {
        arbitrationMissing = "table arbitration.cases or arbitration.participants";
    }
    else if (registryOgrn is not null || registryOgrnip is not null)
    {
        await using var command = dataSource.CreateCommand(
            """
            select c.case_number, c.status_code, c.claim_amount, c.registration_date, p.role_code, p.ogrn, p.ogrnip
            from arbitration.cases c
            join arbitration.participants p on p.case_id = c.case_id
            where (@ogrn is not null and p.ogrn = @ogrn)
               or (@ogrnip is not null and p.ogrnip = @ogrnip)
            """);
        command.Parameters.Add(new NpgsqlParameter("ogrn", NpgsqlDbType.Text) { Value = (object?)registryOgrn ?? DBNull.Value });
        command.Parameters.Add(new NpgsqlParameter("ogrnip", NpgsqlDbType.Text) { Value = (object?)registryOgrnip ?? DBNull.Value });
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            arbitrationCases.Add(new
            {
                caseNumber = Text(reader, 0),
                statusCode = Text(reader, 1),
                claimAmount = reader.IsDBNull(2) ? (decimal?)null : reader.GetDecimal(2),
                registrationDate = reader.IsDBNull(3) ? null : reader.GetFieldValue<DateOnly>(3).ToString("yyyy-MM-dd"),
                roleCode = Text(reader, 4),
                ogrn = Text(reader, 5),
                ogrnip = Text(reader, 6)
            });
        }
    }

    try
    {
        if (!await SchemaExists("bki"))
        {
            bkiMissing = "schema bki";
        }
        else if (!await TableExists("bki", "obligations"))
        {
            bkiMissing = "table bki.obligations";
        }
        else
        {
            await using var command = dataSource.CreateCommand(
                """
                select subject_inn, deal_uid, debt_overdue_sum, miss_duration, debt_sum, obligation_sum, schedule_code
                from bki.obligations
                where subject_inn = @inn
                """);
            command.Parameters.AddWithValue("inn", inn);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                bkiRows.Add(new
                {
                    subjectInn = Text(reader, 0),
                    dealUid = Text(reader, 1),
                    debtOverdueSum = reader.GetDecimal(2),
                    missDuration = reader.GetInt32(3),
                    debtSum = reader.GetDecimal(4),
                    obligationSum = reader.GetDecimal(5),
                    scheduleCode = Text(reader, 6)
                });
            }
        }
    }
    catch (PostgresException)
    {
        bkiRows.Clear();
        bkiMissing ??= "schema bki";
    }

    try
    {
        if (!await SchemaExists("fns"))
        {
            fnsMissing = "schema fns";
        }
        else
        {
            var fnsNotes = new List<string>();
            if (!await TableExists("fns", "v_org_card"))
            {
                fnsNotes.Add("view fns.v_org_card");
            }
            else
            {
                await using var command = dataSource.CreateCommand(
                    """
                    select inn, headcount_date, employee_count, revexp_date, revenue, expenses, profit,
                           paid_taxes_date, paid_taxes_total, arrears_date, arrears_total,
                           offences_date, offences_fine, special_regimes,
                           has_disqualified_manager, has_bailiff_debt, no_reporting_over_year
                    from fns.v_org_card
                    where inn = @inn
                    """);
                command.Parameters.AddWithValue("inn", inn);
                await using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    fnsOrganizations.Add(new
                    {
                        inn = Text(reader, 0),
                        headcountDate = DateText(reader, 1),
                        employeeCount = Whole(reader, 2),
                        revexpDate = DateText(reader, 3),
                        revenue = Money(reader, 4),
                        expenses = Money(reader, 5),
                        profit = Money(reader, 6),
                        paidTaxesDate = DateText(reader, 7),
                        paidTaxesTotal = Money(reader, 8),
                        arrearsDate = DateText(reader, 9),
                        arrearsTotal = Money(reader, 10),
                        offencesDate = DateText(reader, 11),
                        offencesFine = Money(reader, 12),
                        specialRegimes = Text(reader, 13),
                        hasDisqualifiedManager = reader.GetBoolean(14),
                        hasBailiffDebt = reader.GetBoolean(15),
                        noReportingOverYear = reader.GetBoolean(16)
                    });
                }
            }

            if (!await TableExists("fns", "v_entrepreneur_card"))
            {
                fnsNotes.Add("view fns.v_entrepreneur_card");
            }
            else
            {
                await using var command = dataSource.CreateCommand(
                    """
                    select inn, ogrnip, regimes_date, special_regimes
                    from fns.v_entrepreneur_card
                    where inn = @inn
                       or (@ogrnip is not null and ogrnip = @ogrnip)
                    """);
                command.Parameters.AddWithValue("inn", inn);
                command.Parameters.Add(new NpgsqlParameter("ogrnip", NpgsqlDbType.Text) { Value = (object?)ogrnip ?? DBNull.Value });
                await using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    fnsEntrepreneurs.Add(new
                    {
                        inn = Text(reader, 0),
                        ogrnip = Text(reader, 1),
                        regimesDate = DateText(reader, 2),
                        specialRegimes = Text(reader, 3)
                    });
                }
            }

            if (fnsNotes.Count > 0)
                fnsMissing = string.Join("; ", fnsNotes);
        }
    }
    catch (PostgresException)
    {
        fnsOrganizations.Clear();
        fnsEntrepreneurs.Clear();
        fnsMissing ??= "schema fns";
    }

    return Results.Ok(new
    {
        inn,
        ogrn,
        ogrnip,
        fedresurs = new
        {
            bankruptcy,
            pledges,
            missing = fedresursMissing
        },
        arbitration = new
        {
            cases = arbitrationCases,
            missing = arbitrationMissing
        },
        bki = new
        {
            rows = bkiRows,
            missing = bkiMissing
        },
        fns = new
        {
            organizations = fnsOrganizations,
            entrepreneurs = fnsEntrepreneurs,
            missing = fnsMissing
        }
    });
});

app.MapGet("/businesses/{registrationId}", async (string registrationId, NpgsqlDataSource dataSource) =>
{
    var isLegalEntity = registrationId.Length == 13 && registrationId.All(char.IsDigit);
    var isEntrepreneur = registrationId.Length == 15 && registrationId.All(char.IsDigit);
    if (!isLegalEntity && !isEntrepreneur)
        return Results.BadRequest(new { error = "registrationId must be a 13-digit OGRN or a 15-digit OGRNIP" });

    static string? Text(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal).Trim();

    static string? DateText(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetFieldValue<DateOnly>(ordinal).ToString("yyyy-MM-dd");

    static string RegionCore(string? regionName)
    {
        if (string.IsNullOrWhiteSpace(regionName))
            return "";
        var value = regionName.Trim();
        if (value.StartsWith("Г.", StringComparison.OrdinalIgnoreCase))
            return value[2..].Trim();
        if (value.StartsWith("Г ", StringComparison.OrdinalIgnoreCase))
            return value[2..].Trim();
        return value;
    }

    static bool IsLiquidated(string? statusName, string? terminationCode) =>
        !string.IsNullOrWhiteSpace(terminationCode)
        || (statusName?.Contains("ликвидац", StringComparison.OrdinalIgnoreCase) ?? false);

    string? inn = null;
    string? name = null;
    string? registrationDate = null;
    string? status = null;
    string? terminationCode = null;
    string? regionName = null;
    string? settlementName = null;
    string? streetName = null;
    string? house = null;

    if (isLegalEntity)
    {
        await using var command = dataSource.CreateCommand(
            """
            select inn, short_name, ogrn_date, status_name, termination_code,
                   region_name, settlement_name, street_name, building_number
            from egrul.legal_entities
            where ogrn = @id
            """);
        command.Parameters.AddWithValue("id", registrationId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return Results.NotFound();

        inn = Text(reader, 0);
        name = Text(reader, 1);
        registrationDate = DateText(reader, 2);
        status = Text(reader, 3);
        terminationCode = Text(reader, 4);
        regionName = Text(reader, 5);
        settlementName = Text(reader, 6);
        streetName = Text(reader, 7);
        house = Text(reader, 8);
    }
    else
    {
        await using var command = dataSource.CreateCommand(
            """
            select inn, last_name, first_name, middle_name, ogrnip_date, status_name, termination_code,
                   region_name, settlement_name, street_name, building_number
            from egrip.entrepreneurs
            where ogrnip = @id
            """);
        command.Parameters.AddWithValue("id", registrationId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return Results.NotFound();

        inn = Text(reader, 0);
        var lastName = Text(reader, 1);
        var firstName = Text(reader, 2);
        var middleName = Text(reader, 3);
        name = string.Join(" ", new[] { lastName, firstName, middleName }.Where(part => !string.IsNullOrWhiteSpace(part)));
        registrationDate = DateText(reader, 4);
        status = Text(reader, 5);
        terminationCode = Text(reader, 6);
        regionName = Text(reader, 7);
        settlementName = Text(reader, 8);
        streetName = Text(reader, 9);
        house = Text(reader, 10);
    }

    var liquidated = IsLiquidated(status, terminationCode);

    object business = isLegalEntity
        ? new
        {
            kind = "legal_entity",
            ogrn = registrationId,
            inn,
            name,
            registrationDate,
            status,
            liquidated
        }
        : new
        {
            kind = "entrepreneur",
            ogrnip = registrationId,
            inn,
            name,
            registrationDate,
            status,
            liquidated
        };

    object msp = new Dictionary<string, object?>();
    await using (var command = dataSource.CreateCommand(
        isLegalEntity
            ? """
              select category_code, newly_created, employee_count
              from msp.subjects
              where org_ogrn = @id
              """
            : """
              select category_code, newly_created, employee_count
              from msp.subjects
              where person_ogrnip = @id
              """))
    {
        command.Parameters.AddWithValue("id", registrationId);
        await using var reader = await command.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            var newlyCreated = Text(reader, 1);
            msp = new
            {
                inRegistry = true,
                categoryCode = Text(reader, 0),
                newBusiness = newlyCreated == "1",
                headcount = reader.IsDBNull(2) ? (int?)null : reader.GetInt32(2)
            };
        }
    }

    decimal? arrearsTotal = null;
    decimal? revenue = null;
    string? revenueDate = null;
    decimal? expenses = null;
    int? employeeCount = null;
    string? employeeCountDate = null;
    var disqualified = false;
    var hasBailiffDebt = false;
    if (isLegalEntity)
    {
        var orgCardFound = false;
        await using (var command = dataSource.CreateCommand(
            """
            select arrears_total, has_disqualified_manager, has_bailiff_debt,
                   revenue, revexp_date, expenses, employee_count, headcount_date
            from fns.v_org_card
            where inn = @inn
            """))
        {
            command.Parameters.AddWithValue("inn", inn!);
            await using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                orgCardFound = true;
                arrearsTotal = reader.IsDBNull(0) ? null : reader.GetDecimal(0);
                disqualified = reader.GetBoolean(1);
                hasBailiffDebt = reader.GetBoolean(2);
                revenue = reader.IsDBNull(3) ? null : reader.GetDecimal(3);
                revenueDate = DateText(reader, 4);
                expenses = reader.IsDBNull(5) ? null : reader.GetDecimal(5);
                employeeCount = reader.IsDBNull(6) ? null : reader.GetInt32(6);
                employeeCountDate = DateText(reader, 7);
            }
        }

        if (!orgCardFound)
        {
            await using (var command = dataSource.CreateCommand(
                """
                select sum(i.total_amount)
                from fns.tax_arrear_items i
                join fns.tax_arrears t on t.doc_id = i.doc_id
                where t.inn = @inn
                  and t.state_date = (select max(x.state_date) from fns.tax_arrears x where x.inn = @inn)
                """))
            {
                command.Parameters.AddWithValue("inn", inn!);
                var total = await command.ExecuteScalarAsync();
                if (total is decimal amount)
                    arrearsTotal = amount;
            }

            await using (var command = dataSource.CreateCommand(
                """
                select exists (
                    select 1
                    from fns.orgs_with_disqualified
                    where inn = @inn
                )
                """))
            {
                command.Parameters.AddWithValue("inn", inn!);
                disqualified = await command.ExecuteScalarAsync() is true;
            }

            await using (var command = dataSource.CreateCommand(
                """
                select has_bailiff_debt
                from fns.debt_and_reporting_flags
                where inn = @inn
                order by state_date desc
                limit 1
                """))
            {
                command.Parameters.AddWithValue("inn", inn!);
                var flag = await command.ExecuteScalarAsync();
                hasBailiffDebt = flag is true;
            }
        }
    }

    var massLeader = false;
    var massFounder = false;
    if (isLegalEntity)
    {
        await using (var command = dataSource.CreateCommand(
            """
            select exists (
                select 1
                from fns.mass_leaders ml
                join egrul.directors d on d.inn = ml.inn
                where d.ogrn = @ogrn
                  and ml.inn is not null
            )
            """))
        {
            command.Parameters.AddWithValue("ogrn", registrationId);
            massLeader = await command.ExecuteScalarAsync() is true;
        }

        await using (var command = dataSource.CreateCommand(
            """
            select exists (
                select 1
                from fns.mass_founders mf
                join egrul.founders f on f.inn = mf.inn
                where f.ogrn = @ogrn
                  and f.founder_type = 'PERSON'
                  and mf.inn is not null
            )
            """))
        {
            command.Parameters.AddWithValue("ogrn", registrationId);
            massFounder = await command.ExecuteScalarAsync() is true;
        }
    }
    else
    {
        await using (var command = dataSource.CreateCommand(
            """
            select exists (
                select 1
                from fns.mass_leaders
                where inn = @inn
            )
            """))
        {
            command.Parameters.AddWithValue("inn", inn!);
            massLeader = await command.ExecuteScalarAsync() is true;
        }

        await using (var command = dataSource.CreateCommand(
            """
            select exists (
                select 1
                from fns.mass_founders
                where inn = @inn
            )
            """))
        {
            command.Parameters.AddWithValue("inn", inn!);
            massFounder = await command.ExecuteScalarAsync() is true;
        }
    }

    var massAddress = false;
    await using (var command = dataSource.CreateCommand(
        """
        select exists (
            select 1
            from fns.mass_addresses a
            where @street is not null
              and @house is not null
              and strpos(upper(a.street), upper(btrim(@street))) > 0
              and upper(btrim(a.house)) = upper(btrim(@house))
              and (
                    (a.city is null and @regionCore is not null and btrim(@regionCore) <> ''
                        and strpos(upper(a.region), upper(btrim(@regionCore))) > 0)
                 or (a.city is not null and @settlement is not null
                        and strpos(upper(a.city), upper(btrim(@settlement))) > 0)
              )
        )
        """))
    {
        command.Parameters.Add(new NpgsqlParameter("street", NpgsqlDbType.Text) { Value = (object?)streetName ?? DBNull.Value });
        command.Parameters.Add(new NpgsqlParameter("house", NpgsqlDbType.Text) { Value = (object?)house ?? DBNull.Value });
        command.Parameters.Add(new NpgsqlParameter("regionCore", NpgsqlDbType.Text) { Value = RegionCore(regionName) });
        command.Parameters.Add(new NpgsqlParameter("settlement", NpgsqlDbType.Text) { Value = (object?)settlementName ?? DBNull.Value });
        massAddress = await command.ExecuteScalarAsync() is true;
    }

    var fns = new
    {
        arrearsTotal,
        revenue,
        revenueDate,
        expenses,
        employeeCount,
        employeeCountDate,
        disqualified,
        massLeader,
        massFounder,
        massAddress,
        hasBailiffDebt,
        accountBlocked = (bool?)null
    };

    var bankruptcyActive = false;
    string? procedureType = null;
    await using (var command = dataSource.CreateCommand(
        isLegalEntity
            ? """
              select procedure_type, procedure_active
              from fedresurs.bankruptcy_messages
              where ogrn = @id
              order by date_publish desc
              """
            : """
              select procedure_type, procedure_active
              from fedresurs.bankruptcy_messages
              where ogrnip = @id
              order by date_publish desc
              """))
    {
        command.Parameters.AddWithValue("id", registrationId);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var active = !reader.IsDBNull(1) && reader.GetBoolean(1);
            if (!active)
                continue;
            bankruptcyActive = true;
            procedureType ??= Text(reader, 0);
        }
    }

    var pledgeActive = false;
    await using (var command = dataSource.CreateCommand(
        isLegalEntity
            ? """
              select coalesce(bool_or(pledge_active), false)
              from fedresurs.pledge_notices
              where ogrn = @id
              """
            : """
              select coalesce(bool_or(pledge_active), false)
              from fedresurs.pledge_notices
              where ogrnip = @id
              """))
    {
        command.Parameters.AddWithValue("id", registrationId);
        pledgeActive = await command.ExecuteScalarAsync() is true;
    }

    var openDefendantCases = 0;
    decimal openClaimSum = 0;
    await using (var command = dataSource.CreateCommand(
        isLegalEntity
            ? """
              select count(*)::int, coalesce(sum(claim_amount), 0)
              from (
                  select distinct c.case_id, c.claim_amount
                  from arbitration.cases c
                  join arbitration.participants p on p.case_id = c.case_id
                  where c.status_code = 'open'
                    and p.role_code = 'defendant'
                    and p.ogrn = @id
              ) open_cases
              """
            : """
              select count(*)::int, coalesce(sum(claim_amount), 0)
              from (
                  select distinct c.case_id, c.claim_amount
                  from arbitration.cases c
                  join arbitration.participants p on p.case_id = c.case_id
                  where c.status_code = 'open'
                    and p.role_code = 'defendant'
                    and p.ogrnip = @id
              ) open_cases
              """))
    {
        command.Parameters.AddWithValue("id", registrationId);
        await using var reader = await command.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            openDefendantCases = reader.GetInt32(0);
            openClaimSum = reader.GetDecimal(1);
        }
    }

    var holders = new List<(string Inn, List<string> Roles)>();
    var holderIndex = new Dictionary<string, int>();

    void AddHolder(string holderInn, string role)
    {
        if (!holderIndex.TryGetValue(holderInn, out var index))
        {
            index = holders.Count;
            holderIndex[holderInn] = index;
            holders.Add((holderInn, []));
        }

        if (!holders[index].Roles.Contains(role))
            holders[index].Roles.Add(role);
    }

    if (inn is not null)
        AddHolder(inn, isLegalEntity ? "company" : "entrepreneur");

    if (isLegalEntity)
    {
        await using (var command = dataSource.CreateCommand(
            """
            select inn
            from egrul.directors
            where ogrn = @ogrn
            order by director_no
            """))
        {
            command.Parameters.AddWithValue("ogrn", registrationId);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var directorInn = Text(reader, 0);
                if (directorInn is not null)
                    AddHolder(directorInn, "director");
            }
        }

        await using (var command = dataSource.CreateCommand(
            """
            select inn
            from egrul.founders
            where ogrn = @ogrn
              and founder_type = 'PERSON'
              and inn is not null
            order by founder_no
            """))
        {
            command.Parameters.AddWithValue("ogrn", registrationId);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var founderInn = Text(reader, 0);
                if (founderInn is not null)
                    AddHolder(founderInn, "founder");
            }
        }
    }

    var obligationsByInn = new Dictionary<string, List<(decimal DebtOverdueSum, int MissDuration, decimal DebtSum, decimal ObligationSum, string? ScheduleCode)>>();
    if (holders.Count > 0)
    {
        await using var command = dataSource.CreateCommand(
            """
            select subject_inn, debt_overdue_sum, miss_duration, debt_sum, obligation_sum, schedule_code
            from bki.obligations
            where subject_inn = any(@inns)
            """);
        command.Parameters.Add(new NpgsqlParameter("inns", NpgsqlDbType.Array | NpgsqlDbType.Text)
        {
            Value = holders.Select(holder => holder.Inn).ToArray()
        });
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var subjectInn = Text(reader, 0);
            if (subjectInn is null)
                continue;
            if (!obligationsByInn.TryGetValue(subjectInn, out var rows))
            {
                rows = [];
                obligationsByInn[subjectInn] = rows;
            }
            rows.Add((
                reader.GetDecimal(1),
                reader.GetInt32(2),
                reader.GetDecimal(3),
                reader.GetDecimal(4),
                Text(reader, 5)));
        }
    }

    var bki = new List<object>();
    var overdue = false;
    foreach (var holder in holders)
    {
        if (!obligationsByInn.TryGetValue(holder.Inn, out var rows))
            continue;
        object whose = holder.Roles.Count == 1 ? holder.Roles[0] : holder.Roles;
        foreach (var row in rows)
        {
            bki.Add(new
            {
                inn = holder.Inn,
                whose,
                debtOverdueSum = row.DebtOverdueSum,
                missDuration = row.MissDuration,
                debtSum = row.DebtSum,
                obligationSum = row.ObligationSum,
                scheduleCode = row.ScheduleCode
            });
            if (row.DebtOverdueSum > 0)
                overdue = true;
        }
    }

    return Results.Ok(new
    {
        business,
        msp,
        fns,
        fedresurs = new
        {
            bankruptcyActive,
            procedureType,
            pledgeActive
        },
        arbitration = new
        {
            openDefendantCases,
            openClaimSum
        },
        bki,
        statement = (object?)null,
        stops = new
        {
            liquidated,
            overdue,
            accountBlocked = (bool?)null
        }
    });
});

// Point table of this portal, checked 2026-10-23. Not an Alfa-Bank coefficient set.
// This route always reads BKI. Application scoring calls the same table with the bureau omitted.
app.MapGet("/businesses/{registrationId}/score", async (string registrationId, NpgsqlDataSource dataSource) =>
    (await BusinessScore.CalculateAsync(dataSource, registrationId, includeBki: true)).ToResult());

// BKI consent checkbox. The page keeps one socket open and sends {"checked": true|false} on every click.
// The last value is kept per connection; it is never part of the application body. /score does not read it yet.
app.Map("/bki-consent", async (HttpContext context, BkiConsentStore store, NpgsqlDataSource dataSource, PortalSchema portal, ILogger<Program> logger) =>
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new { error = "open this path with a WebSocket client: ws://host:8080/bki-consent" });
        return;
    }

    const int maxMessageBytes = 4096;

    static bool TryReadChecked(byte[] json, out bool value)
    {
        value = false;
        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind == JsonValueKind.Object
                && document.RootElement.TryGetProperty("checked", out var property)
                && property.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                value = property.GetBoolean();
                return true;
            }
        }
        catch (JsonException)
        {
        }
        return false;
    }

    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    var connectionId = store.Open();
    var aborted = context.RequestAborted;

    Task Send(object message) => socket.SendAsync(
        JsonSerializer.SerializeToUtf8Bytes(message, JsonSerializerOptions.Web),
        WebSocketMessageType.Text,
        endOfMessage: true,
        aborted);

    try
    {
        await Send(new { connectionId, @checked = (bool?)null, changedAt = (DateTimeOffset?)null });

        var buffer = new byte[1024];
        while (socket.State == WebSocketState.Open)
        {
            using var message = new MemoryStream();
            WebSocketReceiveResult result;
            do
            {
                result = await socket.ReceiveAsync(buffer, aborted);
                if (result.MessageType != WebSocketMessageType.Close)
                    message.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage && result.MessageType != WebSocketMessageType.Close && message.Length <= maxMessageBytes);

            if (result.MessageType == WebSocketMessageType.Close)
            {
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                break;
            }

            if (message.Length > maxMessageBytes)
            {
                await socket.CloseAsync(WebSocketCloseStatus.MessageTooBig, "message is larger than 4 KB", CancellationToken.None);
                break;
            }

            if (result.MessageType != WebSocketMessageType.Text || !TryReadChecked(message.ToArray(), out var isChecked))
            {
                await Send(new { error = "expected {\"checked\": true} or {\"checked\": false}" });
                continue;
            }

            var state = store.Set(connectionId, isChecked);
            await ApplicationConsent.PersistClickAsync(dataSource, portal, store.ApplicationsOf(connectionId), connectionId, state);
            logger.LogInformation("BKI consent {ConnectionId}: checked={Checked}", connectionId, isChecked);
            await Send(new { connectionId, @checked = state.Checked, changedAt = state.ChangedAt });
        }
    }
    catch (OperationCanceledException)
    {
    }
    catch (WebSocketException)
    {
        // The page closed without a close frame (tab closed, network lost).
    }
    finally
    {
        store.Close(connectionId);
    }
});

// Client application. The body has no BKI checkbox; it comes over /bki-consent.
// This request stores the form and asks ML to search goods. No registry reads and no points.
app.MapPost("/applications", async (
    ApplicationRequest? request,
    NpgsqlDataSource dataSource,
    PortalSchema portal,
    BkiConsentStore consent,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration) =>
{
    if (request is null)
        return Results.BadRequest(new { error = "body must be a JSON object with purpose, amount, termMonths, inn and registrationId" });

    var purpose = request.Purpose?.Trim();
    var inn = request.Inn?.Trim();
    var registrationId = request.RegistrationId?.Trim();

    var problems = new List<string>();
    if (string.IsNullOrEmpty(purpose))
        problems.Add("purpose is required");
    else if (purpose.Length > 1000)
        problems.Add("purpose must be at most 1000 characters");
    if (request.Amount is not { } amount || amount <= 0)
        problems.Add("amount must be a positive number of roubles");
    else if (amount != decimal.Round(amount, 2) || amount >= 10_000_000_000_000m)
        problems.Add("amount must have at most 2 decimal places and at most 13 integer digits");
    if (request.TermMonths is not > 0)
        problems.Add("termMonths must be a positive whole number of months");
    if (inn is null || inn.Length is not (10 or 12) || !inn.All(char.IsAsciiDigit))
        problems.Add("inn must be 10 or 12 digits");
    if (registrationId is null || registrationId.Length is not (13 or 15) || !registrationId.All(char.IsAsciiDigit))
        problems.Add("registrationId must be a 13-digit OGRN or a 15-digit OGRNIP");
    if (request.AnnualRevenue is { } revenue && !IsDeclaredMoney(revenue))
        problems.Add("annualRevenue must be a non-negative number of roubles with at most 2 decimal places");
    if (request.Obligations is { } obligations && !IsDeclaredMoney(obligations))
        problems.Add("obligations must be a non-negative number of roubles with at most 2 decimal places");
    if (request.Employees is < 0 or > 1_000_000)
        problems.Add("employees must be a whole number from 0 to 1000000");
    problems.AddRange(DocumentProblems(request.Documents));
    if (problems.Count > 0)
        return Results.BadRequest(new { error = string.Join("; ", problems) });

    await portal.EnsureAsync();

    await using var command = dataSource.CreateCommand(
        """
        insert into portal.applications (
            purpose, amount, term_months, inn, registration_id, annual_revenue, obligations, employees, documents)
        values (
            @purpose, @amount, @termMonths, @inn, @registrationId, @annualRevenue, @obligations, @employees, @documents)
        returning id, step, submitted_at
        """);
    command.Parameters.AddWithValue("purpose", purpose!);
    command.Parameters.AddWithValue("amount", request.Amount!.Value);
    command.Parameters.AddWithValue("termMonths", request.TermMonths!.Value);
    command.Parameters.AddWithValue("inn", inn!);
    command.Parameters.AddWithValue("registrationId", registrationId!);
    command.Parameters.Add(new NpgsqlParameter("annualRevenue", NpgsqlDbType.Numeric) { Value = (object?)request.AnnualRevenue ?? DBNull.Value });
    command.Parameters.Add(new NpgsqlParameter("obligations", NpgsqlDbType.Numeric) { Value = (object?)request.Obligations ?? DBNull.Value });
    command.Parameters.Add(new NpgsqlParameter("employees", NpgsqlDbType.Integer) { Value = (object?)request.Employees ?? DBNull.Value });
    var markedDocuments = request.Documents?
        .Select(item => new { name = item.Name!.Trim(), kind = item.Kind!.Trim() })
        .ToArray();
    command.Parameters.Add(new NpgsqlParameter("documents", NpgsqlDbType.Jsonb)
    {
        Value = markedDocuments is { Length: > 0 }
            ? JsonSerializer.Serialize(markedDocuments, JsonSerializerOptions.Web)
            : DBNull.Value
    });
    await using var reader = await command.ExecuteReaderAsync();
    await reader.ReadAsync();

    var number = reader.GetInt64(0);
    var step = reader.GetString(1);
    var submittedAt = reader.GetFieldValue<DateTimeOffset>(2);
    await reader.CloseAsync();
    await ApplicationConsent.BindLatestAsync(dataSource, portal, consent, number);
    await PurposeHandoff.SendAsync(dataSource, httpClientFactory, configuration, number, purpose!, request.Amount!.Value);
    return Results.Created($"/applications/{number}", new
    {
        number,
        purpose,
        amount = request.Amount.Value,
        termMonths = request.TermMonths.Value,
        inn,
        registrationId,
        step,
        stepTitle = ApplicationSteps.Title(step),
        submittedAt
    });
});

ApplicationRoutes.Map(app);

app.Run();

static bool IsDeclaredMoney(decimal value) =>
    value >= 0 && value == decimal.Round(value, 2) && value < 10_000_000_000_000m;

static List<string> DocumentProblems(DeclaredDocument[]? documents)
{
    var problems = new List<string>();
    if (documents is null)
        return problems;
    if (documents.Length > 20)
        problems.Add("documents must contain at most 20 items");
    for (var index = 0; index < documents.Length; index++)
    {
        var name = documents[index].Name?.Trim();
        var kind = documents[index].Kind?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > 200)
            problems.Add($"documents[{index}].name must be 1 to 200 characters");
        if (string.IsNullOrEmpty(kind) || kind.Length > 200)
            problems.Add($"documents[{index}].kind must be 1 to 200 characters");
    }
    return problems;
}

// Last BKI checkbox event of every open /bki-consent connection. Checked is null until the first click.
sealed class BkiConsentStore
{
    private readonly ConcurrentDictionary<Guid, BkiConsentState> connections = new();
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<long, byte>> bindings = new();

    public Guid Open()
    {
        var connectionId = Guid.NewGuid();
        connections[connectionId] = new BkiConsentState(null, null, DateTimeOffset.UtcNow);
        return connectionId;
    }

    public BkiConsentState Set(Guid connectionId, bool isChecked)
    {
        var opened = connections.TryGetValue(connectionId, out var previous)
            ? previous.OpenedAt
            : DateTimeOffset.UtcNow;
        var state = new BkiConsentState(isChecked, DateTimeOffset.UtcNow, opened);
        connections[connectionId] = state;
        return state;
    }

    public BkiConsentState? Get(Guid connectionId) =>
        connections.TryGetValue(connectionId, out var state) ? state : null;

    public void Bind(Guid connectionId, long applicationId)
    {
        var set = bindings.GetOrAdd(connectionId, _ => new ConcurrentDictionary<long, byte>());
        set[applicationId] = 0;
    }

    public long[] ApplicationsOf(Guid connectionId) =>
        bindings.TryGetValue(connectionId, out var set) ? set.Keys.ToArray() : [];

    // A connection that has been clicked beats one that has only been opened.
    public (Guid ConnectionId, BkiConsentState State)? Latest()
    {
        Guid? bestId = null;
        BkiConsentState? best = null;
        foreach (var (id, state) in connections)
        {
            if (best is null || Prefer(state, best))
            {
                bestId = id;
                best = state;
            }
        }

        return bestId is { } chosen && best is not null ? (chosen, best) : null;

        static bool Prefer(BkiConsentState candidate, BkiConsentState current)
        {
            if (candidate.ChangedAt is not null && current.ChangedAt is null)
                return true;
            if (candidate.ChangedAt is null && current.ChangedAt is not null)
                return false;
            var candidateAt = candidate.ChangedAt ?? candidate.OpenedAt;
            var currentAt = current.ChangedAt ?? current.OpenedAt;
            return candidateAt > currentAt;
        }
    }

    public void Close(Guid connectionId)
    {
        connections.TryRemove(connectionId, out _);
        bindings.TryRemove(connectionId, out _);
    }
}

sealed record BkiConsentState(bool? Checked, DateTimeOffset? ChangedAt, DateTimeOffset OpenedAt);

sealed record ApplicationRequest(
    string? Purpose,
    decimal? Amount,
    int? TermMonths,
    string? Inn,
    string? RegistrationId,
    decimal? AnnualRevenue = null,
    decimal? Obligations = null,
    int? Employees = null,
    DeclaredDocument[]? Documents = null);

sealed record DeclaredDocument(string? Name, string? Kind);

// Tracking steps the client sees. Titles match the tracker screen.
static class ApplicationSteps
{
    public const string Submitted = "submitted";

    public static string Title(string step) => step switch
    {
        Submitted => "Заявка подана",
        "registryCheck" => "Проверка ФНС и БКИ",
        "scoring" => "Кредитный скоринг",
        "decision" => "Решение банка",
        _ => step
    };
}

// Applications live in schema portal of the same database. It is created on first use,
// so the backend still starts while Postgres is not up yet.
sealed class PortalSchema(NpgsqlDataSource dataSource)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private volatile bool ready;

    public async Task EnsureAsync()
    {
        if (ready)
            return;

        await gate.WaitAsync();
        try
        {
            if (ready)
                return;

            await using var command = dataSource.CreateCommand(
                """
                create schema if not exists portal;

                create table if not exists portal.applications (
                    id bigint generated always as identity primary key,
                    purpose text not null,
                    amount numeric(15, 2) not null,
                    term_months integer not null,
                    inn varchar(12) not null,
                    registration_id varchar(15) not null,
                    step text not null default 'submitted',
                    submitted_at timestamptz not null default now(),
                    constraint ck_applications_purpose check (length(purpose) between 1 and 1000),
                    constraint ck_applications_amount check (amount > 0),
                    constraint ck_applications_term check (term_months > 0),
                    constraint ck_applications_inn check (inn ~ '^([0-9]{10}|[0-9]{12})$'),
                    constraint ck_applications_registration check (registration_id ~ '^([0-9]{13}|[0-9]{15})$'),
                    constraint ck_applications_step check (step in ('submitted', 'registryCheck', 'scoring', 'decision'))
                );

                alter table portal.applications
                    add column if not exists bki_connection_id uuid,
                    add column if not exists bki_checked boolean,
                    add column if not exists bki_checked_at timestamptz,
                    add column if not exists registry_checked_at timestamptz,
                    add column if not exists msp_snapshot jsonb,
                    add column if not exists fedresurs_snapshot jsonb,
                    add column if not exists arbitration_snapshot jsonb,
                    add column if not exists fns_snapshot jsonb,
                    add column if not exists bki_snapshot jsonb,
                    add column if not exists bki_read boolean,
                    add column if not exists score_json jsonb,
                    add column if not exists score_total integer,
                    add column if not exists score_decision text,
                    add column if not exists scored_at timestamptz,
                    add column if not exists product_code text,
                    add column if not exists max_amount numeric(15, 2),
                    add column if not exists subsidized_available boolean,
                    add column if not exists msp_category text,
                    add column if not exists ordinary_max_amount numeric(15, 2),
                    add column if not exists counter_amount numeric(15, 2),
                    add column if not exists counter_term_months integer,
                    add column if not exists counter_product_code text,
                    add column if not exists employee_decision text,
                    add column if not exists employee_reason text,
                    add column if not exists employee_decided_at timestamptz,
                    add column if not exists statement_consent boolean,
                    add column if not exists purpose_category jsonb,
                    add column if not exists purpose_handoff_ok boolean,
                    add column if not exists purpose_handoff_error text,
                    add column if not exists annual_revenue numeric(15, 2),
                    add column if not exists obligations numeric(15, 2),
                    add column if not exists employees integer;

                alter table portal.applications drop constraint if exists ck_applications_annual_revenue;
                alter table portal.applications
                    add constraint ck_applications_annual_revenue
                    check (annual_revenue is null or annual_revenue >= 0);
                alter table portal.applications drop constraint if exists ck_applications_obligations;
                alter table portal.applications
                    add constraint ck_applications_obligations
                    check (obligations is null or obligations >= 0);
                alter table portal.applications drop constraint if exists ck_applications_employees;
                alter table portal.applications
                    add constraint ck_applications_employees
                    check (employees is null or employees >= 0);

                alter table portal.applications
                    add column if not exists documents jsonb;

                alter table portal.applications
                    drop constraint if exists ck_applications_employee_decision;
                alter table portal.applications
                    add constraint ck_applications_employee_decision
                    check (employee_decision is null or employee_decision in ('approve', 'review', 'reject'));

                create table if not exists portal.information_requests (
                    id bigint generated always as identity primary key,
                    application_id bigint not null references portal.applications (id),
                    question text not null,
                    answer text,
                    asked_at timestamptz not null default now(),
                    answered_at timestamptz,
                    constraint ck_request_question check (char_length(question) between 1 and 2000),
                    constraint ck_request_answer check (answer is null or char_length(answer) between 1 and 2000)
                );

                create table if not exists portal.statement_months (
                    application_id bigint not null references portal.applications (id),
                    month date not null,
                    incoming numeric(15, 2) not null,
                    outgoing numeric(15, 2) not null,
                    primary key (application_id, month),
                    constraint ck_statement_money check (incoming >= 0 and outgoing >= 0)
                );
                """);
            await command.ExecuteNonQueryAsync();
            ready = true;
        }
        finally
        {
            gate.Release();
        }
    }
}
