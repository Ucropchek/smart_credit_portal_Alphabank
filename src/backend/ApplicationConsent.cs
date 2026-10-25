using Npgsql;
using NpgsqlTypes;

// Binds the latest open /bki-consent socket to an application and writes later clicks.
static class ApplicationConsent
{
    public static async Task BindLatestAsync(
        NpgsqlDataSource dataSource,
        PortalSchema portal,
        BkiConsentStore store,
        long applicationId)
    {
        var latest = store.Latest();
        if (latest is null)
            return;

        var (connectionId, state) = latest.Value;
        store.Bind(connectionId, applicationId);
        await portal.EnsureAsync();
        await WriteAsync(dataSource, [applicationId], connectionId, state, setConnection: true);
    }

    public static async Task PersistClickAsync(
        NpgsqlDataSource dataSource,
        PortalSchema portal,
        long[] applicationIds,
        Guid connectionId,
        BkiConsentState state)
    {
        if (applicationIds.Length == 0)
            return;

        await portal.EnsureAsync();
        await WriteAsync(dataSource, applicationIds, connectionId, state, setConnection: false);
    }

    static async Task WriteAsync(
        NpgsqlDataSource dataSource,
        long[] applicationIds,
        Guid connectionId,
        BkiConsentState state,
        bool setConnection)
    {
        var sql = setConnection
            ? """
              update portal.applications
              set bki_connection_id = @connectionId,
                  bki_checked = @checked,
                  bki_checked_at = @changedAt
              where id = any(@ids)
              """
            : """
              update portal.applications
              set bki_checked = @checked,
                  bki_checked_at = @changedAt
              where id = any(@ids)
                and bki_connection_id = @connectionId
              """;

        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.Add(new NpgsqlParameter("ids", NpgsqlDbType.Array | NpgsqlDbType.Bigint) { Value = applicationIds });
        command.Parameters.Add(new NpgsqlParameter("connectionId", NpgsqlDbType.Uuid) { Value = connectionId });
        command.Parameters.Add(new NpgsqlParameter("checked", NpgsqlDbType.Boolean)
        {
            Value = (object?)state.Checked ?? DBNull.Value
        });
        command.Parameters.Add(new NpgsqlParameter("changedAt", NpgsqlDbType.TimestampTz)
        {
            Value = (object?)state.ChangedAt ?? DBNull.Value
        });
        await command.ExecuteNonQueryAsync();
    }
}
