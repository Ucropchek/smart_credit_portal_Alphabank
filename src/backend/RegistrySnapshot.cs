using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

// Saved MSP, Fedresurs, arbitration and Transparent Business (fns) for one application.
// BKI is loaded only when the caller passes includeBki.
static class RegistrySnapshot
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task<Snapshot> ReadAsync(
        NpgsqlDataSource dataSource,
        string registrationId,
        string applicationInn,
        bool includeBki)
    {
        var isLegalEntity = registrationId.Length == 13;
        string? registryInn = null;
        string? name = null;
        string? regionName = null;
        string? settlementName = null;
        string? streetName = null;
        string? house = null;

        static string? Text(NpgsqlDataReader reader, int ordinal) =>
            reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal).Trim();

        if (isLegalEntity)
        {
            await using var command = dataSource.CreateCommand(
                """
                select inn, short_name, region_name, settlement_name, street_name, building_number
                from egrul.legal_entities
                where ogrn = @id
                """);
            command.Parameters.AddWithValue("id", registrationId);
            await using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                registryInn = Text(reader, 0);
                name = Text(reader, 1);
                regionName = Text(reader, 2);
                settlementName = Text(reader, 3);
                streetName = Text(reader, 4);
                house = Text(reader, 5);
            }
        }
        else
        {
            await using var command = dataSource.CreateCommand(
                """
                select inn, last_name, first_name, middle_name, region_name, settlement_name, street_name, building_number
                from egrip.entrepreneurs
                where ogrnip = @id
                """);
            command.Parameters.AddWithValue("id", registrationId);
            await using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                registryInn = Text(reader, 0);
                name = string.Join(" ", new[] { Text(reader, 1), Text(reader, 2), Text(reader, 3) }
                    .Where(part => !string.IsNullOrWhiteSpace(part)));
                regionName = Text(reader, 4);
                settlementName = Text(reader, 5);
                streetName = Text(reader, 6);
                house = Text(reader, 7);
            }
        }

        var fnsInn = registryInn ?? applicationInn;

        object msp = new { inRegistry = false, categoryCode = (string?)null, categoryName = (string?)null, newBusiness = false, headcount = (int?)null };
        string? categoryCode = null;
        var inMsp = false;
        await using (var command = dataSource.CreateCommand(
            isLegalEntity
                ? """
                  select category_code, category_name, newly_created, employee_count
                  from msp.subjects
                  where org_ogrn = @id
                  """
                : """
                  select category_code, category_name, newly_created, employee_count
                  from msp.subjects
                  where person_ogrnip = @id
                  """))
        {
            command.Parameters.AddWithValue("id", registrationId);
            await using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                inMsp = true;
                categoryCode = Text(reader, 0);
                msp = new
                {
                    inRegistry = true,
                    categoryCode,
                    categoryName = Text(reader, 1),
                    newBusiness = Text(reader, 2) == "1",
                    headcount = reader.IsDBNull(3) ? (int?)null : reader.GetInt32(3)
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
        var massLeader = false;
        var massFounder = false;

        static string? DateText(NpgsqlDataReader reader, int ordinal) =>
            reader.IsDBNull(ordinal) ? null : reader.GetFieldValue<DateOnly>(ordinal).ToString("yyyy-MM-dd");

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
                command.Parameters.AddWithValue("inn", fnsInn);
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
                    command.Parameters.AddWithValue("inn", fnsInn);
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
                    command.Parameters.AddWithValue("inn", fnsInn);
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
                    command.Parameters.AddWithValue("inn", fnsInn);
                    var flag = await command.ExecuteScalarAsync();
                    hasBailiffDebt = flag is true;
                }
            }

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
                command.Parameters.AddWithValue("inn", fnsInn);
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
                command.Parameters.AddWithValue("inn", fnsInn);
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

        object? bki = null;
        if (includeBki)
            bki = await ReadBkiAsync(dataSource, registrationId, fnsInn, isLegalEntity, Text);

        return new Snapshot(
            name,
            isLegalEntity ? "legal_entity" : "entrepreneur",
            inMsp,
            categoryCode,
            JsonSerializer.Serialize(msp, Json),
            JsonSerializer.Serialize(new { bankruptcyActive, procedureType, pledgeActive }, Json),
            JsonSerializer.Serialize(new { openDefendantCases, openClaimSum }, Json),
            JsonSerializer.Serialize(fns, Json),
            includeBki ? JsonSerializer.Serialize(bki, Json) : null,
            includeBki);
    }

    static async Task<List<object>> ReadBkiAsync(
        NpgsqlDataSource dataSource,
        string registrationId,
        string inn,
        bool isLegalEntity,
        Func<NpgsqlDataReader, int, string?> text)
    {
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

        if (!string.IsNullOrEmpty(inn))
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
                    var directorInn = text(reader, 0);
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
                    var founderInn = text(reader, 0);
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
                var subjectInn = text(reader, 0);
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
                    text(reader, 5)));
            }
        }

        var bki = new List<object>();
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
            }
        }

        return bki;
    }

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

    public sealed record Snapshot(
        string? BusinessName,
        string Kind,
        bool InMsp,
        string? CategoryCode,
        string MspJson,
        string FedresursJson,
        string ArbitrationJson,
        string FnsJson,
        string? BkiJson,
        bool BkiRead);
}
