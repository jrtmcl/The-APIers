function calculateProfit(betAmount, americanOdds) {
    if (americanOdds > 0) {
        return betAmount * (americanOdds / 100);
    } else {
        return betAmount * (100 / Math.abs(americanOdds));
    }
}

function calculatePayout(betAmount, americanOdds) {
    return betAmount + calculateProfit(betAmount, americanOdds);
}

module.exports = {
    calculateProfit,
    calculatePayout
};