using Npgsql;
using NpgsqlTypes;

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
    var disqualified = false;
    var hasBailiffDebt = false;
    if (isLegalEntity)
    {
        var orgCardFound = false;
        await using (var command = dataSource.CreateCommand(
            """
            select arrears_total, has_disqualified_manager, has_bailiff_debt
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

app.Run();
