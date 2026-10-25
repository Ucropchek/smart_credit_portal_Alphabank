// Portal product ceilings. Category 1, 2 and 3 change the subsidized cap.
// No MSP row: the subsidized product is unavailable and the ordinary loan remains.
static class ProductOffer
{
    public const string Ordinary = "ordinary";
    public const string Subsidized = "msp-subsidized";

    const decimal OrdinaryCeiling = 30_000_000m;

    static decimal SubsidizedCeiling(string category) => category switch
    {
        "1" => 10_000_000m,
        "2" => 50_000_000m,
        "3" => 200_000_000m,
        _ => 0m
    };

    public static Offer Build(bool inMsp, string? categoryCode, int total, decimal requestedAmount, int requestedTerm)
    {
        var factor = total / 100m;
        var ordinaryMax = decimal.Round(OrdinaryCeiling * factor, 2, MidpointRounding.AwayFromZero);
        var subsidized = inMsp && categoryCode is "1" or "2" or "3";
        var subsidizedMax = subsidized
            ? decimal.Round(SubsidizedCeiling(categoryCode!) * factor, 2, MidpointRounding.AwayFromZero)
            : (decimal?)null;

        var code = subsidized ? Subsidized : Ordinary;
        var max = subsidized ? subsidizedMax!.Value : ordinaryMax;

        string counterProduct;
        decimal counterAmount;
        if (subsidized && requestedAmount <= subsidizedMax)
        {
            counterProduct = Subsidized;
            counterAmount = requestedAmount;
        }
        else if (requestedAmount <= ordinaryMax)
        {
            counterProduct = Ordinary;
            counterAmount = requestedAmount;
        }
        else if (subsidized && subsidizedMax > ordinaryMax)
        {
            counterProduct = Subsidized;
            counterAmount = subsidizedMax.Value;
        }
        else
        {
            counterProduct = Ordinary;
            counterAmount = ordinaryMax;
        }

        return new Offer(
            code,
            max,
            subsidized,
            subsidized ? categoryCode : null,
            ordinaryMax,
            counterAmount,
            requestedTerm,
            counterProduct);
    }

    public sealed record Offer(
        string Code,
        decimal MaxAmount,
        bool SubsidizedAvailable,
        string? MspCategory,
        decimal OrdinaryMaxAmount,
        decimal CounterAmount,
        int CounterTermMonths,
        string CounterProduct);
}
