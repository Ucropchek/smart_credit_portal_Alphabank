using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;
using NpgsqlTypes;

// Reads purpose keywords from the goods registry and posts the loan purpose text,
// the amount and the matched categories to ML.
static class PurposeHandoff
{
    public const string HttpClientName = "ml";

    const int MaxEnding = 3;

    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task SendAsync(
        NpgsqlDataSource dataSource,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        long applicationId,
        string purpose,
        decimal amount)
    {
        string? categoryJson = null;
        bool? ok = null;
        string? error = null;

        try
        {
            var alreadySent = await AlreadySentAsync(dataSource, applicationId);
            if (alreadySent)
                return;

            var matches = await MatchAsync(dataSource, purpose);
            categoryJson = JsonSerializer.Serialize(new { purpose, matches }, Json);
            var baseUrl = configuration["Ml:BaseUrl"]?.Trim();
            if (string.IsNullOrEmpty(baseUrl))
            {
                ok = false;
                error = "ML base URL is not configured";
            }
            else
            {
                var payload = JsonSerializer.Serialize(new
                {
                    applicationId,
                    amount,
                    purpose,
                    category = JsonSerializer.Deserialize<JsonElement>(categoryJson)
                }, Json);
                try
                {
                    var client = httpClientFactory.CreateClient(HttpClientName);
                    using var content = new StringContent(payload, Encoding.UTF8, "application/json");
                    using var response = await client.PostAsync(baseUrl, content);
                    if (response.IsSuccessStatusCode)
                    {
                        ok = true;
                    }
                    else
                    {
                        ok = false;
                        error = $"ML POST failed with status {(int)response.StatusCode}";
                    }
                }
                catch (TaskCanceledException)
                {
                    ok = false;
                    error = "ML POST timed out";
                }
                catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException or UriFormatException)
                {
                    ok = false;
                    error = Trim(ex.Message);
                }
            }
        }
        catch (PostgresException ex) when (ex.SqlState is "3F000" or "42P01")
        {
            ok = false;
            error = "goods registry is unavailable";
        }
        catch (Exception ex)
        {
            ok = false;
            error = Trim(ex.GetType().Name + ": " + ex.Message);
        }

        await using var command = dataSource.CreateCommand(
            """
            update portal.applications
            set purpose_category = @category,
                purpose_handoff_ok = @ok,
                purpose_handoff_error = @error
            where id = @id
              and purpose_handoff_ok is distinct from true
            """);
        command.Parameters.AddWithValue("id", applicationId);
        command.Parameters.Add(new NpgsqlParameter("category", NpgsqlDbType.Jsonb)
        {
            Value = (object?)categoryJson ?? DBNull.Value
        });
        command.Parameters.Add(new NpgsqlParameter("ok", NpgsqlDbType.Boolean)
        {
            Value = (object?)ok ?? DBNull.Value
        });
        command.Parameters.Add(new NpgsqlParameter("error", NpgsqlDbType.Text)
        {
            Value = (object?)error ?? DBNull.Value
        });
        await command.ExecuteNonQueryAsync();
    }

    static async Task<bool> AlreadySentAsync(NpgsqlDataSource dataSource, long applicationId)
    {
        await using var command = dataSource.CreateCommand(
            """
            select purpose_handoff_ok
            from portal.applications
            where id = @id
            """);
        command.Parameters.AddWithValue("id", applicationId);
        var value = await command.ExecuteScalarAsync();
        return value is true;
    }

    sealed record Hit(string Keyword, int Start, int End);

    sealed record Row(string Code, string Title, List<Hit> Hits);

    static async Task<List<object>> MatchAsync(NpgsqlDataSource dataSource, string purpose)
    {
        var text = Normalize(purpose);
        var words = Words(text);
        var found = new List<Row>();
        await using var command = dataSource.CreateCommand(
            """
            select code, title, keywords
            from goods.categories
            order by code
            """);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var code = reader.GetString(0);
            var title = reader.GetString(1);
            var keywords = reader.GetFieldValue<string[]>(2);
            var hits = new List<Hit>();
            foreach (var keyword in keywords.Distinct(StringComparer.Ordinal))
            {
                if (TrySpan(text, words, Normalize(keyword), out var start, out var end))
                    hits.Add(new Hit(keyword, start, end));
            }
            if (hits.Count > 0)
                found.Add(new Row(code, title, hits));
        }

        found = DropCovered(found);
        return found
            .OrderByDescending(row => row.Hits.Count)
            .ThenBy(row => row.Code, StringComparer.Ordinal)
            .Select(row => (object)new
            {
                code = row.Code,
                title = row.Title,
                keywords = row.Hits.Select(hit => hit.Keyword).Distinct(StringComparer.Ordinal).ToList()
            })
            .ToList();
    }

    public static Task<List<object>> MatchPurposeAsync(NpgsqlDataSource dataSource, string purpose) =>
        MatchAsync(dataSource, purpose);

    public static async Task<IResult> ReadGoodsAsync(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        long applicationId)
    {
        var root = configuration["Ml:BaseUrl"]?.Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(root))
            return Results.Ok(EmptyGoods("unavailable"));

        try
        {
            var client = httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.GetAsync($"{root}/applications/{applicationId}/goods");
            if (response.StatusCode == HttpStatusCode.NotFound)
                return Results.Ok(EmptyGoods("absent"));
            if (!response.IsSuccessStatusCode)
                return Results.Ok(EmptyGoods("unavailable"));

            await using var stream = await response.Content.ReadAsStreamAsync();
            var node = await JsonNode.ParseAsync(stream);
            return Results.Ok(ProjectGoods(node));
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException or UriFormatException or JsonException)
        {
            return Results.Ok(EmptyGoods("unavailable"));
        }
    }

    static object EmptyGoods(string status) => new { status, categories = Array.Empty<object>() };

    static object ProjectGoods(JsonNode? node)
    {
        var status = Text(node?["status"]);
        if (status is not ("queued" or "running" or "done" or "failed" or "no_categories"))
            return EmptyGoods("unavailable");

        var categories = new List<object>();
        if (node?["results"] is JsonArray results)
        {
            foreach (var entry in results)
            {
                var code = Clip(Text(entry?["code"]), 40);
                var title = Clip(Text(entry?["title"]), 200);
                var search = entry?["search"];
                var offers = ReadOffers(search?["offers"] as JsonArray);
                var overBudget = ReadOffers(search?["overBudget"] as JsonArray);
                if (code.Length == 0 && title.Length == 0 && offers.Count == 0 && overBudget.Count == 0)
                    continue;
                categories.Add(new { code, title, offers, overBudget });
            }
        }

        return new { status, categories };
    }

    static List<object> ReadOffers(JsonArray? rows)
    {
        var offers = new List<object>();
        if (rows is null)
            return offers;
        foreach (var row in rows)
        {
            if (offers.Count == 30)
                break;
            var name = Clip(Text(row?["name"]), 300);
            var url = HttpUrl(Text(row?["url"]));
            var price = Money(row?["priceRub"]);
            if (name.Length == 0 || url is null || price is null)
                continue;
            offers.Add(new { name, url, priceRub = price });
        }
        return offers;
    }

    static string Clip(string? value, int limit)
    {
        var text = value?.Trim() ?? "";
        return text.Length <= limit ? text : text[..limit];
    }

    static string? Text(JsonNode? node)
    {
        if (node is not JsonValue value)
            return null;
        return value.TryGetValue<string>(out var text) ? text : null;
    }

    static decimal? Money(JsonNode? node)
    {
        if (node is null)
            return null;
        try
        {
            using var document = JsonDocument.Parse(node.ToJsonString());
            var element = document.RootElement;
            if (element.ValueKind != JsonValueKind.Number || !element.TryGetDecimal(out var money))
                return null;
            if (money < 0 || money >= 1_000_000_000_000m)
                return null;
            return decimal.Round(money, 2, MidpointRounding.AwayFromZero);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    static string? HttpUrl(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return null;
        if (!Uri.TryCreate(text.Trim(), UriKind.Absolute, out var uri))
            return null;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            return null;
        if (string.IsNullOrEmpty(uri.Host))
            return null;
        return uri.AbsoluteUri;
    }

    // A short category is dropped when every hit sits inside a longer hit of another category.
    static List<Row> DropCovered(List<Row> found)
    {
        return found.Where(item => !item.Hits.All(hit =>
            found.Any(other => other.Code != item.Code && other.Hits.Any(span =>
                span.Start <= hit.Start
                && span.End >= hit.End
                && span.End - span.Start > hit.End - hit.Start)))).ToList();
    }

    static bool TrySpan(string text, List<(int Start, int End)> words, string keyword, out int start, out int end)
    {
        start = 0;
        end = 0;
        var parts = keyword.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0 || words.Count < parts.Length)
            return false;

        for (var i = 0; i <= words.Count - parts.Length; i++)
        {
            var matched = true;
            for (var part = 0; part < parts.Length; part++)
            {
                var word = words[i + part];
                if (!TokenMatches(text, word.Start, word.End, parts[part]))
                {
                    matched = false;
                    break;
                }
            }
            if (!matched)
                continue;
            start = words[i].Start;
            end = words[i + parts.Length - 1].End;
            return true;
        }
        return false;
    }

    // The keyword must start a word. A short grammatical ending is allowed.
    // «зерно» matches «зерна» and does not match «зерноуборочного».
    static bool TokenMatches(string text, int start, int end, string keyword)
    {
        var length = end - start;
        if (keyword.Length == 0 || length < keyword.Length || length - keyword.Length > MaxEnding)
            return false;
        return text.AsSpan(start, keyword.Length).Equals(keyword, StringComparison.Ordinal);
    }

    static List<(int Start, int End)> Words(string text)
    {
        var words = new List<(int Start, int End)>();
        var i = 0;
        while (i < text.Length)
        {
            if (!IsWordChar(text[i]))
            {
                i++;
                continue;
            }
            var start = i;
            while (i < text.Length && IsWordChar(text[i]))
                i++;
            words.Add((start, i));
        }
        return words;
    }

    static bool IsWordChar(char value) => char.IsLetterOrDigit(value) || value == '-';

    static string Normalize(string value) =>
        value.ToLowerInvariant().Replace('ё', 'е');

    static string Trim(string message) =>
        message.Length <= 500 ? message : message[..500];
}
