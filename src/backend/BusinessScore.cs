using Npgsql;
using NpgsqlTypes;

// Same point table as GET /businesses/{registrationId}/score.
// includeBki false skips the bureau read: no contracts and no overdue stop.
sealed record ScoreComputation(int Status, object? Body, string? Error, string? CategoryCode, bool InMsp)
{
    public static ScoreComputation BadRequest(string error) => new(400, null, error, null, false);

    public static ScoreComputation NotFound() => new(404, null, null, null, false);

    public static ScoreComputation Ok(object body, string? categoryCode, bool inMsp) =>
        new(200, body, null, categoryCode, inMsp);

    public IResult ToResult() => Status switch
    {
        400 => Results.BadRequest(new { error = Error }),
        404 => Results.NotFound(),
        _ => Results.Ok(Body)
    };
}

static class BusinessScore
{
    public static async Task<ScoreComputation> CalculateAsync(
        NpgsqlDataSource dataSource,
        string registrationId,
        bool includeBki)
    {
        var isLegalEntity = registrationId.Length == 13 && registrationId.All(char.IsDigit);
        var isEntrepreneur = registrationId.Length == 15 && registrationId.All(char.IsDigit);
        if (!isLegalEntity && !isEntrepreneur)
            return ScoreComputation.BadRequest("registrationId must be a 13-digit OGRN or a 15-digit OGRNIP");

        static string? Text(NpgsqlDataReader reader, int ordinal) =>
            reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal).Trim();

        static string? DateText(NpgsqlDataReader reader, int ordinal) =>
            reader.IsDBNull(ordinal) ? null : reader.GetFieldValue<DateOnly>(ordinal).ToString("yyyy-MM-dd");

        static bool IsLiquidated(string? statusName, string? terminationCode) =>
            !string.IsNullOrWhiteSpace(terminationCode)
            || (statusName?.Contains("ликвидац", StringComparison.OrdinalIgnoreCase) ?? false);

        static int CompletedMonths(DateOnly from, DateOnly to)
        {
            if (to < from)
                return 0;
            var months = (to.Year - from.Year) * 12 + (to.Month - from.Month);
            if (to.Day < from.Day)
                months--;
            return Math.Max(0, months);
        }

        static string Num(decimal value) => value.ToString(System.Globalization.CultureInfo.InvariantCulture);

        string? registrationDate = null;
        string? status = null;
        string? terminationCode = null;
        string? inn = null;

        if (isLegalEntity)
        {
            await using var command = dataSource.CreateCommand(
                """
                select inn, ogrn_date, status_name, termination_code
                from egrul.legal_entities
                where ogrn = @id
                """);
            command.Parameters.AddWithValue("id", registrationId);
            await using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return ScoreComputation.NotFound();

            inn = Text(reader, 0);
            registrationDate = DateText(reader, 1);
            status = Text(reader, 2);
            terminationCode = Text(reader, 3);
        }
        else
        {
            await using var command = dataSource.CreateCommand(
                """
                select inn, ogrnip_date, status_name, termination_code
                from egrip.entrepreneurs
                where ogrnip = @id
                """);
            command.Parameters.AddWithValue("id", registrationId);
            await using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return ScoreComputation.NotFound();

            inn = Text(reader, 0);
            registrationDate = DateText(reader, 1);
            status = Text(reader, 2);
            terminationCode = Text(reader, 3);
        }

        var liquidated = IsLiquidated(status, terminationCode);

        string? categoryCode = null;
        var inMspRegistry = false;
        var newBusiness = false;
        await using (var command = dataSource.CreateCommand(
            isLegalEntity
                ? """
                  select category_code, newly_created
                  from msp.subjects
                  where org_ogrn = @id
                  """
                : """
                  select category_code, newly_created
                  from msp.subjects
                  where person_ogrnip = @id
                  """))
        {
            command.Parameters.AddWithValue("id", registrationId);
            await using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                inMspRegistry = true;
                categoryCode = Text(reader, 0);
                newBusiness = Text(reader, 1) == "1";
            }
        }

        decimal? arrearsTotal = null;
        if (isLegalEntity)
        {
            var orgCardFound = false;
            await using (var command = dataSource.CreateCommand(
                """
                select arrears_total
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
                }
            }

            if (!orgCardFound)
            {
                await using var command = dataSource.CreateCommand(
                    """
                    select sum(i.total_amount)
                    from fns.tax_arrear_items i
                    join fns.tax_arrears t on t.doc_id = i.doc_id
                    where t.inn = @inn
                      and t.state_date = (select max(x.state_date) from fns.tax_arrears x where x.inn = @inn)
                    """);
                command.Parameters.AddWithValue("inn", inn!);
                var arrearsScalar = await command.ExecuteScalarAsync();
                if (arrearsScalar is decimal amount)
                    arrearsTotal = amount;
            }
        }

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

        decimal openClaimSum = 0;
        await using (var command = dataSource.CreateCommand(
            isLegalEntity
                ? """
                  select coalesce(sum(claim_amount), 0)
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
                  select coalesce(sum(claim_amount), 0)
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
            var sum = await command.ExecuteScalarAsync();
            if (sum is decimal amount)
                openClaimSum = amount;
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

        if (includeBki && inn is not null)
            AddHolder(inn, isLegalEntity ? "company" : "entrepreneur");

        if (includeBki && isLegalEntity)
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

        var obligations = new List<(string Inn, decimal DebtOverdueSum, string? ScheduleCode)>();
        if (includeBki && holders.Count > 0)
        {
            await using var command = dataSource.CreateCommand(
                """
                select subject_inn, debt_overdue_sum, schedule_code
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
                obligations.Add((subjectInn, reader.GetDecimal(1), Text(reader, 2)));
            }
        }

        var overdue = includeBki && obligations.Any(row => row.DebtOverdueSum > 0);
        // The card has no block column and returns null. Null is not a stop.
        bool? accountBlocked = null;

        var fired = new List<string>();
        if (liquidated)
            fired.Add("liquidated");
        if (overdue)
            fired.Add("overdue");
        if (accountBlocked == true)
            fired.Add("accountBlocked");

        var asOf = DateOnly.FromDateTime(DateTime.Now);
        int? ageMonths = null;
        if (DateOnly.TryParse(registrationDate, out var registeredOn))
            ageMonths = CompletedMonths(registeredOn, asOf);

        var agePoints = ageMonths switch
        {
            null => 0,
            < 3 => 0,
            < 9 => 8,
            <= 24 => 14,
            <= 66 => 22,
            <= 108 => 28,
            _ => 34
        };
        var ageDetail = ageMonths is null
            ? "Даты регистрации нет. Балл 0."
            : $"Регистрация {registrationDate}, на {asOf:yyyy-MM-dd} прошло {ageMonths} полных месяцев. Балл {agePoints}.";

        var categoryPoints = categoryCode switch
        {
            "1" => 18,
            "2" => 24,
            "3" => 30,
            _ => 0
        };
        var categoryName = categoryCode switch
        {
            "1" => "микропредприятие",
            "2" => "малое предприятие",
            "3" => "среднее предприятие",
            _ => null
        };
        var categoryDetail = inMspRegistry
            ? $"Код категории {categoryCode ?? "пустой"}{(categoryName is null ? "" : $", {categoryName}")}. Балл {categoryPoints}."
            : "Записи в реестре МСП нет. Балл 0.";

        var newBusinessPoints = newBusiness ? -12 : 0;
        var newBusinessDetail = !inMspRegistry
            ? "Записи реестра МСП нет, признак вновь созданного не читается. Балл 0."
            : newBusiness
                ? "Признак вновь созданного субъекта равен 1. Балл -12."
                : "Признак вновь созданного субъекта не равен 1. Балл 0.";

        var bankruptcyPoints = bankruptcyActive ? -40 : 0;
        var bankruptcyDetail = bankruptcyActive
            ? $"Есть действующая процедура{(string.IsNullOrWhiteSpace(procedureType) ? "" : $" {procedureType}")}. Балл -40."
            : "Действующей процедуры банкротства нет. Балл 0.";

        var pledgePoints = pledgeActive ? -18 : 0;
        var pledgeDetail = pledgeActive
            ? "В Федресурсе есть действующий залог. Это уже установленное обременение, а не залог в пользу этого кредита. Балл -18."
            : "Действующего залога нет. Балл 0.";

        var claimPoints = openClaimSum switch
        {
            <= 0 => 0,
            <= 100_000m => -10,
            <= 1_000_000m => -18,
            _ => -28
        };
        var claimDetail = $"Сумма исков к ответчику по открытым делам {Num(openClaimSum)}. Балл {claimPoints}.";

        static int ScheduleRank(string? code) => code switch
        {
            "3" => 0,
            "1" => 2,
            "2" => 3,
            _ => 1
        };

        string? worstSchedule = null;
        var worstRank = int.MaxValue;
        foreach (var row in obligations)
        {
            var rank = ScheduleRank(row.ScheduleCode);
            if (rank < worstRank)
            {
                worstRank = rank;
                worstSchedule = row.ScheduleCode;
            }
        }

        var schedulePoints = worstSchedule switch
        {
            "2" => 32,
            "1" => 12,
            "3" => -8,
            _ => 0
        };
        var scheduleList = obligations.Count == 0
            ? "договоров нет"
            : string.Join("; ", obligations.Select(row => $"{row.Inn}:{row.ScheduleCode ?? "пусто"}"));
        var scheduleDetail = includeBki
            ? $"Уникальных договоров {obligations.Count} ({scheduleList}). Худший код {worstSchedule ?? "нет"}. Один и тот же договор человека с двумя ролями даёт одну строку и второй раз не суммируется. Балл {schedulePoints}."
            : "Согласия на БКИ нет, договоры не читались. Стоп по текущей просрочке не ставится. Балл 0.";

        var arrearsPoints = arrearsTotal switch
        {
            null => 0,
            0 => 10,
            <= 50_000m => -8,
            _ => -16
        };
        var arrearsDetail = arrearsTotal is null
            ? "Суммы налоговой задолженности нет. Балл 0."
            : $"Сумма налоговой задолженности {Num(arrearsTotal.Value)}. Балл {arrearsPoints}.";

        // The company card has no statement. Application scoring replaces this zero
        // from the turnover saved on the application.
        const int statementPoints = 0;
        var raw = agePoints + categoryPoints + newBusinessPoints + bankruptcyPoints + pledgePoints
            + claimPoints + schedulePoints + arrearsPoints + statementPoints;
        var total = Math.Clamp(raw, 0, 100);

        string decision;
        string reason;
        if (fired.Count > 0)
        {
            decision = "reject";
            var names = string.Join(", ", fired.Select(code => code switch
            {
                "liquidated" => "ликвидация",
                "overdue" => "текущая просрочка в БКИ",
                "accountBlocked" => "блокировка счёта",
                _ => code
            }));
            reason = $"Отказ по стоп-фактору: {names}. Баллы посчитаны отдельно, андеррайтер их видит.";
        }
        else if (total >= 70)
        {
            decision = "approve";
            reason = $"Одобрение: стоп-факторов нет, балл {total} из 100, порог одобрения 70.";
        }
        else
        {
            decision = "review";
            reason = $"Разбор: стоп-факторов нет, балл {total} из 100, это ниже порога 70.";
        }

        var body = new
        {
            asOf = asOf.ToString("yyyy-MM-dd"),
            model = new
            {
                name = "portal-point-table",
                checkedOn = "2026-10-23",
                alfaCoefficients = false
            },
            stops = new
            {
                liquidated,
                overdue,
                accountBlocked,
                fired
            },
            points = new object[]
            {
                new { factor = "businessAge", title = "Возраст бизнеса", points = agePoints, detail = ageDetail },
                new { factor = "mspCategory", title = "Категория МСП", points = categoryPoints, detail = categoryDetail },
                new { factor = "newBusiness", title = "Вновь созданный бизнес", points = newBusinessPoints, detail = newBusinessDetail },
                new { factor = "bankruptcyActive", title = "Действующее банкротство", points = bankruptcyPoints, detail = bankruptcyDetail },
                new { factor = "pledgeActive", title = "Действующий залог", points = pledgePoints, detail = pledgeDetail },
                new { factor = "openClaimSum", title = "Сумма исков к ответчику", points = claimPoints, detail = claimDetail },
                new { factor = "scheduleCode", title = "Код срока платежей", points = schedulePoints, detail = scheduleDetail },
                new { factor = "arrears", title = "Налоговая задолженность", points = arrearsPoints, detail = arrearsDetail },
                new { factor = "statement", title = "Выписка", points = statementPoints, detail = "Выписки нет. Балл 0." }
            },
            total,
            totalBeforeCap = raw,
            decision,
            reason
        };
        return ScoreComputation.Ok(body, categoryCode, inMspRegistry);
    }
}
