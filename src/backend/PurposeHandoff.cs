using System.Text;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

// Reads purpose keywords from the goods registry and posts the loan amount plus that JSON to ML.
static class PurposeHandoff
{
    public const string HttpClientName = "ml";

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
            categoryJson = JsonSerializer.Serialize(new { matches }, Json);
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
                    amount,
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

    static async Task<List<object>> MatchAsync(NpgsqlDataSource dataSource, string purpose)
    {
        var text = Normalize(purpose);
        var found = new List<(string Code, string Title, List<string> Hits)>();
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
            var hits = keywords.Where(keyword => text.Contains(Normalize(keyword), StringComparison.Ordinal)).Distinct().ToList();
            if (hits.Count > 0)
                found.Add((code, title, hits));
        }

        return found
            .OrderByDescending(row => row.Hits.Count)
            .ThenBy(row => row.Code, StringComparer.Ordinal)
            .Select(row => (object)new { code = row.Code, title = row.Title, keywords = row.Hits })
            .ToList();
    }

    static string Normalize(string value) =>
        value.ToLowerInvariant().Replace('ё', 'е');

    static string Trim(string message) =>
        message.Length <= 500 ? message : message[..500];
}
