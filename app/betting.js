function calculateWinnings(betAmount, americanOdds) {
    if (americanOdds > 0) {
        return betAmount * (americanOdds / 100);
    } else {
        return betAmount * (100 / Math.abs(americanOdds));
    }
}

function calculatePayout(betAmount, americanOdds) {
    return betAmount + calculateWinnings(betAmount, americanOdds);
}

module.exports = {
    calculateWinnings,
    calculatePayout
};