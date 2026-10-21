var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => Results.Ok(new { service = "smart-credit-api" }));
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();
