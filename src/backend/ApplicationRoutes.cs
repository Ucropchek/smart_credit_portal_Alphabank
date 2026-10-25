using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;
using NpgsqlTypes;

static class ApplicationRoutes
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static void Map(WebApplication app)
    {
        app.MapGet("/applications", ListAsync);
        app.MapPost("/applications/purpose-categories", MatchPurposeAsync);
        app.MapGet("/applications/{number:long}", DetailAsync);
        app.MapGet("/applications/{number:long}/goods", GoodsAsync);
        app.MapPost("/applications/{number:long}/goods", StartGoodsAsync);
        app.MapGet("/applications/{number:long}/requests", ListRequestsAsync);
        app.MapPost("/applications/{number:long}/requests", CreateRequestAsync);
        app.MapPost("/applications/{number:long}/requests/{requestId:long}/answer", AnswerRequestAsync);
        app.MapPost("/applications/{number:long}/statement-consent", StatementConsentAsync);
        app.MapPost("/applications/{number:long}/registry-check", RegistryCheckAsync);
        app.MapPost("/applications/{number:long}/score", ScoreAsync);
        app.MapPost("/applications/{number:long}/decision", DecisionAsync);
    }

    static async Task<IResult> MatchPurposeAsync(JsonElement? body, NpgsqlDataSource dataSource)
    {
        var purpose = ReadText(body, "purpose", "text");
        if (purpose is null)
            return Results.BadRequest(new { error = "purpose is required" });
        if (purpose.Length > 1000)
            return Results.BadRequest(new { error = "purpose must be at most 1000 characters" });

        try
        {
            var matches = await PurposeHandoff.MatchPurposeAsync(dataSource, purpose);
            return Results.Ok(new { matches });
        }
        catch (PostgresException ex) when (ex.SqlState is "3F000" or "42P01")
        {
            return Results.Json(new { error = "goods registry is unavailable" }, statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }

    static async Task<IResult> GoodsAsync(
        long number,
        NpgsqlDataSource dataSource,
        PortalSchema portal,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration)
    {
        await portal.EnsureAsync();
        await using var command = dataSource.CreateCommand("select 1 from portal.applications where id = @id");
        command.Parameters.AddWithValue("id", number);
        if (await command.ExecuteScalarAsync() is null)
            return Results.NotFound(new { error = "application not found" });
        return await PurposeHandoff.ReadGoodsAsync(httpClientFactory, configuration, number);
    }

    static async Task<IResult> StartGoodsAsync(
        long number,
        NpgsqlDataSource dataSource,
        PortalSchema portal,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration)
    {
        await portal.EnsureAsync();
        var form = await LoadFormAsync(dataSource, number);
        if (form is null)
            return Results.NotFound(new { error = "application not found" });
        await PurposeHandoff.SendAsync(dataSource, httpClientFactory, configuration, number, form.Purpose, form.Amount);
        return await PurposeHandoff.ReadGoodsAsync(httpClientFactory, configuration, number);
    }

    static async Task<IResult> ListAsync(NpgsqlDataSource dataSource, PortalSchema portal)
    {
        await portal.EnsureAsync();
        var rows = new List<(long Number, decimal Amount, int TermMonths, string RegistrationId, string Step, string? Decision, int OpenRequestCount)>();
        await using (var command = dataSource.CreateCommand(
            """
            select a.id, a.amount, a.term_months, a.registration_id, a.step, a.employee_decision,
                   (select count(*)::int
                    from portal.information_requests r
                    where r.application_id = a.id and r.answered_at is null)
            from portal.applications a
            order by a.id
            """))
        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                rows.Add((
                    reader.GetInt64(0),
                    reader.GetDecimal(1),
                    reader.GetInt32(2),
                    reader.GetString(3),
                    reader.GetString(4),
                    reader.IsDBNull(5) ? null : reader.GetString(5),
                    reader.GetInt32(6)));
            }
        }

        var names = await BusinessNamesAsync(dataSource, rows.Select(row => row.RegistrationId));
        var list = rows.Select(row =>
        {
            names.TryGetValue(row.RegistrationId, out var business);
            return new
            {
                number = row.Number,
                businessName = business.Name,
                amount = row.Amount,
                termMonths = row.TermMonths,
                step = row.Step,
                stepTitle = ApplicationSteps.Title(row.Step),
                employeeDecision = row.Decision,
                openRequestCount = row.OpenRequestCount
            };
        });
        return Results.Ok(list);
    }

    static async Task<IResult> DetailAsync(long number, HttpRequest request, NpgsqlDataSource dataSource, PortalSchema portal)
    {
        await portal.EnsureAsync();
        var client = string.Equals(request.Query["view"], "client", StringComparison.OrdinalIgnoreCase);
        return await ReadDetailAsync(dataSource, number, client) ?? Results.NotFound(new { error = "application not found" });
    }

    static async Task<IResult> ListRequestsAsync(long number, NpgsqlDataSource dataSource, PortalSchema portal)
    {
        await portal.EnsureAsync();
        if (!await ExistsAsync(dataSource, number))
            return Results.NotFound(new { error = "application not found" });
        return Results.Ok(await OpenRequestsAsync(dataSource, number));
    }

    static async Task<IResult> CreateRequestAsync(long number, JsonElement? body, NpgsqlDataSource dataSource, PortalSchema portal)
    {
        await portal.EnsureAsync();
        if (!await ExistsAsync(dataSource, number))
            return Results.NotFound(new { error = "application not found" });

        var text = ReadText(body, "text", "question");
        if (text is null)
            return Results.BadRequest(new { error = "text is required" });
        if (text.Length is < 1 or > 2000)
            return Results.BadRequest(new { error = "text must be from 1 to 2000 characters" });

        await using var command = dataSource.CreateCommand(
            """
            insert into portal.information_requests (application_id, question)
            values (@applicationId, @question)
            returning id, asked_at
            """);
        command.Parameters.AddWithValue("applicationId", number);
        command.Parameters.AddWithValue("question", text);
        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();
        return Results.Created($"/applications/{number}/requests/{reader.GetInt64(0)}", new
        {
            id = reader.GetInt64(0),
            text,
            askedAt = reader.GetFieldValue<DateTimeOffset>(1),
            open = true
        });
    }

    static async Task<IResult> AnswerRequestAsync(
        long number,
        long requestId,
        JsonElement? body,
        NpgsqlDataSource dataSource,
        PortalSchema portal)
    {
        await portal.EnsureAsync();
        var text = ReadText(body, "text", "answer");
        if (text is null)
            return Results.BadRequest(new { error = "text is required" });
        if (text.Length is < 1 or > 2000)
            return Results.BadRequest(new { error = "text must be from 1 to 2000 characters" });

        string? question = null;
        DateTimeOffset askedAt = default;
        DateTimeOffset? answeredAt = null;
        await using (var command = dataSource.CreateCommand(
            """
            select question, asked_at, answered_at
            from portal.information_requests
            where id = @id and application_id = @applicationId
            """))
        {
            command.Parameters.AddWithValue("id", requestId);
            command.Parameters.AddWithValue("applicationId", number);
            await using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return Results.NotFound(new { error = "request not found" });
            question = reader.GetString(0);
            askedAt = reader.GetFieldValue<DateTimeOffset>(1);
            answeredAt = reader.IsDBNull(2) ? null : reader.GetFieldValue<DateTimeOffset>(2);
        }

        if (answeredAt is not null)
            return Results.Conflict(new { error = "request is already answered" });

        await using var update = dataSource.CreateCommand(
            """
            update portal.information_requests
            set answer = @answer, answered_at = now()
            where id = @id and answered_at is null
            returning answered_at
            """);
        update.Parameters.AddWithValue("id", requestId);
        update.Parameters.AddWithValue("answer", text);
        await using var updated = await update.ExecuteReaderAsync();
        if (!await updated.ReadAsync())
            return Results.Conflict(new { error = "request is already answered" });
        var at = updated.GetFieldValue<DateTimeOffset>(0);

        return Results.Ok(new
        {
            id = requestId,
            text = question,
            answer = text,
            askedAt,
            answeredAt = at,
            open = false
        });
    }

    static async Task<IResult> StatementConsentAsync(long number, JsonElement? body, NpgsqlDataSource dataSource, PortalSchema portal)
    {
        await portal.EnsureAsync();
        if (!await ExistsAsync(dataSource, number))
            return Results.NotFound(new { error = "application not found" });
        if (body is not { ValueKind: JsonValueKind.Object } document)
            return Results.BadRequest(new { error = "body must be a JSON object with consent true or false" });

        var consent = ReadConsent(document);
        if (consent is null)
            return Results.BadRequest(new { error = "consent must be true or false" });

        var months = new List<(DateOnly Month, decimal Incoming, decimal Outgoing)>();
        if (consent.Value)
        {
            if (!TryReadTurnover(document, out months, out var error))
                return Results.BadRequest(new { error });
        }

        await using var connection = await dataSource.OpenConnectionAsync();
        await using var tx = await connection.BeginTransactionAsync();

        await using (var command = new NpgsqlCommand(
            """
            update portal.applications
            set statement_consent = @consent
            where id = @id
            """, connection, tx))
        {
            command.Parameters.AddWithValue("id", number);
            command.Parameters.AddWithValue("consent", consent.Value);
            await command.ExecuteNonQueryAsync();
        }

        await using (var command = new NpgsqlCommand(
            "delete from portal.statement_months where application_id = @id", connection, tx))
        {
            command.Parameters.AddWithValue("id", number);
            await command.ExecuteNonQueryAsync();
        }

        if (consent.Value)
        {
            foreach (var month in months)
            {
                await using var command = new NpgsqlCommand(
                    """
                    insert into portal.statement_months (application_id, month, incoming, outgoing)
                    values (@id, @month, @incoming, @outgoing)
                    """, connection, tx);
                command.Parameters.AddWithValue("id", number);
                command.Parameters.AddWithValue("month", month.Month);
                command.Parameters.AddWithValue("incoming", month.Incoming);
                command.Parameters.AddWithValue("outgoing", month.Outgoing);
                await command.ExecuteNonQueryAsync();
            }
        }

        await tx.CommitAsync();
        return await ReadDetailAsync(dataSource, number, clientView: false)
            ?? Results.NotFound(new { error = "application not found" });
    }

    static async Task<IResult> RegistryCheckAsync(
        long number,
        NpgsqlDataSource dataSource,
        PortalSchema portal,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration)
    {
        await portal.EnsureAsync();
        var form = await LoadFormAsync(dataSource, number);
        if (form is null)
            return Results.NotFound(new { error = "application not found" });

        var includeBki = form.BkiChecked == true;
        var snapshot = await RegistrySnapshot.ReadAsync(dataSource, form.RegistrationId, form.Inn, includeBki);
        await using (var command = dataSource.CreateCommand(
            """
            update portal.applications
            set registry_checked_at = now(),
                msp_snapshot = @msp,
                fedresurs_snapshot = @fedresurs,
                arbitration_snapshot = @arbitration,
                fns_snapshot = @fns,
                bki_snapshot = @bki,
                bki_read = @bkiRead,
                step = case when step in ('scoring', 'decision') then step else 'registryCheck' end
            where id = @id
            """))
        {
            command.Parameters.AddWithValue("id", number);
            command.Parameters.Add(Jsonb("msp", snapshot.MspJson));
            command.Parameters.Add(Jsonb("fedresurs", snapshot.FedresursJson));
            command.Parameters.Add(Jsonb("arbitration", snapshot.ArbitrationJson));
            command.Parameters.Add(Jsonb("fns", snapshot.FnsJson));
            command.Parameters.Add(Jsonb("bki", snapshot.BkiJson));
            command.Parameters.AddWithValue("bkiRead", snapshot.BkiRead);
            await command.ExecuteNonQueryAsync();
        }

        await PurposeHandoff.SendAsync(dataSource, httpClientFactory, configuration, number, form.Purpose, form.Amount);
        return await ReadDetailAsync(dataSource, number, clientView: false)
            ?? Results.NotFound(new { error = "application not found" });
    }

    static async Task<IResult> ScoreAsync(
        long number,
        NpgsqlDataSource dataSource,
        PortalSchema portal,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration)
    {
        await portal.EnsureAsync();
        var form = await LoadFormAsync(dataSource, number);
        if (form is null)
            return Results.NotFound(new { error = "application not found" });
        if (form.EmployeeDecision is not null)
            return Results.Conflict(new { error = "employee decision is already stored" });

        var includeBki = form.BkiChecked == true;
        var score = await BusinessScore.CalculateAsync(dataSource, form.RegistrationId, includeBki);
        if (score.Status != 200 || score.Body is null)
            return score.ToResult();

        var total = ReadTotal(score.Body);
        var offer = ProductOffer.Build(score.InMsp, score.CategoryCode, total, form.Amount, form.TermMonths);
        var statementConsent = await ReadStatementConsentAsync(dataSource, number);
        var turnover = statementConsent == true ? await TurnoverAsync(dataSource, number) : [];
        var scoreNode = JsonNode.Parse(JsonSerializer.Serialize(score.Body, Json));
        if (scoreNode is not null)
            ApplyStatementDetail(scoreNode, StatementScoreDetail(statementConsent, turnover));
        var scoreJson = scoreNode?.ToJsonString(Json) ?? JsonSerializer.Serialize(score.Body, Json);

        await using (var command = dataSource.CreateCommand(
            """
            update portal.applications
            set score_json = @score,
                score_total = @total,
                score_decision = @decision,
                scored_at = now(),
                product_code = @productCode,
                max_amount = @maxAmount,
                subsidized_available = @subsidized,
                msp_category = @mspCategory,
                ordinary_max_amount = @ordinaryMax,
                counter_amount = @counterAmount,
                counter_term_months = @counterTerm,
                counter_product_code = @counterProduct,
                step = 'scoring'
            where id = @id
              and employee_decision is null
            """))
        {
            command.Parameters.AddWithValue("id", number);
            command.Parameters.Add(Jsonb("score", scoreJson));
            command.Parameters.AddWithValue("total", total);
            command.Parameters.AddWithValue("decision", ReadDecision(score.Body));
            command.Parameters.AddWithValue("productCode", offer.Code);
            command.Parameters.AddWithValue("maxAmount", offer.MaxAmount);
            command.Parameters.AddWithValue("subsidized", offer.SubsidizedAvailable);
            command.Parameters.Add(new NpgsqlParameter("mspCategory", NpgsqlDbType.Text)
            {
                Value = (object?)offer.MspCategory ?? DBNull.Value
            });
            command.Parameters.AddWithValue("ordinaryMax", offer.OrdinaryMaxAmount);
            command.Parameters.AddWithValue("counterAmount", offer.CounterAmount);
            command.Parameters.AddWithValue("counterTerm", offer.CounterTermMonths);
            command.Parameters.AddWithValue("counterProduct", offer.CounterProduct);
            var updated = await command.ExecuteNonQueryAsync();
            if (updated == 0)
                return Results.Conflict(new { error = "employee decision is already stored" });
        }

        await PurposeHandoff.SendAsync(dataSource, httpClientFactory, configuration, number, form.Purpose, form.Amount);
        return await ReadDetailAsync(dataSource, number, clientView: false)
            ?? Results.NotFound(new { error = "application not found" });
    }

    static async Task<IResult> DecisionAsync(long number, JsonElement? body, NpgsqlDataSource dataSource, PortalSchema portal)
    {
        await portal.EnsureAsync();
        var form = await LoadFormAsync(dataSource, number);
        if (form is null)
            return Results.NotFound(new { error = "application not found" });
        if (body is not { ValueKind: JsonValueKind.Object } document)
            return Results.BadRequest(new { error = "body must be a JSON object with decision approve, review or reject" });

        var decision = ReadText(document, "decision", "outcome");
        if (decision is not ("approve" or "review" or "reject"))
            return Results.BadRequest(new { error = "decision must be approve, review or reject" });
        if (decision is "approve" or "review" && form.ScoreJson is null)
            return Results.Conflict(new { error = "approve and review require a saved score" });

        string? reason = null;
        if (document.TryGetProperty("reason", out var reasonProperty) && reasonProperty.ValueKind == JsonValueKind.String)
            reason = reasonProperty.GetString();
        if (decision == "reject")
            reason ??= "";

        await using var command = dataSource.CreateCommand(
            """
            update portal.applications
            set employee_decision = @decision,
                employee_reason = @reason,
                employee_decided_at = now(),
                step = 'decision'
            where id = @id
            """);
        command.Parameters.AddWithValue("id", number);
        command.Parameters.AddWithValue("decision", decision);
        command.Parameters.Add(new NpgsqlParameter("reason", NpgsqlDbType.Text) { Value = (object?)reason ?? DBNull.Value });
        await command.ExecuteNonQueryAsync();
        return await ReadDetailAsync(dataSource, number, clientView: false)
            ?? Results.NotFound(new { error = "application not found" });
    }

    static async Task<IResult?> ReadDetailAsync(NpgsqlDataSource dataSource, long number, bool clientView)
    {
        await using var command = dataSource.CreateCommand(
            """
            select purpose, amount, term_months, inn, registration_id, step, submitted_at,
                   bki_checked, bki_checked_at,
                   registry_checked_at,
                   msp_snapshot::text, fedresurs_snapshot::text, arbitration_snapshot::text,
                   fns_snapshot::text, bki_snapshot::text, bki_read,
                   score_json::text,
                   product_code, max_amount, subsidized_available, msp_category, ordinary_max_amount,
                   counter_amount, counter_term_months, counter_product_code,
                   employee_decision, employee_reason, employee_decided_at,
                   statement_consent,
                   purpose_category::text, purpose_handoff_ok, purpose_handoff_error,
                   annual_revenue, obligations, employees,
                   documents::text
            from portal.applications
            where id = @id
            """);
        command.Parameters.AddWithValue("id", number);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return null;

        var purpose = reader.GetString(0);
        var amount = reader.GetDecimal(1);
        var termMonths = reader.GetInt32(2);
        var inn = reader.GetString(3);
        var registrationId = reader.GetString(4);
        var step = reader.GetString(5);
        var submittedAt = reader.GetFieldValue<DateTimeOffset>(6);
        bool? bkiChecked = reader.IsDBNull(7) ? null : reader.GetBoolean(7);
        DateTimeOffset? bkiCheckedAt = reader.IsDBNull(8) ? null : reader.GetFieldValue<DateTimeOffset>(8);
        var registryChecked = !reader.IsDBNull(9);
        var mspJson = NullableText(reader, 10);
        var fedresursJson = NullableText(reader, 11);
        var arbitrationJson = NullableText(reader, 12);
        var fnsJson = NullableText(reader, 13);
        var bkiJson = NullableText(reader, 14);
        var scoreJson = NullableText(reader, 16);
        var productCode = NullableText(reader, 17);
        decimal? maxAmount = reader.IsDBNull(18) ? null : reader.GetDecimal(18);
        bool? subsidized = reader.IsDBNull(19) ? null : reader.GetBoolean(19);
        var mspCategory = NullableText(reader, 20);
        decimal? ordinaryMax = reader.IsDBNull(21) ? null : reader.GetDecimal(21);
        decimal? counterAmount = reader.IsDBNull(22) ? null : reader.GetDecimal(22);
        int? counterTerm = reader.IsDBNull(23) ? null : reader.GetInt32(23);
        var counterProduct = NullableText(reader, 24);
        var employeeDecision = NullableText(reader, 25);
        var employeeReason = reader.IsDBNull(26) ? null : reader.GetString(26);
        DateTimeOffset? employeeDecidedAt = reader.IsDBNull(27) ? null : reader.GetFieldValue<DateTimeOffset>(27);
        bool? statementConsent = reader.IsDBNull(28) ? null : reader.GetBoolean(28);
        var purposeCategory = NullableText(reader, 29);
        bool? handoffOk = reader.IsDBNull(30) ? null : reader.GetBoolean(30);
        var handoffError = NullableText(reader, 31);
        decimal? annualRevenue = reader.IsDBNull(32) ? null : reader.GetDecimal(32);
        decimal? obligations = reader.IsDBNull(33) ? null : reader.GetDecimal(33);
        int? employees = reader.IsDBNull(34) ? null : reader.GetInt32(34);
        var documentsJson = NullableText(reader, 35);
        await reader.CloseAsync();

        var names = await BusinessNamesAsync(dataSource, [registrationId]);
        names.TryGetValue(registrationId, out var business);
        var openRequests = await OpenRequestsAsync(dataSource, number);
        var requests = await RequestsAsync(dataSource, number);
        var turnover = statementConsent == true ? await TurnoverAsync(dataSource, number) : [];

        JsonNode? score = scoreJson is null ? null : JsonNode.Parse(scoreJson);
        if (score is not null)
            ApplyStatementDetail(score, StatementScoreDetail(statementConsent, turnover));
        var hideStops = clientView
            && employeeDecision == "reject"
            && string.IsNullOrEmpty(employeeReason);
        if (hideStops && score is JsonObject scoreObject)
            scoreObject.Remove("stops");

        var detail = new Dictionary<string, object?>
        {
            ["number"] = number,
            ["purpose"] = purpose,
            ["amount"] = amount,
            ["termMonths"] = termMonths,
            ["inn"] = inn,
            ["registrationId"] = registrationId,
            ["step"] = step,
            ["stepTitle"] = ApplicationSteps.Title(step),
            ["submittedAt"] = submittedAt,
            ["business"] = new
            {
                kind = business.Kind,
                registrationId,
                inn,
                name = business.Name
            },
            ["bkiConsent"] = new
            {
                @checked = bkiChecked,
                changedAt = bkiCheckedAt
            },
            ["openRequests"] = openRequests,
            ["requests"] = requests
        };

        if (registryChecked)
        {
            detail["registries"] = new
            {
                msp = ParseNode(mspJson),
                fedresurs = ParseNode(fedresursJson),
                arbitration = ParseNode(arbitrationJson),
                fns = ParseNode(fnsJson),
                bki = bkiJson is null ? null : ParseNode(bkiJson)
            };
        }

        if (statementConsent is not null)
        {
            detail["statement"] = new
            {
                consent = statementConsent,
                turnover
            };
        }

        if (score is not null)
            detail["score"] = score;

        if (productCode is not null && maxAmount is not null && subsidized is not null && ordinaryMax is not null)
        {
            detail["product"] = new
            {
                code = productCode,
                maxAmount,
                subsidizedAvailable = subsidized,
                mspCategory,
                ordinaryCode = ProductOffer.Ordinary,
                ordinaryMaxAmount = ordinaryMax
            };
        }

        if (counterAmount is not null && counterTerm is not null && counterProduct is not null)
        {
            detail["counterOffer"] = new
            {
                amount = counterAmount,
                termMonths = counterTerm,
                product = counterProduct
            };
        }

        if (employeeDecision is not null)
        {
            detail["employeeDecision"] = new
            {
                outcome = employeeDecision,
                reason = employeeReason,
                decidedAt = employeeDecidedAt
            };
        }

        if (annualRevenue is not null || obligations is not null || employees is not null)
        {
            detail["finances"] = new
            {
                annualRevenue,
                obligations,
                employees
            };
        }

        if (documentsJson is not null)
            detail["documents"] = ParseNode(documentsJson);

        if (purposeCategory is not null || handoffOk is not null)
        {
            detail["purposeCategory"] = purposeCategory is null ? null : ParseNode(purposeCategory);
            detail["purposeHandoff"] = new { ok = handoffOk, error = handoffError };
        }

        return Results.Ok(detail);
    }

    static async Task<FormRow?> LoadFormAsync(NpgsqlDataSource dataSource, long number)
    {
        await using var command = dataSource.CreateCommand(
            """
            select purpose, amount, term_months, inn, registration_id, bki_checked,
                   score_json is not null, employee_decision
            from portal.applications
            where id = @id
            """);
        command.Parameters.AddWithValue("id", number);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return null;
        return new FormRow(
            reader.GetString(0),
            reader.GetDecimal(1),
            reader.GetInt32(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetBoolean(5),
            reader.GetBoolean(6) ? "saved" : null,
            NullableText(reader, 7));
    }

    static async Task<bool> ExistsAsync(NpgsqlDataSource dataSource, long number)
    {
        await using var command = dataSource.CreateCommand("select 1 from portal.applications where id = @id");
        command.Parameters.AddWithValue("id", number);
        return await command.ExecuteScalarAsync() is not null;
    }

    static async Task<List<object>> OpenRequestsAsync(NpgsqlDataSource dataSource, long number)
    {
        var rows = new List<object>();
        await using var command = dataSource.CreateCommand(
            """
            select id, question, asked_at
            from portal.information_requests
            where application_id = @id and answered_at is null
            order by id
            """);
        command.Parameters.AddWithValue("id", number);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add(new
            {
                id = reader.GetInt64(0),
                text = reader.GetString(1),
                askedAt = reader.GetFieldValue<DateTimeOffset>(2),
                open = true
            });
        }
        return rows;
    }

    static async Task<List<object>> RequestsAsync(NpgsqlDataSource dataSource, long number)
    {
        var rows = new List<object>();
        await using var command = dataSource.CreateCommand(
            """
            select id, question, answer, asked_at, answered_at
            from portal.information_requests
            where application_id = @id
            order by id
            """);
        command.Parameters.AddWithValue("id", number);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            DateTimeOffset? answeredAt = reader.IsDBNull(4) ? null : reader.GetFieldValue<DateTimeOffset>(4);
            rows.Add(new
            {
                id = reader.GetInt64(0),
                text = reader.GetString(1),
                answer = reader.IsDBNull(2) ? null : reader.GetString(2),
                askedAt = reader.GetFieldValue<DateTimeOffset>(3),
                answeredAt,
                open = answeredAt is null
            });
        }
        return rows;
    }

    static async Task<bool?> ReadStatementConsentAsync(NpgsqlDataSource dataSource, long number)
    {
        await using var command = dataSource.CreateCommand(
            "select statement_consent from portal.applications where id = @id");
        command.Parameters.AddWithValue("id", number);
        var value = await command.ExecuteScalarAsync();
        return value is bool consent ? consent : null;
    }

    static string StatementScoreDetail(bool? consent, IReadOnlyList<TurnoverMonth> months)
    {
        if (consent == true && months.Count > 0)
        {
            var incoming = months.Sum(month => month.Incoming);
            var outgoing = months.Sum(month => month.Outgoing);
            return $"Поступления {Money(incoming)}, списания {Money(outgoing)} за {months.Count} мес. Балл 0.";
        }

        if (consent == false)
            return "Клиент отказался передавать выписку. Балл 0.";
        return "Выписки нет. Балл 0.";
    }

    static string Money(decimal value) => value.ToString(CultureInfo.InvariantCulture);

    static void ApplyStatementDetail(JsonNode score, string detail)
    {
        if (score["points"] is not JsonArray points)
            return;
        foreach (var item in points)
        {
            if (item?["factor"]?.GetValue<string>() == "statement")
                item["detail"] = detail;
        }
    }

    sealed record TurnoverMonth(string Month, decimal Incoming, decimal Outgoing);

    static async Task<List<TurnoverMonth>> TurnoverAsync(NpgsqlDataSource dataSource, long number)
    {
        var rows = new List<TurnoverMonth>();
        await using var command = dataSource.CreateCommand(
            """
            select month, incoming, outgoing
            from portal.statement_months
            where application_id = @id
            order by month
            """);
        command.Parameters.AddWithValue("id", number);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add(new TurnoverMonth(
                reader.GetFieldValue<DateOnly>(0).ToString("yyyy-MM", CultureInfo.InvariantCulture),
                reader.GetDecimal(1),
                reader.GetDecimal(2)));
        }
        return rows;
    }

    static async Task<Dictionary<string, (string? Kind, string? Name)>> BusinessNamesAsync(
        NpgsqlDataSource dataSource,
        IEnumerable<string> registrationIds)
    {
        var map = new Dictionary<string, (string? Kind, string? Name)>();
        var ids = registrationIds.Distinct().ToArray();
        var ogrns = ids.Where(id => id.Length == 13).ToArray();
        var ogrnips = ids.Where(id => id.Length == 15).ToArray();

        if (ogrns.Length > 0)
        {
            await using var command = dataSource.CreateCommand(
                """
                select ogrn, short_name
                from egrul.legal_entities
                where ogrn = any(@ids)
                """);
            command.Parameters.Add(new NpgsqlParameter("ids", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = ogrns });
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                map[reader.GetString(0)] = ("legal_entity", reader.GetString(1).Trim());
        }

        if (ogrnips.Length > 0)
        {
            await using var command = dataSource.CreateCommand(
                """
                select ogrnip, last_name, first_name, middle_name
                from egrip.entrepreneurs
                where ogrnip = any(@ids)
                """);
            command.Parameters.Add(new NpgsqlParameter("ids", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = ogrnips });
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var parts = new[]
                {
                    reader.GetString(1).Trim(),
                    reader.GetString(2).Trim(),
                    reader.IsDBNull(3) ? null : reader.GetString(3).Trim()
                };
                map[reader.GetString(0)] = ("entrepreneur", string.Join(" ", parts.Where(part => !string.IsNullOrWhiteSpace(part))));
            }
        }

        return map;
    }

    static bool? ReadConsent(JsonElement body)
    {
        foreach (var name in new[] { "consent", "yes", "agreed" })
        {
            if (body.TryGetProperty(name, out var property) && property.ValueKind is JsonValueKind.True or JsonValueKind.False)
                return property.GetBoolean();
        }
        return null;
    }

    static bool TryReadTurnover(
        JsonElement body,
        out List<(DateOnly Month, decimal Incoming, decimal Outgoing)> months,
        out string error)
    {
        months = [];
        error = "";
        JsonElement array = default;
        var found = false;
        foreach (var name in new[] { "turnover", "months" })
        {
            if (body.TryGetProperty(name, out array) && array.ValueKind == JsonValueKind.Array)
            {
                found = true;
                break;
            }
        }
        if (!found)
        {
            error = "consent true requires turnover: 6 to 12 months with month, incoming and outgoing";
            return false;
        }

        var seen = new HashSet<DateOnly>();
        foreach (var item in array.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object
                || !item.TryGetProperty("month", out var monthProperty)
                || monthProperty.ValueKind != JsonValueKind.String
                || !TryMonth(monthProperty.GetString(), out var month)
                || !TryMoney(item, "incoming", out var incoming)
                || !TryMoney(item, "outgoing", out var outgoing))
            {
                error = "each turnover row needs month (yyyy-MM), incoming and outgoing";
                return false;
            }
            if (!seen.Add(month))
            {
                error = "turnover months must be unique";
                return false;
            }
            months.Add((month, incoming, outgoing));
        }

        if (months.Count is < 6 or > 12)
        {
            error = "turnover must cover 6 to 12 months";
            return false;
        }
        return true;
    }

    static bool TryMonth(string? text, out DateOnly month)
    {
        month = default;
        if (text is null)
            return false;
        if (DateOnly.TryParseExact(text, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            || DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed))
        {
            month = new DateOnly(parsed.Year, parsed.Month, 1);
            return true;
        }
        return false;
    }

    static bool TryMoney(JsonElement item, string name, out decimal value)
    {
        value = 0;
        if (!item.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.Number)
            return false;
        if (!property.TryGetDecimal(out value) || value < 0)
            return false;
        return value == decimal.Round(value, 2);
    }

    static string? ReadText(JsonElement? body, params string[] names)
    {
        if (body is not { ValueKind: JsonValueKind.Object } document)
            return null;
        foreach (var name in names)
        {
            if (document.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.String)
            {
                var text = property.GetString()?.Trim();
                if (!string.IsNullOrEmpty(text))
                    return text;
            }
        }
        return null;
    }

    static int ReadTotal(object body)
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(body, Json));
        return document.RootElement.GetProperty("total").GetInt32();
    }

    static string ReadDecision(object body)
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(body, Json));
        return document.RootElement.GetProperty("decision").GetString() ?? "";
    }

    static string? NullableText(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);

    static JsonNode? ParseNode(string? json) =>
        json is null ? null : JsonNode.Parse(json);

    static NpgsqlParameter Jsonb(string name, string? json) =>
        new(name, NpgsqlDbType.Jsonb) { Value = (object?)json ?? DBNull.Value };

    sealed record FormRow(
        string Purpose,
        decimal Amount,
        int TermMonths,
        string Inn,
        string RegistrationId,
        bool? BkiChecked,
        string? ScoreJson,
        string? EmployeeDecision);
}
